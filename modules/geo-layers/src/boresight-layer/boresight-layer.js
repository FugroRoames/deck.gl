import GL from '@luma.gl/constants';
import {Buffer, Texture2D, getParameters, isWebGL2} from '@luma.gl/core';

import {CompositeLayer} from '@deck.gl/core';

import {log} from '@deck.gl/core';

import {Tiles3DLoader} from '@loaders.gl/3d-tiles';

import TriangleLayer from './triangle-layer';
import Roames3DLayer from '../roames-3d-layer/roames-3d-layer';

import {colorRangeToFlatArray} from '../../../aggregation-layers/src/utils/color-utils';
import {
  updateBounds,
  getTextureCoordinates,
  packVertices
} from '../../../core/src/utils/bound-utils';

const defaultProps = {
  getPointColor: [0, 0, 0],
  pointSize: 1.0,
  colorRange: null,
  datas: null,
  loadOptions: {},
  loader: Tiles3DLoader,
  boundingBox: false,
  onTilesetLoad: tileset3d => {},
  onTileLoad: tileHeader => {},
  onTileUnload: tileHeader => {},
  onTileError: (tile, message, url) => {},
  xRotation: null,
  yRotation: null,
  zRotation: null
};

const TEXTURE_OPTIONS = {
  mipmaps: false,
  parameters: {
    [GL.TEXTURE_MAG_FILTER]: GL.LINEAR,
    [GL.TEXTURE_MIN_FILTER]: GL.LINEAR,
    [GL.TEXTURE_WRAP_S]: GL.CLAMP_TO_EDGE,
    [GL.TEXTURE_WRAP_T]: GL.CLAMP_TO_EDGE
  },
  dataFormat: GL.RGBA
};

const SIZE_2K = 2048;

export default class BoresightLayer extends CompositeLayer {
  initializeState() {
    const {gl} = this.context;

    if ('onTileLoadFail' in this.props) {
      log.removed('onTileLoadFail', 'onTileError')();
    }
    const textureSize = Math.min(SIZE_2K, getParameters(gl, gl.MAX_TEXTURE_SIZE));

    this.setState({layerMap: {}, textureSize});
    this._createBuffers();
  }

  shouldUpdateState({changeFlags}) {
    return changeFlags.somethingChanged;
  }

  updateState(opts) {
    const {props, oldProps} = opts;

    // update state everytime ..?
    const {viewport} = this.context;
    const {worldBounds, textureSize} = this.state;

    // if (changeFlags.viewportChanged) {
    const newState = {};
    updateBounds(viewport, worldBounds, {textureSize, resolution: 2}, newState, true);
    this.setState(newState);
    // }

    if (props.colorRange !== oldProps.colorRange) {
      this._updateColorTexture(opts);
    }

    if (
      props.xRotation !== oldProps.xRotation ||
      props.yRotation !== oldProps.yRotation ||
      props.zRotation !== oldProps.zRotation
    ) {
      this.setState({rotated: true});
    }
    this._updateTextureRenderingBounds();
  }

  renderLayers() {
    const {layerMap} = this.state;

    let subLayers = [];

    // Calculate the texture for each tiles 3d dataset
    // call Roames3DLayer for each dataset
    // hack to get around dupliate layer id
    let i = 0;
    subLayers = this.props.data
      .map(dataURL => {
        let layer = layerMap[i] && layerMap[i].layer;
        // render selected tiles
        // create layer
        if (i === 0) {
          if (!layer) {
            layer = new Roames3DLayer({
              id: `${this.id}-roames-3d-layer-${i}`,
              data: dataURL,
              loader: this.props.loader,
              loadOptions: this.props.loadOptions,
              colorRange: this.props.colorRange,
              boundingBox: false,
              onTilesetLoad: this.props.onTilesetLoad
            });
            layerMap[i] = {layer, dataURL};
          } else if (this.state.rotated) {
            layer.updateXRotation(this.props.xRotation);
            layer.updateYRotation(this.props.yRotation);
            layer.updateZRotation(this.props.zRotation);
            this.setState({rotated: false});
          }
        } else if (!layer) {
          layer = new Roames3DLayer({
            id: `${this.id}-roames-3d-layer-${i}`,
            data: dataURL,
            loader: this.props.loader,
            loadOptions: this.props.loadOptions,
            colorRange: this.props.colorRange,
            boundingBox: false
          });
          layerMap[i] = {layer, dataURL};
        }
        // update layer visibility
        if (layer && layer.props && !layer.props.visible) {
          // Still has GPU resource but visibility is turned off so turn it back on so we can render it.
          layer = layer.clone({visible: true});
          layerMap[i].layer = layer;
        }

        i++;
        return layer;
      })
      .filter(Boolean);

    const textures = [];
    subLayers.map(layer => {
      textures.push(layer.getTexture());
    });

    const {triPositionBuffer, triTexCoordBuffer} = this.state;

    if (textures) {
      subLayers.push(
        new TriangleLayer(
          {
            id: `triangle-layer-${this.id}`,
            updateTriggers: this.props.updateTriggers
          },
          {
            data: {
              attributes: {
                positions: triPositionBuffer,
                texCoords: triTexCoordBuffer
              }
            },
            vertexCount: 4,
            colorTexture: this.state.colorTexture,
            textureone: textures[0],
            texturetwo: textures[1],
            intensity: 1,
            threshold: 0.05
          }
        )
      );
    }
    return subLayers;
  }

  _createBuffers() {
    const {gl} = this.context;
    this.setState({
      triPositionBuffer: new Buffer(gl, {
        byteLength: 48,
        accessor: {size: 3}
      }),
      triTexCoordBuffer: new Buffer(gl, {
        byteLength: 48,
        accessor: {size: 2}
      })
    });
  }

  _updateTextureRenderingBounds() {
    // Just render visible portion of the texture
    const {
      triPositionBuffer,
      triTexCoordBuffer,
      normalizedCommonBounds,
      viewportCorners
    } = this.state;

    const {viewport} = this.context;

    triPositionBuffer.subData(packVertices(viewportCorners, 3));

    const textureBounds = viewportCorners.map(p =>
      getTextureCoordinates(viewport.projectPosition(p), normalizedCommonBounds)
    );
    triTexCoordBuffer.subData(packVertices(textureBounds, 2));
  }

  _updateColorTexture(opts) {
    const {colorRange} = opts.props;
    let {colorTexture} = this.state;

    const colors = colorRangeToFlatArray(colorRange, true);
    if (colorTexture) {
      colorTexture.setImageData({
        data: colors,
        width: colorRange.length
      });
    } else {
      colorTexture = new Texture2D(this.context.gl, {
        data: colors,
        width: colorRange.length,
        height: 1,
        format: isWebGL2(this.context.gl) ? GL.RGBA32F : GL.RGBA,
        type: GL.FLOAT,
        ...TEXTURE_OPTIONS
      });
    }
    this.setState({colorTexture});
  }
}

BoresightLayer.layerName = 'BoresightLayer';
BoresightLayer.defaultProps = defaultProps;
