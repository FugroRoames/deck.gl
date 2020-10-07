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
  colorDomain: {type: 'array', value: [-10, 10], optional: true},
  pointSize: 1.0,
  colorRange: null,
  datas: null,
  loadOptions: {},
  loader: Tiles3DLoader,
  boundingBox: false,
  points: false,
  gpsPoints: false,
  onTilesetLoad: tileset3d => {},
  onTileLoad: tileHeader => {},
  onTileUnload: tileHeader => {},
  onTileError: (tile, message, url) => {},
  xRotation: null,
  yRotation: null,
  zRotation: null,
  xTranslation: null,
  yTranslation: null,
  zTranslation: null
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

    if (
      props.xTranslation !== oldProps.xTranslation ||
      props.yTranslation !== oldProps.yTranslation ||
      props.zTranslation !== oldProps.zTranslation
    ) {
      this.setState({translated: true});
    }

    if (
      props.boundingBox !== oldProps.boundingBox ||
      props.points !== oldProps.points ||
      props.gpsPoints !== oldProps.gpsPoints
    ) {
      this.setState({subLayerToggled: true});
    }
    this._updateTextureRenderingBounds();
  }

  /* eslint-disable complexity, max-statements */
  renderLayers() {
    const {layerMap} = this.state;
    const {data, boundingBox, points, gpsPoints} = this.props;

    const subLayers = [];

    // Calculate the texture for each tiles 3d dataset
    // call Roames3DLayer for each dataset
    // Flight line 1
    let layer = layerMap[0] && layerMap[0].layer;

    if (!layer) {
      layer = new Roames3DLayer({
        id: `${this.id}-roames-3d-layer-${0}`,
        data: data[0],
        loader: this.props.loader,
        loadOptions: this.props.loadOptions,
        colorRange: this.props.colorRange,
        boundingBox,
        gpsPoints,
        points,
        onTilesetLoad: this.props.onTilesetLoad
      });
      layerMap[0] = {layer, dataURL: data[0]};
    } else if (this.state.rotated) {
      layer.updateRotation(this.props.xRotation, this.props.yRotation, this.props.zRotation);
      this.setState({rotated: false});
    } else if (this.state.translated) {
      layer.updateTranslation(
        this.props.xTranslation,
        this.props.yTranslation,
        this.props.zTranslation
      );
      this.setState({translated: false});
    } else if (this.state.subLayerToggled) {
      layer.updateLayerToggle(boundingBox, points, gpsPoints);
    }

    if (layer && layer.props && !layer.props.visible) {
      // Still has GPU resource but visibility is turned off so turn it back on so we can render it.
      layer = layer.clone({visible: true});
      layerMap[0].layer = layer;
    }

    subLayers.push(layer);

    // Flight line 2
    layer = layerMap[1] && layerMap[1].layer;

    if (!layer) {
      layer = new Roames3DLayer({
        id: `${this.id}-roames-3d-layer-${1}`,
        data: data[1],
        loader: this.props.loader,
        loadOptions: this.props.loadOptions,
        colorRange: this.props.colorRange,
        boundingBox,
        gpsPoints,
        points
      });
      layerMap[1] = {layer, dataURL: data[1]};
    } else if (this.state.subLayerToggled) {
      layer.updateLayerToggle(boundingBox, points, gpsPoints);
    }

    if (layer && layer.props && !layer.props.visible) {
      // Still has GPU resource but visibility is turned off so turn it back on so we can render it.
      layer = layer.clone({visible: true});
      layerMap[1].layer = layer;
    }

    subLayers.push(layer);

    // Get the updated textures for each layer
    const textures = [];
    subLayers.map(r3dlayer => {
      textures.push(r3dlayer.getTexture());
    });

    const {triPositionBuffer, triTexCoordBuffer} = this.state;

    // Send the textures to the Triangle layer which will diff the values (height) and render
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
            colorDomain: this.props.colorDomain
          }
        )
      );
    }
    return subLayers;
  }
  /* eslint-enable complexity, max-statements */

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
