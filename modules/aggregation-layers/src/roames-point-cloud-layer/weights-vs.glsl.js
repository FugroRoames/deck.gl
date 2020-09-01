export default `\
attribute vec3 positions;
// attribute vec4 colors;

varying vec4 weightsTexture;
uniform float radiusPixels;
uniform float textureWidth;
uniform vec4 commonBounds;
uniform float weightsScale;

// float normalizeHeight(float u){
//   return 2. * (u -  -1.)/(1. -  -1.) - 1.;
// }

void main()
{
  vec4 position_world = project_uModelMatrix * vec4(positions, 1.0) + vec4(project_uCoordinateOrigin, 1.);

  float height = position_world.z;
  weightsTexture = vec4(height * weightsScale, 0., 0., 1.);

  float radiusTexels  = project_pixel_size(radiusPixels) * textureWidth / (commonBounds.z - commonBounds.x);
  gl_PointSize = radiusTexels * 2.;

  vec3 commonPosition = project_position(positions);

  // weightsTexture = vec4(commonPosition.z, 0., 0., 1.);
  
  // map xy from commonBounds to [-1, 1]
  gl_Position.xy = (commonPosition.xy - commonBounds.xy) / (commonBounds.zw - commonBounds.xy) ;
  gl_Position.xy = (gl_Position.xy * 2.) - (1.);
  gl_Position.z = log(height)/10.;
}
`;
