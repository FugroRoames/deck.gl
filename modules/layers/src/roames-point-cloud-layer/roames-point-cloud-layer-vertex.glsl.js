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

uniform vec4 quaternion;
uniform float xTranslation;
uniform float yTranslation;
uniform float zTranslation;
uniform bool calcBound;
uniform vec4 edge1;
uniform vec4 edge2;

attribute vec3 gpsPositions;
attribute vec4 gpsDirections;

varying vec4 vColor;
varying vec2 unitPosition;
varying float render;

float calcTriangleArea(vec2 p1, vec2 p2, vec2 p3)
{
  return abs((p2.x * p1.y - p1.x * p2.y) + (p3.x * p2.y - p2.x * p3.y) + (p1.x * p3.y - p3.x * p1.y)) / 2.;
}

float inBounds(vec4 e1, vec4 e2, vec4 p)
{
  float pointArea = calcTriangleArea(e1.xy, p.xy, e2.zw) +
    calcTriangleArea(e2.zw, p.xy, e2.xy) +
    calcTriangleArea(e2.xy, p.xy, e1.zw) +
    calcTriangleArea(p.xy, e1.zw, e1.xy);

  float boundBoxArea = sqrt(pow((e1.x - e1.z), 2.) + pow((e1.y - e1.w), 2.)) * sqrt(pow((e1.w - e2.y), 2.) + pow((e2.x - e1.z), 2.));
  float inside = 0.0;

  // is inside
  if (pointArea <= boundBoxArea) {
    inside = 1.0;
  }

  return inside;
}

void main(void) {
  // Quaternion we want to apply in respect to the gps direction 
  vec4 r = qm(gpsDirections, qm(quaternion, qi(gpsDirections)));
  
  // translation vector rotated in respect to the gps direction 
  vec4 t = qm(gpsDirections, qm(vec4(xTranslation, yTranslation, zTranslation, 0.), qi(gpsDirections)));
  
  // vector from point to gps
  vec4 v = vec4(instancePositions-gpsPositions, 0.);
  
  // transformed point position
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

  if (calcBound) {    
    render = inBounds(edge1, edge2, geometry.position); //vec4(gl_Position.xyz, 0.)); //
  } else {
    render = 1.;
  }
}
`;
