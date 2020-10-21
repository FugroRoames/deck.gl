export default `\
#define SHADER_NAME weight-vertex-shader

attribute vec3 positions;
attribute vec3 gpsPositions;
attribute vec4 gpsDirections;

varying vec4 weightsTexture;
uniform float radiusPixels;
uniform float textureWidth;
uniform vec4 commonBounds;

uniform vec4 quaternion;
uniform float xTranslation;
uniform float yTranslation;
uniform float zTranslation;

void main()
{
  // Normalise the gps direction
  vec4 normGpsD = qNorm(gpsDirections);
  
  // Quaternion we want to apply in respect to the gps direction 
  vec4 r = qm(normGpsD, qm(quaternion, qi(normGpsD)));

  // translation vector rotated in respect to the gps direction 
  vec4 t = qm(normGpsD, qm(vec4(xTranslation, yTranslation, zTranslation, 0.), qi(normGpsD)));

  // vector from point to gps
  vec4 v = vec4(positions-gpsPositions, 0.);
  
  // transformed point position
  vec3 p = qm(r, qm(v, qi(r))).xyz + gpsPositions + t.xyz;

  vec4 position_world = project_uModelMatrix * vec4(p, 1.0) + vec4(project_uCoordinateOrigin, 1.);

  float height = position_world.z;
  weightsTexture = vec4(height, 1., 0., 1.);

  float radiusTexels  = project_pixel_size(radiusPixels) * textureWidth / (commonBounds.z - commonBounds.x);
  gl_PointSize = radiusTexels * 2.;

  vec3 commonPosition = project_position(p);

  // weightsTexture = vec4(commonPosition.z, 0., 0., 1.);
  
  // map xy from commonBounds to [-1, 1]
  gl_Position.xy = (commonPosition.xy - commonBounds.xy) / (commonBounds.zw - commonBounds.xy) ;
  gl_Position.xy = (gl_Position.xy * 2.) - (1.);
  gl_Position.z = 1.;//log(height)/10.;
}
`;
