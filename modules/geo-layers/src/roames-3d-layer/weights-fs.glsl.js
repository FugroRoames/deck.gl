export default `\
#define SHADER_NAME weight-fragment-shader

precision highp float;

void main()
{
  float dist = length(gl_PointCoord - vec2(0.5, 0.5));
  if (dist > 0.5) {
    discard;
  }
  gl_FragColor.r = weightsTexture;
  DECKGL_FILTER_COLOR(gl_FragColor, geometry);
}
`;
