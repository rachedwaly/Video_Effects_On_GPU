import {WebGLContext} from 'webgl'
import {Texture, Matrix} from 'evg'


//metadata
filter.set_name("WebGL_YUV");
filter.set_desc("WebGL graphics generator");
filter.set_version("0.1beta");
filter.set_author("GPAC team");
filter.set_help("This filter provides testing of gpac's WebGL bindings");

//raw video in and out

filter.set_cap({id: "StreamType", value: "Video", inout: true} );
filter.set_cap({id: "CodecID", value: "raw", inout: true} );

filter.set_arg({ name: "depth", desc: "output depth rather than color", type: GF_PROP_BOOL, def: "false"} );

let use_primary = false;
let width=600;
let height=400;
let ipid=null;
let opid=null;
let nb_frames=0;
let pix_fmt = '';
let programs_Info = [null,null];

let gl = null;
let pck_tx = null;
let buffers = null;

let FBOs = null;



let  glob_uni_info = [];


function simple_linear_transformation(name, transformation_matrix) { // res.rgb = transformation_matrix*pxcolor.rgb
  
  this.name : name;
  
  this.effect_uniforms = [
              {name: "u_tr_mat", type: "float[9]", value: transformation_matrix},
  ]; 

  this.general_uniforms = [];
  
  this.require_fbo = false;

  this.source = `
  vec4 `+name+`(vec4 pxcolor, vec2 tx) {
    
    vec4 res = vec4(0.0, 0.0, 0.0, pxcolor.a);
    
    res.r = transformation_matrix[0]*pxcolor.r + transformation_matrix[1]*pxcolor.g + transformation_matrix[2]*pxcolor.b;
    res.g = transformation_matrix[3]*pxcolor.r + transformation_matrix[4]*pxcolor.g + transformation_matrix[5]*pxcolor.b;
    res.b = transformation_matrix[6]*pxcolor.r + transformation_matrix[7]*pxcolor.g + transformation_matrix[8]*pxcolor.b;

    return res;
  }
  `;
};

function kernel_convolution(name, kernel, offset_size, offset, width, height) { 
  
  this.name = name;
  
  this.effect_uniforms = [
                {name: "u_kernell", type: "float["+offset_size.toString+"]", value: kernel},
                {name: "u_offset", type: "vec2["+offset_size.toString+"]", value: offset},
                {name: "u_offset_size", type: "float", value: offset},

  ];
  
  this.general_uniforms = [
                {name: "u_dim", type: "vec2", value},
  ];

  this.require_fbo = true; 

  this.source = `
  vec4 `+name+`(vec4 pxcolor, vec2 tx) {
    vec4 sum = vec4(0.0);
    sum.a = v.a;
    int i = 0;
    int j = 0;
    for( i=0; i<u_offset_size; i++ )
    {
      for( j=0; j<u_offset_size; j++ )
      {
        vec4 tmp = texture2D(vidTx, tx + u_offset[i]/ u_dim);
        sum.rgb += tmp.rgb * u_kernell[i];      
      }
    }
    
    return sum;
  }
  `;
};


let effects_list = [];
let slices = [];

// linear transformations matrix
let tr_mat_gray_scale = [ 1.0/3.0, 1.0/3.0, 1.0/3.0,
                          1.0/3.0, 1.0/3.0, 1.0/3.0,
                          1.0/3.0, 1.0/3.0, 1.0/3.0 ];
let tr_mat_inv_rb = [ 0.0, 0.0, 1.0,
                      0.0, 1.0, 0.0,
                      1.0, 0.0, 0.0];


// kernel convolutions
let offset33 = [-1.0, -1.0,   0.0, -1.0,   1.0, -1.0,
                -1.0,  0.0,   0.0,  0.0,   1.0,  0.0,
                -1.0,  1.0,   0.0,  1.0,   1.0,  1.0];

let kernel_avg = [  1.0/9.0, 1.0/9.0, 1.0/9.0,
                    1.0/9.0, 1.0/9.0, 1.0/9.0,
                    1.0/9.0, 1.0/9.0, 1.0/9.0 ];
let kernel_lap =[0.0, -1.0,  0.0,
                -1.0,  4.0, -1.0,
                 0.0, -1.0,  0.0];




function createTextureAndFramebuffer(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(
     gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return {tex: tex, fb: fb};
}


filter.initialize = function() {

  gl = new WebGLContext(width, height, {depth: filter.depth ? "texture" : true, primary: use_primary});
  pck_tx = gl.createTexture('vidTx');
  pck_tx.pbo = false;
  buffers = initBuffers(gl);
}

filter.configure_pid = function(pid) {

  if (!opid) {
    opid = this.new_pid();
  }
  ipid = pid;
  opid.copy_props(pid);
  opid.set_prop('PixelFormat', 'rgba');
  opid.set_prop('Stride', null);
  opid.set_prop('StrideUV', null);
  let n_width = pid.get_prop('Width');
  let n_height = pid.get_prop('Height');
  let pf = pid.get_prop('PixelFormat');
  if ((n_width != width) || (n_height != height)) {
    width = n_width;
    height = n_height;
    gl.resize(width, height);
  }
  if (pf != pix_fmt) {
    pix_fmt = pf;
    programs_Info[0] = null;
    pck_tx.reconfigure();
  }

  if (slices.length == 2)
    FBOs = { 
      FBO0 : createTextureAndFramebuffer(gl, width, height),
    }
  else if  (slices.length > 2)
    FBOs = { 
      FBO0 : createTextureAndFramebuffer(gl, width, height),
      FBO1 : createTextureAndFramebuffer(gl, width, height),
    }

  

  effects_list.push(new simple_linear_transformation('inversion_rouge_bleu', tr_mat_inv_rb));
  effects_list.push(new kernel_convolution('moyenneur', kernel_avg, 3, offset, width, height));
  effects_list.push(new simple_linear_transformation('gray_scale', tr_mat_gray_scale));
  effects_list.push(new kernel_convolution('detection_de_contours', kernel_lap, 3, offset, width, height));

  {   // detect slices
    var one_slice = [0];
    for (var effect_index=0; effect_index<effects_list.length; effect_index++)
    {
      one_slice.push(effect_index);
      if (effects_list[effect_index].require_fbo)
      {
        slices.push(one_slice);
        one_slice = [effect_index];
      }
    }
    one_slice.push(effects_list.length);
    slices.push(one_slice);
  }

  print(`pid and WebGL configured: ${width}x${height} source format ${pf}`);
}

filter.update_arg = function(name, val)
{
}


filter.process = function()
{
  glob_uni_info = [ 
          {u_name: "nb_frames", type='int', value: nb_frames},
          {u_name: "u_dim", type: "vec2", value: [width, height]},
        ];
  let ipck = ipid.get_packet();
  if (!ipck) return GF_OK;
  if (filter.frame_pending) {
//    print('frame pending, waiting');
    return GF_OK;
  }
  gl.activate(true);

//  pck_tx.upload(ipck);
  gl.bindTexture(gl.TEXTURE_2D, pck_tx);
  gl.texImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, ipck);

  if (programs_Info[0] == null)
  {
    programs_Info[0] = setupProgram(gl, vsSource, list_fs_info[0],'vidTx');
  } 
  for (var i=1;i<slices.length; i++){
    if (programs_Info[i] == null)
    {
      programs_Info[i] = setupProgram(gl, vsSource, list_fs_info[i],'txt1');
    }
  }
  // indice in  texture (-1:video, 0:FBOs[0], 1:FBOs[1])
  // indice out texture (-1:ecran, 0:FBOs[0], 1:FBOs[1])
  let in_texture = -1;
  let out_texture;
  if (slices.length == 1) {out_texture = -1;}
  else  {out_texture = 0;}

  for (var i=1;i<slices.length; i++){
    drawScene(gl, programs_Info[i-1], buffers, in_texture, out_texture);
    in_texture = (in_texture+1)%2;
    out_texture = (out_texture+1)%2;
  }

  drawScene(gl, programs_Info[slices.length-1], buffers, in_texture, -1);



	gl.flush();
	gl.activate(false);
 
	//create packet from webgl framebuffer
	let opck = opid.new_packet(gl, () => { filter.frame_pending=false; }, filter.depth );
	this.frame_pending = true;
  opck.copy_props(ipck);

  ipid.drop_packet();
	opck.send();
  nb_frames++;
	return GF_OK;
}


/*inspired from MDN samples
https://github.com/mdn/webgl-examples/tree/gh-pages/tutorial
*/

const vsSource = `
attribute vec4 aVertexPosition;
attribute vec2 aTextureCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying vec2 vTextureCoord;
void main() {
  gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
  vTextureCoord = aTextureCoord;
}
`;


function create_fs(effects_list, index_slice, sampler2D_name){
  
  let specefic_uniforms = [];
  let global_uniforms_names = [];


  var s=`
  varying vec2 vTextureCoord;
  uniform sampler2D `+sampler2D_name+`;
  
  `;

  for (var effect_index =index_slice[0];effect_index<index_slice[1];effect_index++)
  {   
    for (var spec_u_index =0; spec_u_index< effects_list[effect_index].effect_uniforms.length  ;spec_u_index++)   // add effect_pecefic uniforms
    {
      effects_list[effect_index].effect_uniforms[spec_u_index].name = 'fx'+effect_index.toString+'_'+effects_list[effect_index].effect_uniforms[spec_u_index].name;
      specefic_uniforms.push(effects_list[effect_index].effect_uniforms[spec_u_index]);
      s += 'uniform '+ effects_list[effect_index].effect_uniforms[spec_u_index].type +' '+effects_list[effect_index].effect_uniforms[spec_u_index].name+`;\n`;
    }  

    for (var glob_u_index =0; glob_u_index< effects_list[effect_index].general_uniforms.length  ;glob_u_index++)   // add general uniforms 
    {
      let glob_uni_name = effects_list[effect_index].effect_uniforms[glob_u_index];
      if (!(global_uniforms_names.includes(glob_uni_name)))
      {
        global_uniforms_names.push(glob_uni_name);
        s += 'uniform '+ effects_list[effect_index].general_uniforms[glob_u_index].type + ' '+glob_uni_name + `;\n`; //TODO 
      }
    
    }  

  }

  for (var effect_index=index_slice[0];effect_index<index_slice[1];effect_index++){   // add effects source
    s += effects_list[effect_index].source;
  }
  
  s += `
  void main(void) {
  vec2 tx_coord = vTextureCoord;
  `;
  
  if (sampler2D_name == 'vidTx')
    s += `
    tx_coord.y = 1.0 - tx_coord.y;
    `;
  
  s += `
  vec4 vid = texture2D(`+sampler2D_name+`, tx_coord);
  `;

  for (var i=index_slice[0];i<index_slice[1];i++){
    s+='vid = effet'+i.toString()+'(vid, tx_coord);\n';
  }

  s+= `
  gl_FragColor = vid;
  }
  `;

  return {
    source : s, 
    specefic_uniforms : specefic_uniforms, 
    global_uniforms_in_use_names : global_uniforms_names,
  };
}

const list_fs_info = [];

list_fs_info.push(create_fs(effects_list, slices[0] , 'vidTx')); 
for (var i=1;i<slices.length; i++){
    list_fs_info.push(create_fs(effects_list, slices[i] , 'txt1')); 
}

function setupProgram(gl, vsSource, fs_info, sampler2D_name)
{

  const shaderProgram = initShaderProgram(gl, vsSource, fs_info.source);

  return {
    program: shaderProgram,
    specefic_uniforms: fs_info.specefic_uniforms,
    global_uniforms_names : fs_info.global_uniforms_names,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      textureCoord: gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
      input_texture: gl.getUniformLocation(shaderProgram, sampler2D_name),
    },
  };
}


function initBuffers(gl) {
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  
  const positions = [
    // Front face
    -1.0, -1.0,
     1.0, -1.0,
     1.0,  1.0,
    -1.0,  1.0,
  ];


  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  const indices = [
    0,  1,  2,      0,  2,  3,

  ];
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  const textureCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
  const textureCoordinates = [
    // Front
    0.0,  0.0,
    1.0,  0.0,
    1.0,  1.0,
    0.0,  1.0,

    
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);

  return {
    position: positionBuffer,
    indices: indexBuffer,
    textureCoord: textureCoordBuffer,
  };
}


function drawScene(gl, programInfo, buffers, in_texture, out_texture) {

  let frameBuff = null;
  
  if (out_texture == -1) {frameBuff = null;}
  else if (out_texture == 0) {frameBuff = FBOs.FBO0.fb;}
  else if (out_texture == 1) {frameBuff = FBOs.FBO1.fb;}

  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff);

  gl.viewport(0, 0, width, height);
  gl.clearColor(0.8, 0.4, 0.8, 1.0);
  gl.clearDepth(1);
  gl.disable(gl.DEPTH_TEST);
  // gl.enable(gl.BLEND);
  // gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  // gl.depthFunc(gl.LEQUAL);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const fieldOfView = Math.PI/4;  // in radians
  const aspect = width / height;
  const zNear = -1;
  const zFar = 100.0;
  //const projectionMatrix = new Matrix().perspective(fieldOfView, aspect, zNear, zFar);
  const projectionMatrix = new Matrix().ortho(-1,1,-1,1,-1,100);
  //const projectionMatrix= new Matrix().inverse();
  //const modelViewMatrix = new Matrix().rotate(0, 1, 0, nb_frames*Math.PI/100);
  //const modelViewMatrix = new Matrix().rotate(0, 1, 0, Math.PI/4);

  const modelViewMatrix = new Matrix();
  //const projectionMatrix= new Matrix(1, 0, 0, 0, 1, 0, 0, 0, 1);
  //bind vertex position
  {
    const numComponents = 2;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        numComponents,
        type,
        normalize,
        stride,
        offset);
    gl.enableVertexAttribArray(
        programInfo.attribLocations.vertexPosition);
  }

  //bind texture coordinates
  {
    const num = 2; // chaque coordonnée est composée de 2 valeurs
    const type = gl.FLOAT; // les données dans le tampon sont des flottants 32 bits
    const normalize = false; // ne pas normaliser
    const stride = 0; // combien d'octets à récupérer entre un jeu et le suivant
    const offset = 0; // à combien d'octets du début faut-il commencer
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, num, type, normalize, stride, offset);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
  }

  gl.useProgram(programInfo.program);

  //set uniforms
  gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix.m);
  gl.uniformMatrix4fv( programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix.m);


  for (var su_index=0; su_index<programInfo.specefic_uniforms.length; su_index++)   // push specefic uniforms value
  {
    var location = uniforms_locations.push(gl.getUniformLocation(programInfo.program, programInfo.specefic_uniforms[su_index].name));
    gl.uniform1f(location, programInfo.specefic_uniforms[su_index].value);    //TODO switch type
  }  


  for (var gu_index=0; gu_index<glob_uni_info.length; gu_index++) // push global uniforms value
  {
    if (programInfo.global_uniforms_in_use_names.includes(glob_uni_info[gu_index].name))
      {
        var location = uniforms_locations.push(gl.getUniformLocation(programInfo.program, glob_uni_info[gu_index].name));
        gl.uniform1f(location, glob_uni_info[gu_index].value);    //TODO switch type
      } 
  }
  //set image
  //gl.activeTexture(gl.TEXTURE0);
  //gl.bindTexture(gl.TEXTURE_2D, texture);
  //gl.uniform1i(programInfo.uniformLocations.txLogo, 0);


  //set in texture
  if (in_texture == -1) 
  {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pck_tx);
  }
  else if (in_texture == 0) 
  {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, FBOs.FBO0.tex);
  }
  else if (in_texture == 1) 
  {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, FBOs.FBO1.tex);
  }
  gl.uniform1f(programInfo.uniformLocations.input_texture, 0);

  //bind indices and draw
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
  const vertexCount = 6;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
  
}

function loadTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const level = 0;
  const internalFormat = gl.RGBA;
  const srcFormat = gl.RGBA; //ignored, overriden by texImage2D from object
  const srcType = gl.UNSIGNED_BYTE;  //ignored, overriden by texImage2D from object
  let tx = new Texture("../auxiliary_files/logo.png", true);
  gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, tx);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  return texture;
}

//const texture = loadTexture(gl);

function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  if (!vertexShader || !fragmentShader) 
      return null;

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    return null;
  }
  return shaderProgram;
}

function loadShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert('An error occurred compiling the shaders ' + type + ' : ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
