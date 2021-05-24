export default `\
#define SHADER_NAME weight-vertex-shader

attribute vec3 positions;
attribute vec3 positions64Low;
attribute vec3 gpsPositions;
attribute vec3 gpsPositions64Low;
attribute vec4 gpsDirections;
attribute vec4 gpsDirections64Low;

varying float weightsTexture;
uniform float radiusPixels;
uniform float textureWidth;
uniform vec4 commonBounds;

uniform vec4 quaternion;
uniform float xTranslation;
uniform float yTranslation;
uniform float zTranslation;

void main()
{
  // Quaternion we want to apply in respect to the gps direction 
  vec4 r = qm(gpsDirections, qm(quaternion, qi(gpsDirections)));

  // translation vector rotated in respect to the gps direction 
  vec4 t = qm(gpsDirections, qm(vec4(xTranslation, yTranslation, zTranslation, 0.), qi(gpsDirections)));

  // vector from point to gps
  vec4 v = vec4(positions-gpsPositions, 0.);
  
  // transformed point position
  vec3 p = qm(r, qm(v, qi(r))).xyz + gpsPositions + t.xyz;

  vec4 position_world = project_uModelMatrix * vec4(p, 1.0) + vec4(project_uCoordinateOrigin, 1.);

  float height = position_world.z;
  weightsTexture = height;

  float radiusTexels  = project_pixel_size(radiusPixels) * textureWidth / (commonBounds.z - commonBounds.x);
  gl_PointSize = radiusTexels * 2.;

  vec3 commonPosition = project_position(p);

  // map xy from commonBounds to [-1, 1]
  gl_Position.xy = (commonPosition.xy - commonBounds.xy) / (commonBounds.zw - commonBounds.xy) ;
  gl_Position.xy = (gl_Position.xy * 2.) - (1.);
  gl_Position.z = 1.;
}
`;
