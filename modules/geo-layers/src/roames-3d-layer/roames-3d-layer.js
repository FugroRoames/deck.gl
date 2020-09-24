import GL from '@luma.gl/constants';
import {Buffer, Transform, Texture2D, getParameters, isWebGL2} from '@luma.gl/core';

import {addMetersToLngLat} from '@math.gl/web-mercator';
import {Ellipsoid} from '@math.gl/geospatial';

import {COORDINATE_SYSTEM, CompositeLayer} from '@deck.gl/core';
import {PolygonLayer} from '@deck.gl/layers';
import {RoamesPointCloudLayer} from '@deck.gl/aggregation-layers';

import {log} from '@deck.gl/core';

import {_mergeShaders as mergeShaders, project32} from '@deck.gl/core';

import {load} from '@loaders.gl/core';
import {Tileset3D} from '@loaders.gl/tiles';
import {Tiles3DLoader} from '@loaders.gl/3d-tiles';

import weights_vs from './weights-vs.glsl';
import weights_fs from './weights-fs.glsl';
// import TriangleLayer from './triangle-layer';

import {colorRangeToFlatArray} from '../../../aggregation-layers/src/utils/color-utils';

import {
  updateBounds,
  getTextureCoordinates,
  packVertices
} from '../../../core/src/utils/bound-utils';
import {Matrix4} from 'math.gl';

const defaultProps = {
  getPointColor: [0, 0, 0],
  pointSize: 1.0,
  colorRange: null,
  data: null,
  loadOptions: {},
  loader: Tiles3DLoader,
  boundingBox: false,
  onTilesetLoad: tileset3d => {},
  onTileLoad: tileHeader => {},
  onTileUnload: tileHeader => {},
  onTileError: (tile, message, url) => {}
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
const RESOLUTION = 2; // (number of common space pixels) / (number texels)
// const ZOOM_DEBOUNCE = 500; // milliseconds

export default class Roames3DLayer extends CompositeLayer {
  initializeState() {
    if ('onTileLoadFail' in this.props) {
      log.removed('onTileLoadFail', 'onTileError')();
    }

    // prop verification
    this.state = {
      layerMap: {},
      tileset3d: null,
      zoom: this.context.viewport.zoom
    };

    this._createTexture();
    this._createTransform();
    this._createBuffers();
  }

  shouldUpdateState({changeFlags}) {
    return changeFlags.somethingChanged;
  }

  updateState(opts) {
    const {props, oldProps} = opts;
    const {viewport} = this.context;
    const {worldBounds, textureSize, tileset3d, totalWeightsTransform} = this.state;
    const changeFlags = this._getChangeFlags(opts);

    if ((props.data && props.data !== oldProps.data) || this.state.rotationChanged) {
      this._loadTileset(props.data);
    }
    if (changeFlags.viewportChanged || this.state.rotationChanged) {
      const newState = {};
      changeFlags.boundsChanged = updateBounds(
        viewport,
        worldBounds,
        {textureSize, resolution: RESOLUTION},
        newState,
        true
      );
      this.setState(newState);
      this._updateTileset(tileset3d);
      totalWeightsTransform.getFramebuffer().clear({color: true});
    }

    if (props.colorRange !== oldProps.colorRange) {
      this._updateColorTexture(opts);
    }

    if (changeFlags.viewportChanged) {
      this._updateTextureRenderingBounds();
    }
    this.setState({rotationChanged: false});
  }

  renderLayers() {
    const {tileset3d} = this.state;
    if (!tileset3d) {
      return null;
    }

    if (this.context.viewport.zoom !== this.state.zoom) {
      this.state.totalWeightsTransform.getFramebuffer().clear({color: true});
    }

    const subLayers = [];
    subLayers.push(this._updateWeightmap());

    // If you want to actually render the texture using this layer
    // const {
    //   triPositionBuffer,
    //   triTexCoordBuffer
    // } = this.state;

    // subLayers.push(new TriangleLayer(
    //     {
    //       id: `triangle-layer-${this.id}`,
    //       updateTriggers: this.props.updateTriggers
    //     },
    //     {
    //       data: {
    //         attributes: {
    //           positions: triPositionBuffer,
    //           texCoords: triTexCoordBuffer
    //         }
    //       },
    //       vertexCount: 4,
    //       colorTexture: this.state.colorTexture,
    //       texture: this.state.totalWeightsTexture,
    //       intensity: 1,
    //       threshold: 0.05,
    //     }
    //   )
    // );
    this.setState({lastUpdate: Date.now()});
    this.setState({zoom: this.context.viewport.zoom});

    return subLayers;
  }

  getTexture() {
    if (!this.state) {
      return null;
    }
    return this.state.totalWeightsTexture;
  }

  updateXRotation(xRotation) {
    this.setState({xRotation, rotationChanged: true});
  }

  updateYRotation(yRotation) {
    this.setState({yRotation, rotationChanged: true});
  }

  updateZRotation(zRotation) {
    this.setState({zRotation, rotationChanged: true});
  }

  _getChangeFlags(opts) {
    const changeFlags = {};
    changeFlags.viewportChanged = opts.changeFlags.viewportChanged;
    const {zoom} = this.state;
    if (!opts.context.viewport || opts.context.viewport.zoom !== zoom) {
      changeFlags.viewportZoomChanged = true;
    }

    return changeFlags;
  }

  _updateWeightmap() {
    const {tileset3d, layerMap} = this.state;
    if (!tileset3d) {
      return null;
    }

    const sublayers = tileset3d.tiles
      .map(tile => {
        const layers = [];
        if (this.props.boundingBox) {
          const boundlayer = layerMap[`${tile.id}-bound`] && layerMap[`${tile.id}-bound`].layer;
          const layer = this._createLayer(tile, boundlayer, layerMap, true);
          layers.push(layer);
        }
        let layer = layerMap[tile.id] && layerMap[tile.id].layer;
        layer = this._createLayer(tile, layer, layerMap);

        layers.push(layer);

        return layers;
      })
      .filter(Boolean);
    return sublayers;
  }

  // _debouncedUpdateWeightmap(fromTimer = false) {
  //   let {updateTimer} = this.state;
  //   const {worldBounds, textureSize} = this.state;
  //   const {viewport} = this.context;
  //   let timeSinceLastUpdate = 5000;
  //   if (this.state.lastUpdate) {
  //     timeSinceLastUpdate = Date.now() - this.state.lastUpdate;
  //   }

  //   if (fromTimer) {
  //     updateTimer = null;
  //   }

  //   if (timeSinceLastUpdate >= ZOOM_DEBOUNCE) {
  //     const newState = {};
  //     updateBounds(viewport, worldBounds, {textureSize, resolution: RESOLUTION}, newState, true);
  //     this.setState(newState);
  //     this._updateTextureRenderingBounds();
  //   } else if (!updateTimer) {
  //     updateTimer = setTimeout(
  //       this._debouncedUpdateWeightmap.bind(this, true),
  //       ZOOM_DEBOUNCE - timeSinceLastUpdate
  //     );
  //   }

  //   this.setState({updateTimer});
  // }

  async _loadTileset(tilesetUrl) {
    const {loader, loadOptions} = this.props;
    const options = {...loadOptions};
    if (loader.preload) {
      const preloadOptions = await loader.preload(tilesetUrl, loadOptions);
      Object.assign(options, preloadOptions);
    }
    const tilesetJson = await load(tilesetUrl, loader, options);

    const tileset3d = new Tileset3D(tilesetJson, {
      onTileLoad: this._onTileLoad.bind(this),
      onTileUnload: this._onTileUnload.bind(this),
      onTileLoadFail: this.props.onTileError,
      ...options
    });
    // Essentially move all this stuff to weght-vs
    // maybe move the rotation values in as uniforms
    if (this.state.xRotation) {
      const c = tileset3d.cartesianCenter;
      const modMat = new Matrix4(tileset3d.root.transform);
      const tran = modMat
        .translate(c)
        .rotateX(this.state.xRotation * (3.141 / 180))
        .translate([-c[0], -c[1], -c[2]]);
      tileset3d.root.transform = tran;
    }
    if (this.state.yRotation) {
      const c = tileset3d.cartesianCenter;
      const modMat = new Matrix4(tileset3d.root.transform);
      const tran = modMat
        .translate(c)
        .rotateY(this.state.yRotation * (3.141 / 180))
        .translate([-c[0], -c[1], -c[2]]);
      tileset3d.root.transform = tran;
    }
    if (this.state.zRotation) {
      const c = tileset3d.cartesianCenter;
      const modMat = new Matrix4(tileset3d.root.transform);
      const tran = modMat
        .translate(c)
        .rotateZ(this.state.zRotation * (3.141 / 180))
        .translate([-c[0], -c[1], -c[2]]);
      tileset3d.root.transform = tran;
    }

    this.setState({
      tileset3d,
      layerMap: {}
    });

    this._updateTileset(tileset3d);
    this.props.onTilesetLoad(tileset3d);
  }

  _onTileLoad(tileHeader) {
    this.props.onTileLoad(tileHeader);
    this._updateTileset(this.state.tileset3d);
    this.setNeedsUpdate();
  }

  _onTileUnload(tileHeader) {
    // Was cleaned up from tileset cache. We no longer need to track it.
    delete this.state.layerMap[tileHeader.id];
    this.props.onTileUnload(tileHeader);
  }

  _updateTileset(tileset3d) {
    const {timeline, viewport} = this.context;
    if (!timeline || !viewport || !tileset3d) {
      return;
    }
    tileset3d.update(viewport);
    const frameNumber = tileset3d._frameNumber;
    const tilesetChanged = this.state.frameNumber !== frameNumber;
    if (tilesetChanged) {
      this.setState({frameNumber});
    }
  }

  _createTexture() {
    const {gl} = this.context;
    const textureSize = Math.min(SIZE_2K, getParameters(gl, gl.MAX_TEXTURE_SIZE));

    this.setState({
      totalWeightsTexture: new Texture2D(gl, {
        width: textureSize,
        height: textureSize,
        format: GL.RGBA32F,
        type: GL.FLOAT,
        ...TEXTURE_OPTIONS
      }),
      textureSize
    });
  }

  _createTransform(shaderOptions = {}) {
    const {gl} = this.context;

    const {totalWeightsTexture} = this.state;

    const shaders = mergeShaders(
      {
        vs: weights_vs,
        _fs: weights_fs,
        modules: [project32]
      },
      shaderOptions
    );

    this.setState({
      totalWeightsTransform: new Transform(gl, {
        id: `${this.id}-weights-transform`,
        elementCount: 1, // Gets updated in Lower layers
        _targetTexture: totalWeightsTexture,
        _targetTextureVarying: 'weightsTexture',
        depth: true,
        ...shaders
      })
    });
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

  _createPointCloudTileLayer(tileHeader) {
    const {
      attributes,
      pointCount,
      constantRGBA,
      cartographicOrigin,
      modelMatrix
    } = tileHeader.content;

    const {positions} = attributes;
    if (!positions) {
      return null;
    }

    const {getPointColor} = this.props;
    const SubLayerClass = this.getSubLayerClass('roamespointcloud', RoamesPointCloudLayer);

    return new SubLayerClass(
      this.getSubLayerProps({
        id: 'roamespointcloud',
        totalWeightsTransform: this.state.totalWeightsTransform
      }),
      {
        id: `${this.id}-pointcloud-${tileHeader.id}`,
        data: {
          header: {
            vertexCount: pointCount
          },
          attributes: {
            POSITION: positions
          }
        },
        coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS,
        coordinateOrigin: cartographicOrigin,
        modelMatrix,

        getColor: constantRGBA || getPointColor
      }
    );
  }

  _createBoundingBoxTileLayer(tileHeader) {
    const {attributes} = tileHeader.content;

    const {positions} = attributes;
    if (!positions) {
      return null;
    }

    const boundingVolumeCenter = tileHeader.boundingVolume.center;
    const boundVolume = tileHeader.header.boundingVolume.box;
    const z_shift = boundVolume[11];

    const verticies = this._createBoundingBox(boundingVolumeCenter, boundVolume);
    const data = [{polygon: verticies}];

    const SubLayerClass = this.getSubLayerClass('polygonlayer', PolygonLayer);
    return new SubLayerClass(
      this.getSubLayerProps({
        id: 'polygonlayer'
      }),
      {
        id: `${this.id}-polygonlayer-${tileHeader.id}`,
        data,
        getPolygon: d => d.polygon,
        extruded: true,
        filled: false,
        stroked: true,
        wireframe: true,
        getElevation: z_shift,
        getColor: d => [255, 0, 0, 255]
      }
    );
  }

  _createBoundingBox(boundingVolumeCenter, boundVolume) {
    const result = [];
    const longlat = Ellipsoid.WGS84.cartesianToCartographic(boundingVolumeCenter, result);
    const verticies = [];

    const center = longlat; // addMetersToLngLat(longlat, [boundVolume[0], boundVolume[1], boundVolume[2]]);

    const x_shift = boundVolume[3];
    const y_shift = boundVolume[7];
    const z_shift = boundVolume[11];

    verticies.push(addMetersToLngLat(center, [x_shift, y_shift, z_shift]).slice(0, 2));
    verticies.push(addMetersToLngLat(center, [x_shift, -1 * y_shift, z_shift]).slice(0, 2));
    verticies.push(addMetersToLngLat(center, [-1 * x_shift, -1 * y_shift, z_shift]).slice(0, 2));
    verticies.push(addMetersToLngLat(center, [-1 * x_shift, y_shift, z_shift]).slice(0, 2));

    return verticies;
  }

  /* eslint-disable complexity */
  _createLayer(tile, layer, layerMap, bound) {
    // render selected tiles
    if (tile.selected) {
      // create layer
      if (!layer) {
        if (!tile.content) {
          return null;
        }
        if (bound) {
          layer = this._createBoundingBoxTileLayer(tile);
          layerMap[`${tile.id}-bound`] = {layer, tile};
        } else {
          layer = this._createPointCloudTileLayer(tile);
          layerMap[tile.id] = {layer, tile};
        }
      }

      // update layer visibility
      if (layer && layer.props && !layer.props.visible) {
        // Still has GPU resource but visibility is turned off so turn it back on so we can render it.
        layer = layer.clone({visible: true});
        if (bound) {
          layerMap[`${tile.id}-bound`].layer = layer;
        } else {
          layerMap[tile.id].layer = layer;
        }
      }
      return layer;
    }

    // hide non-selected tiles
    if (layer && layer.props && layer.props.visible) {
      // Still in tileset cache but doesn't need to render this frame. Keep the GPU resource bound but don't render it.
      layer = layer.clone({visible: false});
      if (bound) {
        layerMap[`${tile.id}-bound`].layer = layer;
      } else {
        layerMap[tile.id].layer = layer;
      }
    }

    return layer;
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

Roames3DLayer.layerName = 'Roames3DLayer';
Roames3DLayer.defaultProps = defaultProps;
