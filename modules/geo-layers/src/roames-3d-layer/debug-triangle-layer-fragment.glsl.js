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
#define SHADER_NAME triangle-layer-fragment-shader
precision highp float;
uniform float opacity;
uniform sampler2D texture;
varying vec2 vTexCoords;
uniform sampler2D colorTexture;
uniform vec2 colorDomain;


vec4 getLinearColor(float value) {
  float factor = clamp((value - colorDomain[0])/(colorDomain[1] - colorDomain[0]), 0., 1.);
  vec4 color = texture2D(colorTexture, vec2(factor, 0.));
  return color;
}

void main(void) {
  float weight = texture2D(texture, vTexCoords).r;
  // discard pixels with 0 weight.
  if (weight <= 0.) {
     discard;
  }
  vec4 linearColor = getLinearColor(weight);
  gl_FragColor = linearColor;
}
`;
