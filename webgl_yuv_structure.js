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
let txt_and_buf = null;
let use_primary = false;
let width=600;
let height=400;
let ipid=null;
let opid=null;
let nb_frames=0;
let pix_fmt = '';


let programInfo1 = null;
let programInfo2 = null;

let gl = null;
let pck_tx = null;
let buffers = null;

let step_h=10.0/height;
let step_w=10.0/width;

let kernels=[[1.0/16.0, 2.0/16.0, 1.0/16.0,
        2.0/16.0, 4.0/16.0, 2.0/16.0,
        1.0/16.0, 2.0/16.0, 1.0/16.0 ],[
        -1.0/6.0, 0.0/16.0, 1.0/6.0,
        -1.0/16.0, 0.0/16.0, 1.0/6.0,
        -1.0/16.0, 0.0/16.0, 1.0/6.0 ]]

let offset1=[-step_w, -step_h, 0.0, -step_h, step_w, -step_h, 
        -step_w, 0.0, 0.0, 0.0, step_w, 0.0, 
        -step_w, step_h, 0.0, step_h, step_w, step_h];

let declaration_effets=['vec3 effet0(vec3 k){float average = 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b;return vec3(average, average, average);	}',`vec3 effet1(vec3 b){return u_coef*b.rgb;}`];
let choice=[0,1];

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
    programInfo1 = null;
    pck_tx.reconfigure();
  }
  txt_and_buf = createTextureAndFramebuffer(gl, width, height);
  print(`pid and WebGL configured: ${width}x${height} source format ${pf}`);
}

filter.update_arg = function(name, val)
{
}


filter.process = function()
{
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

  if (!programInfo1) programInfo1 = setupProgram(gl, vsSource, fsSource1, 'vidTx');
  if (!programInfo2) programInfo2 = setupProgram(gl, vsSource, fsSource2, 'txt1');
  // Draw the scene
  drawScene(gl, programInfo1, buffers, 1);
  drawScene(gl, programInfo2, buffers, 2);

  // Draw the scene
  
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

const effet=effets();  //`vec3 effet1(vec3 b){return u_coef*b.rgb;}`
//const effet1= `vec3 effet1(vec3 b){return u_coef*b.rgb;}`;
//const effet=
const FragColor='gl_FragColor = vid;}';
const main=`void main(void) {
  vec2 tx= vTextureCoord;
  //tx.y = 1.0 - tx.y;
  vec4 vid = texture2D(vidTx, tx);`

const app=apply();
//const unfiorms=;
const fsSource2 = `
varying vec2 vTextureCoord;
uniform float u_coef;
uniform sampler2D vidTx;

`+effet+main+app+FragColor;


const fsSource1 = `
varying vec2 vTextureCoord;

uniform sampler2D vidTx;
uniform float[9] u_kernell;
uniform vec2[9] u_offset11;


void main(void) {
  int i = 0;
  vec4 sum = vec4(0.0);
  vec2 tx= vTextureCoord;
  tx.y = 1.0 - tx.y;

  
   
 
  for( i=0; i<9; i++ )
  {
    vec4 tmp = texture2D(vidTx, tx + u_offset11[i]);
    sum.rgb += tmp.rgb * u_kernell[i];
  }
  
  sum.a=1.0;

  gl_FragColor = sum;
}
`;


// void main(void) {
//   vec2 tx= vTextureCoord;
//   tx.y = 1.0 - tx.y;
//   vec4 vid = texture2D(vidTx, tx);
//   vid.rgb=zall(vid.rgb);
//   gl_FragColor = vid;
// }
// `;



function setupProgram(gl, vsSource, fsSource,text_name)
{
  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
  return {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      textureCoord: gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
      txVid: gl.getUniformLocation(shaderProgram, 'vidTx'),
      coef: gl.getUniformLocation(shaderProgram, 'u_coef'),
      tx: gl.getUniformLocation(shaderProgram, text_name),
      kernell: gl.getUniformLocation(shaderProgram, 'u_kernell'),
      offset11: gl.getUniformLocation(shaderProgram, 'u_offset11'),

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


function drawScene(gl, programInfo, buffers,step) {
  gl.viewport(0, 0, width, height);
  let frameBuff = null;
  if (step == 1){frameBuff = txt_and_buf.fb;}
  else {frameBuff = null;}
  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff);

  gl.clearColor(0.8, 0.4, 0.8, 1.0);
  gl.clearDepth(1);
  gl.disable(gl.DEPTH_TEST);
  
  
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
  let coef = (nb_frames%100)/100.0;
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
  gl.uniform1f(programInfo.uniformLocations.coef,coef);
  
  if (step==1){
  gl.uniform1fv(programInfo.uniformLocations.kernell,kernels[1]);
  gl.uniform2fv(programInfo.uniformLocations.offset11,offset1);}

  gl.uniform1i(programInfo.uniformLocations.tx, 0);
  if (step == 1)
  {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pck_tx);
  }
  else{
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, txt_and_buf.tex);
  }

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
function uniforms(){

}

function effets(){
var s='';
for (var i=0;i<choice.length;i++){
  s+=declaration_effets[choice[i]];
}
return s;

}



function apply(){
var s='';
for (var i=0;i<choice.length;i++){

  s+='vid.rgb=effet'+choice[i].toString()+'(vid.rgb);'
}
return s;
}