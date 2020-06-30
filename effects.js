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
                {name: "u_dim", type: "vec2", value: [width, height]},
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

  