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
let programs_Info = [null];

let gl = null;
let pck_tx = null;
let buffers = null;

let FBOs = null;


// #########################################################################################
// #########################################################################################
// Déclaration des filtres

let  glob_uni_info = [ 
          {name: "u_nb_frames", type:'int', dim: [1,1], value: nb_frames},
          {name: "u_dim", type: "vec", dim: [2,1], value: [width, height]},
          {name: "u_nb_frames_normalized", type: "float", dim: [1,1], value: (nb_frames%100)/100},
        ];;



function linear_transformation_per_zones_v(name, transformation_matrix, a=1,b=1) { // res.rgb = transformation_matrix*pxcolor.rgb
  
  this.name = name;
  
  this.effect_uniforms = [
              {name: "u_tr_mat", type: "float", dim: [1,9], value: transformation_matrix},
              

  ]; 

  this.global_uniforms_in_use_names = ["u_nb_frames_normalized"];
  
  this.require_fbo = (a != 1) || (b != 1);;
  this.require_texture = false;

  this.alpha=[1,1];

  this.source = `
  vec4 `+name+`(vec4 pxcolor, vec2 tx) {\n
    
   
    
    vec4 res = vec4(0.0, 0.0, 0.0, pxcolor.a);\n
    
    if (tx.x <u_nb_frames_normalized && tx.y<u_nb_frames_normalized){
    res.r = u_tr_mat[3]*pxcolor.g + u_tr_mat[4]*pxcolor.r + u_tr_mat[5]*pxcolor.b;
    res.g = u_tr_mat[0]*pxcolor.g + u_tr_mat[1]*pxcolor.r + u_tr_mat[2]*pxcolor.b;
    res.b = u_tr_mat[6]*pxcolor.g + u_tr_mat[7]*pxcolor.r + u_tr_mat[8]*pxcolor.b;
    
    }

   if (tx.x <u_nb_frames_normalized && tx.y>u_nb_frames_normalized){
     res.r = u_tr_mat[0]*pxcolor.r + u_tr_mat[1]*pxcolor.g + u_tr_mat[2]*pxcolor.b;
     res.g = u_tr_mat[3]*pxcolor.r + u_tr_mat[4]*pxcolor.g + u_tr_mat[5]*pxcolor.b;
     res.b = u_tr_mat[6]*pxcolor.r + u_tr_mat[7]*pxcolor.g + u_tr_mat[8]*pxcolor.b;
     
    }


   if (tx.x >u_nb_frames_normalized && tx.y<u_nb_frames_normalized){
     res.r = u_tr_mat[0]*pxcolor.r + u_tr_mat[1]*pxcolor.b + u_tr_mat[2]*pxcolor.g;
     res.g = u_tr_mat[6]*pxcolor.r + u_tr_mat[7]*pxcolor.b + u_tr_mat[8]*pxcolor.g;
     res.b = u_tr_mat[3]*pxcolor.r + u_tr_mat[4]*pxcolor.b + u_tr_mat[5]*pxcolor.g;
     
    }

   if (tx.x>u_nb_frames_normalized && tx.y>u_nb_frames_normalized){
     
     res.r=(pxcolor.r+pxcolor.g+pxcolor.b)/3.0;
     res.g=(pxcolor.r+pxcolor.g+pxcolor.b)/3.0;
     res.b=(pxcolor.r+pxcolor.g+pxcolor.b)/3.0;
     
    }


    return res;\n
  }
  `;

  this.update_source = function(standard_unifo_nam, prefix) {this.source = this.source.replaceAll(standard_unifo_nam, prefix+standard_unifo_nam);}
  this.update_uniforms_values = function(indexList, valueList) {
    for (var i=0; i< indexList.length; i++)
      this.effect_uniforms[indexList[i]].value = valueList[i];
  }
  this.update_special_info = function(indexList, valueList) {
    for (var i=0; i< indexList.length; i++)
      this.effect_uniforms[indexList[i]].special_info = valueList[i];
  }
};

function linear_transformation_per_zones(name, transformation_matrix,w,v,a=1,b=1) { // res.rgb = transformation_matrix*pxcolor.rgb
  
  this.name = name;
  
  this.effect_uniforms = [
              {name: "u_tr_mat", type: "float", dim: [1,9], value: transformation_matrix},
              {name:"u_w",type:"float",dim: [1,1], value:w},
              {name:"u_v",type:"float",dim: [1,1], value:v},

  ]; 

  this.global_uniforms_in_use_names = [];
  
  this.require_fbo = (a != 1) || (b != 1);;
  this.require_texture = false;

  this.alpha=[1,1];

  this.source = `
  vec4 `+name+`(vec4 pxcolor, vec2 tx) {\n
    
    vec4 res = vec4(0.0, 0.0, 0.0, pxcolor.a);\n
    
    if (tx.x <u_w && tx.y<u_v){
    res.r = u_tr_mat[3]*pxcolor.g + u_tr_mat[4]*pxcolor.r + u_tr_mat[5]*pxcolor.b;
    res.g = u_tr_mat[0]*pxcolor.g + u_tr_mat[1]*pxcolor.r + u_tr_mat[2]*pxcolor.b;
    res.b = u_tr_mat[6]*pxcolor.g + u_tr_mat[7]*pxcolor.r + u_tr_mat[8]*pxcolor.b;
    
    }

   if (tx.x <u_w && tx.y>u_v){
     res.r = u_tr_mat[0]*pxcolor.r + u_tr_mat[1]*pxcolor.g + u_tr_mat[2]*pxcolor.b;
     res.g = u_tr_mat[3]*pxcolor.r + u_tr_mat[4]*pxcolor.g + u_tr_mat[5]*pxcolor.b;
     res.b = u_tr_mat[6]*pxcolor.r + u_tr_mat[7]*pxcolor.g + u_tr_mat[8]*pxcolor.b;
     
    }


   if (tx.x > u_w && tx.y< u_v){
     res.r = u_tr_mat[0]*pxcolor.r + u_tr_mat[1]*pxcolor.b + u_tr_mat[2]*pxcolor.g;
     res.g = u_tr_mat[6]*pxcolor.r + u_tr_mat[7]*pxcolor.b + u_tr_mat[8]*pxcolor.g;
     res.b = u_tr_mat[3]*pxcolor.r + u_tr_mat[4]*pxcolor.b + u_tr_mat[5]*pxcolor.g;
     
    }

   if (tx.x> u_w && tx.y> u_v){
     
     res.r=(pxcolor.r+pxcolor.g+pxcolor.b)/3.0;
     res.g=(pxcolor.r+pxcolor.g+pxcolor.b)/3.0;
     res.b=(pxcolor.r+pxcolor.g+pxcolor.b)/3.0;
     
    }


    return res;\n
  }
  `;

  this.update_source = function(standard_unifo_nam, prefix) {this.source = this.source.replaceAll(standard_unifo_nam, prefix+standard_unifo_nam);}
  this.update_uniforms_values = function(indexList, valueList) {
    for (var i=0; i< indexList.length; i++)
      this.effect_uniforms[indexList[i]].value = valueList[i];
  }
  this.update_special_info = function(indexList, valueList) {
    for (var i=0; i< indexList.length; i++)
      this.effect_uniforms[indexList[i]].special_info = valueList[i];
  }
};

function simple_linear_transformation(name, transformation_matrix, a=1, b=1) { // res.rgb = transformation_matrix*pxcolor.rgb
  
  this.name = name;
  
  this.effect_uniforms = [
              {name: "u_tr_mat", type: "float", dim: [1,9], value: transformation_matrix, special_info : null},
  ]; 

  this.global_uniforms_in_use_names = [];
  
  this.require_fbo = (a != 1) || (b != 1);;
  this.require_texture = false;

  this.alpha=[a,b];

  this.source = `
  vec4 `+name+`(vec4 pxcolor, vec2 tx) {\n
    
    vec4 res = vec4(0.0, 0.0, 0.0, pxcolor.a);\n
    
    res.r = u_tr_mat[0]*pxcolor.r + u_tr_mat[1]*pxcolor.g + u_tr_mat[2]*pxcolor.b;\n
    res.g = u_tr_mat[3]*pxcolor.r + u_tr_mat[4]*pxcolor.g + u_tr_mat[5]*pxcolor.b;\n
    res.b = u_tr_mat[6]*pxcolor.r + u_tr_mat[7]*pxcolor.g + u_tr_mat[8]*pxcolor.b;\n

    return res;\n
  }
  `;

  this.update_source = function(standard_unifo_nam, prefix) {this.source = this.source.replaceAll(standard_unifo_nam, prefix+standard_unifo_nam);}
  this.update_uniforms_values = function(indexList, valueList) {
    for (var i=0; i< indexList.length; i++)
      this.effect_uniforms[indexList[i]].value = valueList[i];
  }
  this.update_special_info = function(indexList, valueList) {
    for (var i=0; i< indexList.length; i++)
      this.effect_uniforms[indexList[i]].special_info = valueList[i];
  }
};


function kernel_convolution(name, kernel, offset_size, offset, a=1, b=1) { 
  
  this.name = name;
  
  this.effect_uniforms = [
                {name: "u_kernell", type: "float", dim: [1,offset_size*offset_size], value: kernel, special_info : null},
                {name: "u_offset", type: "vec", dim : [2,offset_size*offset_size], value: offset, special_info : null},
                {name: "u_off_size", type: "int", dim: [1,1], value: offset_size, special_info : null},

  ];
  
  this.global_uniforms_in_use_names = ["u_dim"];

  this.require_fbo = true;
  this.require_texture = false;
  this.alpha=[a,b];

  this.source = `
  vec4 `+name+`(vec4 pxcolor, vec2 tx) {\n
    vec4 sum = vec4(0.0);\n
    sum.a = pxcolor.a;\n
    int i = 0;\n
    int j = 0;\n
    for( i=0; i<u_off_size; i++ )\n
    {\n
      for( j=0; j<u_off_size; j++ )\n
      
      {\n
        vec4 tmp = texture2D(current_texture, tx + u_offset[i*u_off_size+j]/ u_dim);\n
        sum.rgb += tmp.rgb * u_kernell[i*u_off_size+j];      \n
      }\n
    }\n
    
    return sum;\n
  }
  `;

  this.update_source = function(standard_unifo_nam, prefix) {this.source = this.source.replaceAll(standard_unifo_nam, prefix+standard_unifo_nam);}
  this.update_uniforms_values = function(indexList, valueList) {
    for (var i=0; i< indexList.length; i++)
      this.effect_uniforms[indexList[i]].value = valueList[i];
  }
  this.update_special_info = function(indexList, valueList) {
    for (var i=0; i< indexList.length; i++)
      this.effect_uniforms[indexList[i]].special_info = valueList[i];
  }
};

function change_buffer_size(name, a,b) { // res.rgb = transformation_matrix*pxcolor.rgb
  
  this.name = name;
  
  this.effect_uniforms = []; 

  this.global_uniforms_in_use_names = [];
  
  this.require_fbo = true;
  this.require_texture = false;
  
  this.alpha=[a,b];
  
  this.source = `
  vec4 `+name+`(vec4 pxcolor, vec2 tx) {\n

    return pxcolor;\n
  }
  `;
  this.update_source = function(standard_unifo_nam, prefix) {this.source = this.source.replaceAll(standard_unifo_nam, prefix+standard_unifo_nam);}
  this.update_uniforms_values = function(indexList, valueList) {
    for (var i=0; i< indexList.length; i++)
      this.effect_uniforms[indexList[i]].value = valueList[i];
  }
  this.update_special_info = function(indexList, valueList) {
    for (var i=0; i< indexList.length; i++)
      this.effect_uniforms[indexList[i]].special_info = valueList[i];
  }

};

function texture_mask(name, filename, mix_coef =0.5, a=1, b=1) { // res.rgb = transformation_matrix*pxcolor.rgb
  
  this.name = name;

  this.filename = filename;

  this.require_fbo = (a != 1) || (b != 1);
  this.require_texture = true;

  this.alpha=[a,b];
  
  this.effect_uniforms = [
        {name: "txmask", type: "sampler2D", dim: [1,1], value: null, special_info : null},
        {name: "u_mix_coef", type: "float", dim: [1,1], value: mix_coef, special_info : null},
  ]; 

  this.global_uniforms_in_use_names = [];
  
  this.source = `
  vec4 `+name+`(vec4 pxcolor, vec2 tx) {\n
    vec4 mask_v = texture2D(txmask, tx);
    return mix(pxcolor,mask_v,u_mix_coef) ;\n
  }
  `;
  this.update_source = function(standard_unifo_nam, prefix) {this.source = this.source.replaceAll(standard_unifo_nam, prefix+standard_unifo_nam);}
  this.update_uniforms_values = function(indexList, valueList) {
    for (var i=0; i< indexList.length; i++)
      this.effect_uniforms[indexList[i]].value = valueList[i];
  }
  this.update_special_info = function(indexList, valueList) {
    for (var i=0; i< indexList.length; i++)
      this.effect_uniforms[indexList[i]].special_info = valueList[i];
  }

};
// linear transformations matrix
let tr_mat_gray_scale = [ 1.0/3.0, 1.0/3.0, 1.0/3.0,
                          1.0/3.0, 1.0/3.0, 1.0/3.0,
                          1.0/3.0, 1.0/3.0, 1.0/3.0 ];

let tr_mat_inv_rb = [ 0.0, 0.0, 1.0,
                      0.0, 1.0, 0.0,
                      1.0, 0.0, 0.0];

let tr_mat_zones=[1.0/16.0, 2.0/16.0, 1.0/16.0,              
                  2.0/16.0, 4.0/16.0, 2.0/16.0,              
                  1.0/16.0, 2.0/16.0, 1.0/16.0 ];
// kernel convolutions


let kernel_avg = [  1.0/9.0, 1.0/9.0, 1.0/9.0,
                    1.0/9.0, 1.0/9.0, 1.0/9.0,
                    1.0/9.0, 1.0/9.0, 1.0/9.0 ];

let kernel_lap =[0.0, -1.0,  0.0,
                -1.0,  4.0, -1.0,
                 0.0, -1.0,  0.0,];


let kernel_sobel=[-1.0, 0.0, 1.0,             
                  -2.0, 0.0, 2.0,             
                  -1.0, 0.0, 1.0];



let kernel_prewitt=[-1.0, 0.0, 1.0,
                    -1.0, 0.0, 1.0,
                    -1.0, 0.0, 1.0];

// offset matrix

let offset33 = [-1.0, -1.0,   0.0, -1.0,   1.0, -1.0,
                -1.0,  0.0,   0.0,  0.0,   1.0,  0.0,
                -1.0,  1.0,   0.0,  1.0,   1.0,  1.0];


let effects_list = [];
let slices = [];
let list_fs_info = [];

let texture_effect_info = [];


//effects_list.push(new simple_linear_transformation('inversion_rouge_bleu', tr_mat_inv_rb));
effects_list.push(new linear_transformation_per_zones_v('zones', tr_mat_zones));
effects_list.push(new linear_transformation_per_zones_v('zones1', tr_mat_zones));

//effects_list.push(new kernel_convolution('moyenneur', kernel_avg, 3, offset33));


//effects_list.push(new change_buffer_size('half_size',0.5,0.5));
//effects_list.push(new kernel_convolution('moyenneur', kernel_avg, 3, offset33));
//effects_list.push(new change_buffer_size('half11', 0.5, 0.5));
for (var i=4; i<5; i++)
  effects_list.push(new texture_mask("zall"+i,'index'+i+'.jpeg', 0.1));

//effects_list.push(new kernel_convolution('moyenneur', kernel_avg, 3, offset33));




// #########################################################################################
// #########################################################################################
// determination des slices et suivi des effet à texture supplémentaire

var one_slice = [0];
let current_texture_unit = 2;

if (effects_list[0].require_texture) 
{
  current_texture_unit += 1;
  texture_effect_info.push({index: 0, unit: current_texture_unit});
} 

for (var effect_index=1; effect_index<effects_list.length; effect_index++)
{
  if (effects_list[effect_index].require_fbo)
  {
    one_slice.push(effect_index);
    slices.push(one_slice);
    one_slice = [effect_index];
    current_texture_unit = 0;
  }
  
  if (effects_list[effect_index].require_texture)
  {
    current_texture_unit += 1;
    if (current_texture_unit > 8)
    {
      one_slice.push(effect_index);
      slices.push(one_slice);
      one_slice = [effect_index];    
      current_texture_unit = 1;
    }
    texture_effect_info.push({index: effect_index, unit: current_texture_unit});

  }  
}
one_slice.push(effects_list.length);
slices.push(one_slice);
print(slices);
// #########################################################################################
// #########################################################################################



// #########################################################################################
// #########################################################################################
// assemblage des différents fragment shaders

list_fs_info.push(create_fs(effects_list, slices[0] , 'vidTx')); 
print(list_fs_info[0].source);
for (var i=1;i<slices.length; i++){
    list_fs_info.push(create_fs(effects_list, slices[i] , 'txt1')); 
    print(list_fs_info[i].source);
}

// #########################################################################################
// #########################################################################################


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


  for (var eff=0; eff<texture_effect_info.length; eff++)
  {
    var img_tx = loadTexture(gl, effects_list[texture_effect_info[eff].index].filename);
    effects_list[texture_effect_info[eff].index].update_uniforms_values([0], [img_tx]);
    effects_list[texture_effect_info[eff].index].update_special_info([0], [texture_effect_info[eff].unit]);
  }

  
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
      FBO0 : {FT: createTextureAndFramebuffer(gl, width, height),changed: false},
    }
  else if  (slices.length > 2)
    FBOs = { 
      FBO0 : {FT: createTextureAndFramebuffer(gl, width, height), changed: false},
      FBO1 : {FT: createTextureAndFramebuffer(gl, width, height),changed : false},
    }

  

  print(`pid and WebGL configured: ${width}x${height} source format ${pf}`);
}

filter.update_arg = function(name, val)
{
}


filter.process = function()
{
  glob_uni_info = [ 
          {name: "u_nb_frames", type:'int', dim: [1,1], value: nb_frames},
          {name: "u_dim", type: "vec", dim: [2,1], value: [width, height]},
          {name:"u_nb_frames_normalized", type:'float', dim :[1,1],value:(nb_frames%100)/100},
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
      programs_Info.push(setupProgram(gl, vsSource, list_fs_info[i],'txt1'));
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
  let global_uniforms_in_use_names = [];// this list will contain all the global uniforms used by each effect of this fragmentshader
  let alpha=[];  


  var s=`
  varying vec2 vTextureCoord;
  uniform sampler2D `+sampler2D_name+`;
  
  `;

  for (var effect_index =index_slice[0];effect_index<index_slice[1];effect_index++)
  {   
    for (var spec_u_index =0; spec_u_index< effects_list[effect_index].effect_uniforms.length  ;spec_u_index++)   // add effect_pecefic uniforms
    {
      var uniform_variable = effects_list[effect_index].effect_uniforms[spec_u_index];
      effects_list[effect_index].update_source(uniform_variable.name, 'fx'+effect_index);
      uniform_variable.name = 'fx'+effect_index+uniform_variable.name;

      specefic_uniforms.push(uniform_variable);
      
      s += 'uniform '+ uniform_variable.type + ((uniform_variable.dim[0]==1) ? '' : uniform_variable.dim[0]);

      s += ((uniform_variable.dim[1]==1) ? '' : '['+uniform_variable.dim[1]+']');

      s +=' '+uniform_variable.name+`;\n`;
    }  

    for (var glob_u_index =0; glob_u_index< glob_uni_info.length  ;glob_u_index++)   // add general uniforms   // we see for each global uniform if it' not yet added 
                                                                                                                //and if it is used for this effect
    { 

      var uniform_variable = glob_uni_info[glob_u_index];

      if (!(global_uniforms_in_use_names.includes(uniform_variable.name)) && effects_list[effect_index].global_uniforms_in_use_names.includes(uniform_variable.name))
      {
        
        global_uniforms_in_use_names.push(uniform_variable.name);

        s += 'uniform '+ uniform_variable.type + ((uniform_variable.dim[0]==1) ? '' : uniform_variable.dim[0]);

        s += ((uniform_variable.dim[1]==1) ? '' : '['+uniform_variable.dim[1]+']');

        s +=' '+uniform_variable.name+`;\n`;

      }
    
    }  

  }

  for (var effect_index=index_slice[0];effect_index<index_slice[1];effect_index++){   // add effects source
    s += effects_list[effect_index].source.replaceAll('current_texture',sampler2D_name);
  }
  
  s += `
  void main(void) {
  vec2 tx_coord = vTextureCoord;
  `;
  
  if (sampler2D_name == 'vidTx')
    s += `
    tx_coord.y = 1.0 - tx_coord.y;
    `;

  s += "\nvec4 vid = texture2D("+sampler2D_name+", tx_coord);\n";

  
  for (var effect_index =index_slice[0];effect_index<index_slice[1];effect_index++)
  {   
    s += 'vid = ' + effects_list[effect_index].name +'(vid, tx_coord);\n';
  }

  s+= `
  gl_FragColor = vid;
  }
  `;
  
  alpha=effects_list[index_slice[0]].alpha;
 
  return {
    resize : alpha,
    source : s, 
    specefic_uniforms : specefic_uniforms, 
    global_uniforms_in_use_names : global_uniforms_in_use_names,

  };
}

function setupProgram(gl, vsSource, fs_info, sampler2D_name)
{


  const shaderProgram = initShaderProgram(gl, vsSource, fs_info.source);

  return {
    program: shaderProgram,
    specefic_uniforms: fs_info.specefic_uniforms,
    global_uniforms_in_use_names : fs_info.global_uniforms_in_use_names,
    alpha: fs_info.resize,
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
  var frameBuff ={FT: {fb: null,changed: false}};
  if (out_texture == 0) {frameBuff = FBOs.FBO0;}
  else if (out_texture == 1) {frameBuff = FBOs.FBO1;}
  
  gl.bindFramebuffer(gl.FRAMEBUFFER,frameBuff.FT.fb);   


  if (frameBuff.changed=true && programInfo.alpha[0]==1 && programInfo.alpha[1]==1)   {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,frameBuff.FT.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,width,height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    frameBuff.changed=false;
  }


  if ((programInfo.alpha[0]!=1) || (programInfo.alpha[1]!=1)){
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,frameBuff.FT.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,programInfo.alpha[0]*width,programInfo.alpha[1]*height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    frameBuff.FT.changed=true;
  }
  

      

  gl.viewport(0, 0,programInfo.alpha[0]*width,programInfo.alpha[1]*height);
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

    var location = gl.getUniformLocation(programInfo.program, programInfo.specefic_uniforms[su_index].name);

    add_uniform(gl,location,programInfo.specefic_uniforms[su_index]);
  }  


  for (var gu_index=0; gu_index<glob_uni_info.length; gu_index++) // push global uniforms value
  {
    if (programInfo.global_uniforms_in_use_names.includes(glob_uni_info[gu_index].name))
      {
        var location = gl.getUniformLocation(programInfo.program, glob_uni_info[gu_index].name);
        
        add_uniform(gl,location,glob_uni_info[gu_index]);
   
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
    gl.bindTexture(gl.TEXTURE_2D, FBOs.FBO0.FT.tex);
  }
  else if (in_texture == 1) 
  {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, FBOs.FBO1.FT.tex);
  }
  gl.uniform1i(programInfo.uniformLocations.input_texture, 0);

  //bind indices and draw
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
  const vertexCount = 6;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;

  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);


  
}

function loadTexture(gl, filename) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const level = 0;
  const internalFormat = gl.RGBA;
  const srcFormat = gl.RGBA; //ignored, overriden by texImage2D from object
  const srcType = gl.UNSIGNED_BYTE;  //ignored, overriden by texImage2D from object
  let tx = new Texture("textures/"+filename, true);
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


function add_uniform(gl,location,uniform_variable){
  if (uniform_variable.dim[0] == 1 && uniform_variable.dim[1] == 1)
  {
     
    switch (uniform_variable.type){
      case "float":  {gl.uniform1f(location,uniform_variable.value); break;}
      case "int":    {gl.uniform1i(location,uniform_variable.value); break;}
      case "sampler2D": 
      {
        var index_tx = uniform_variable.special_info;
        gl.activeTexture(gl.TEXTURE0+index_tx);
        gl.bindTexture(gl.TEXTURE_2D, uniform_variable.value);
        gl.uniform1i(location, index_tx);
      }
    }
  }

  else if (uniform_variable.dim[1] > 1)
  {
    switch (uniform_variable.dim[0]){


      case 1:  {gl.uniform1fv(location,uniform_variable.value); break;}
      case 2:  {gl.uniform2fv(location,uniform_variable.value); break;}
      case 3:  {gl.uniform3fv(location,uniform_variable.value); break;}
    }
  }
  else
      gl.uniform2fv(location,uniform_variable.value);
    
}