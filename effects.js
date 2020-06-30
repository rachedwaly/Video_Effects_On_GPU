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
                {name: "u_kernell", type: "float[9]", value: kernel},
                {name: "u_offset", type: "vec2[9]", value: offset},
                {name: "u_offset_size", type: "float", value: offset},

  ];
  
  this.general_uniforms = [
                {name: "u_dim", type: "vec2",},
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


let effects_list = [];
let slices = [];

effects_list.push(new simple_linear_transformation('inversion_rouge_bleu', tr_mat_inv_rb));
effects_list.push(new kernel_convolution('moyenneur', kernel_avg, 3, offset, 600, 300));
effects_list.push(new simple_linear_transformation('gray_scale', tr_mat_gray_scale));
effects_list.push(new kernel_convolution('detection_de_contours', kernel_lap, 3, offset, 600, 300));

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
  
  var s=`
  varying vec2 vTextureCoord;
  uniform sampler2D `+sampler2D_name+`;
  
  `;

  for (var effect_index =index_slice[0];effect_index<index_slice[1];effect_index++)
  {   
    for (var spec_u_index =0; spec_u_index< effects_list[effect_index].effect_uniforms.length  ;spec_u_index++)   // add effect_pecefic uniforms
    {
      s += 'uniform '+ effects_list[effect_index].effect_uniforms[spec_u_index].type;
      s += +' fx'+effect_index.toString+'_'+effects_list[effect_index].effect_uniforms[spec_u_index].name + `;\n`;
    }  

    for (var spec_u_index =0; spec_u_index< effects_list[effect_index].general_uniforms.length  ;spec_u_index++)   // add general uniforms 
    {
      s += 'uniform '+ effects_list[effect_index].general_uniforms[spec_u_index].type;
      s += ' '+effects_list[effect_index].general_uniforms[spec_u_index].name + `;\n`;
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

  return s;
}

const list_fs_info = [];

list_fs_info.push(create_fs(effects_list, slices[0] , 'vidTx')); 
for (var i=1;i<slices.length; i++){
    list_fs_info.push(create_fs(effects_list, slices[i] , 'txt1')); 
}

