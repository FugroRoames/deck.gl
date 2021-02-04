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
#define SHADER_NAME boresight-layer-fragment-shader
#define MAX_COLOR_DOMAIN 128

precision highp float;

uniform float opacity;
uniform sampler2D textureone;
uniform sampler2D texturetwo;
varying vec2 vTexCoords;
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
  float weightone = texture2D(textureone, vTexCoords).r;
  float weighttwo = texture2D(texturetwo, vTexCoords).r;
  if (weightone == nullValue || weighttwo == nullValue) {
    discard;
  }

  vec4 color = vec4(0.);
  // If there's only two values, it's a linear interpolation
  if (colorDomainSize == 2) {
    color = getLinearColor(weighttwo - weightone);
  } else {
    color = getColor(weighttwo - weightone);
  } 

  gl_FragColor = color;
}
`;
