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
#define SHADER_NAME icon-layer-fragment-shader
#define MAX_COLOR_DOMAIN 128

precision highp float;

uniform float opacity;
uniform sampler2D iconsTexture;
uniform float alphaCutoff;
uniform float zoomLevel;
uniform float textureSize;

varying float vColorMode;
varying vec4 vColor;
varying vec2 vTextureCoords;
varying vec2 vHeightTexCoords;
varying vec2 uv;
varying float iconHeight;
uniform sampler2D heightTexture;
uniform sampler2D colorTexture;
uniform float colorDomain[MAX_COLOR_DOMAIN];
uniform float nullValue;
uniform int colorDomainSize;

vec4 getLinearColor(float value) {
  float factor = clamp((value - colorDomain[0])/(colorDomain[1] - colorDomain[0]), 0., 1.);
  vec4 color = texture2D(colorTexture, vec2(factor, 0.));
  return color;
}

vec4 getColor(float value) {
  int index = colorDomainSize;
  for (int i = 0; i < MAX_COLOR_DOMAIN; i++) {
    if (i == colorDomainSize) {break;}
    if (value < colorDomain[i]) {
      index = i;
      break;
    }
  }

  float factor = float(index)/float(colorDomainSize);
  vec4 color = texture2D(colorTexture, vec2(factor, 0.));
  return color;
}

void main(void) {
  vec4 texColor = texture2D(iconsTexture, vTextureCoords);
  float a = texColor.a * opacity * vColor.a;

  if (a < alphaCutoff) {
    discard;
  }

  const int size = 10;
  vec2 texCoordForKernel;
  float height = nullValue;
  float sum = 0.;
  float sampleCount = 0.;
  float pixel_size = 1./2048.; //textureSize;

  for (int i = -1*size/2; i < size/2; i++) {
    for (int j = -1*size/2; j < size/2; j++) {
      texCoordForKernel = vec2(vHeightTexCoords.x + float(i) * pixel_size, vHeightTexCoords.y + float(j) * pixel_size);
      height = texture2D(heightTexture, texCoordForKernel).r;
      if (height != nullValue) {
        sum += height;
        sampleCount += 1.;
      }
    }
  }

  if (sampleCount != 0.) {
    height = sum / sampleCount;
  } else {
    height = nullValue;
  }
  // float height = texture2D(heightTexture, vHeightTexCoords).r;

  // if colorMode == 0, use pixel color from the texture
  // if colorMode == 1 or rendering picking buffer, use texture as transparency mask
  // vec3 color = mix(texColor.rgb, vColor.rgb, vColorMode);
  // Take the global opacity and the alpha from vColor into account for the alpha component
  vec4 color = vec4(255.);
  
  // if (zoomLevel <= 19.) {
  //   color.rgb = vec3(0.);
  // } else if (height != nullValue) {
  //   color = getLinearColor(height - iconHeight);
  // }
  if (colorDomainSize == 2) {
    color = getLinearColor(weighttwo - weightone);
  } else {
    color = getColor(weighttwo - weightone);
  } 

  gl_FragColor = color; //vec4(color, a);
  DECKGL_FILTER_COLOR(gl_FragColor, geometry);
}
`;
