function simple_linear_transformation(name, transformation_matrix) { // res.rgb = transformation_matrix*pxcolor.rgb
  
  this.name = name;
  
  this.effect_uniforms = [
              {name: "u_tr_mat", type: "float", dim: [1,9], value: transformation_matrix},
  ]; 

  this.global_uniforms_in_use_names = [];
  
  this.require_fbo = false;

  this.source = `
  vec4 `+name+`(vec4 pxcolor, vec2 tx) {\n
    
    vec4 res = vec4(0.0, 0.0, 0.0, pxcolor.a);\n
    
    res.r = u_tr_mat[0]*pxcolor.r + u_tr_mat[1]*pxcolor.g + u_tr_mat[2]*pxcolor.b;\n
    res.g = u_tr_mat[3]*pxcolor.r + u_tr_mat[4]*pxcolor.g + u_tr_mat[5]*pxcolor.b;\n
    res.b = u_tr_mat[6]*pxcolor.r + u_tr_mat[7]*pxcolor.g + u_tr_mat[8]*pxcolor.b;\n

    return res;\n
  }
  `;

  this.update_source = function(standard_unifo_nam, prefix) {this.source = this.source.replaceAll(standard_unifo_nam, prefix+'_'+standard_unifo_nam);}

};


function kernel_convolution(name, kernel, offset_size, offset) { 
  
  this.name = name;
  
  this.effect_uniforms = [
                {name: "u_kernell", type: "float", dim: [1,offset_size*offset_size], value: kernel},
                {name: "u_offset", type: "vec", dim : [2,offset_size*offset_size], value: offset},
                {name: "u_off_size", type: "int", dim: [1,1], value: offset_size},

  ];
  
  this.global_uniforms_in_use_names = ["u_dim"];

  this.require_fbo = true; 

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

  this.update_source = function(standard_unifo_nam, prefix) {this.source = this.source.replaceAll(standard_unifo_nam, prefix+'_'+standard_unifo_nam);}
};



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
