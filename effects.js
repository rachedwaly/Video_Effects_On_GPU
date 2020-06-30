function simple_linear_transformation(name, transformation_matrix) { // res.rgb = transformation_matrix*pxcolor.rgb
  
  this.name : name;
  
  this.effect_uniforms = {
                u_tr_mat : {name: "u_tr_mat", type: "float[9]", value: transformation_matrix},
  }; 

  this.general_uniforms = [];
  
  this.require_fbo = false;

  this.source = `
vec4 black_and_white(vec4 pxcolor, vec2 tx) {
  
  vec4 res = vec4(0.0, 0.0, 0.0, pxcolor.a);
  
  res.r = transformation_matrix[0]*pxcolor.r + transformation_matrix[1]*pxcolor.g + transformation_matrix[2]*pxcolor.b;
  res.g = transformation_matrix[3]*pxcolor.r + transformation_matrix[4]*pxcolor.g + transformation_matrix[5]*pxcolor.b;
  res.b = transformation_matrix[6]*pxcolor.r + transformation_matrix[7]*pxcolor.g + transformation_matrix[8]*pxcolor.b;

  return [res, tx];
}
`;

};

function kernel_convolution(name, kernel, offset) { 
  
  this.name = name;
  
  this.effect_uniforms = {
                u_kernell : {name: "u_kernell", type: "float[9]", value: kernel},
                u_offset : {name: "u_offset", type: "vec2[9]", value: offset},
  };
  
  this.general_uniforms = [];

  this.require_fbo = true; 

  this.source = `
vec4 kernel_convolution(vec4 pxcolor, vec2 tx) {
  vec4 sum = vec4(0.0);
  sum.a = v.a;
  int i = 0;
  for( i=0; i<9; i++ )
  {
    vec4 tmp = texture2D(vidTx, tx + u_offset[i]);
    sum.rgb += tmp.rgb * u_kernell[i];
  }
  
  gl_FragColor = sum;
}
`;
};


var gray_scale = new simple_linear_transformation('gray_scale', [ 1.0/3.0, 1.0/3.0, 1.0/3.0,
                                                                  1.0/3.0, 1.0/3.0, 1.0/3.0,
                                                                  1.0/3.0, 1.0/3.0, 1.0/3.0 ]);