// Copyright (c) 2015 - 2017 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

export default `\
#define SHADER_NAME roames-point-cloud-layer-vertex-shader

attribute vec3 positions;
attribute vec3 instanceNormals;
attribute vec4 instanceColors;
attribute vec3 instancePositions;
attribute vec3 instancePositions64Low;
attribute vec3 instancePickingColors;

uniform float opacity;
uniform float radiusPixels;

uniform float xRotationRad;
uniform float yRotationRad;
uniform float zRotationRad;
uniform float xTranslation;
uniform float yTranslation;
uniform float zTranslation;
attribute vec3 gpsPositions;
attribute vec4 gpsDirections;

varying vec4 vColor;
varying vec2 unitPosition;

void main(void) {
  vec4 gpsD = qNorm(gpsDirections);

  vec4 q = toQaternion(zRotationRad, yRotationRad, xRotationRad);  
  vec4 r = qm(gpsD, qm(q, qi(gpsD)));

  vec4 t = qm(gpsD, qm(vec4(xTranslation, yTranslation, zTranslation, 0.), qi(gpsD)));
  vec4 v = vec4(instancePositions-gpsPositions, 0.);
  vec3 p = qm(r, qm(v, qi(r))).xyz + gpsPositions + t.xyz;
  geometry.worldPosition = p;
  geometry.normal = project_normal(instanceNormals);

  // position on the containing square in [-1, 1] space
  unitPosition = positions.xy;
  geometry.uv = unitPosition;
  geometry.pickingColor = instancePickingColors;

  // Find the center of the point and add the current vertex
  vec3 offset = vec3(positions.xy * radiusPixels, 0.0);
  DECKGL_FILTER_SIZE(offset, geometry);

  gl_Position = project_position_to_clipspace(p, instancePositions64Low, vec3(0.), geometry.position);
  gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);
  gl_Position.z = 0.;
  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);

  // Apply lighting
  vec3 lightColor = lighting_getLightColor(instanceColors.rgb, project_uCameraPosition, geometry.position.xyz, geometry.normal);

  // Apply opacity to instance color, or return instance picking color
  vColor = vec4(lightColor, instanceColors.a * opacity);
  DECKGL_FILTER_COLOR(vColor, geometry);
}
`;
