import GL from '@luma.gl/constants';
import {Texture2D, getParameters} from '@luma.gl/core';

import {addMetersToLngLat} from '@math.gl/web-mercator';
import {Ellipsoid} from '@math.gl/geospatial';

import {COORDINATE_SYSTEM, CompositeLayer} from '@deck.gl/core';
import {PolygonLayer} from '@deck.gl/layers';
import {RoamesPointCloudLayer} from '@deck.gl/aggregation-layers';

import {log} from '@deck.gl/core';

import {load} from '@loaders.gl/core';
import {Tileset3D, TILE_TYPE} from '@loaders.gl/tiles';
import {Tiles3DLoader} from '@loaders.gl/3d-tiles';

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

export default class Roames3DLayer extends CompositeLayer {
  initializeState() {
    if ('onTileLoadFail' in this.props) {
      log.removed('onTileLoadFail', 'onTileError')();
    }
    // prop verification
    this.state = {
      layerMap: {},
      tileset3d: null
    };
  }

  shouldUpdateState({changeFlags}) {
    return changeFlags.somethingChanged;
  }

  updateState({props, oldProps, changeFlags}) {
    if (props.data && props.data !== oldProps.data) {
      this._loadTileset(props.data);
    }

    if (changeFlags.viewportChanged) {
      const {tileset3d} = this.state;
      this._updateTileset(tileset3d);
    }
  }

  getPickingInfo({info, sourceLayer}) {
    const {layerMap} = this.state;
    const layerId = sourceLayer && sourceLayer.id;
    if (layerId) {
      // layerId: this.id-[scenegraph|pointcloud]-tileId
      const substr = layerId.substring(this.id.length + 1);
      const tileId = substr.substring(substr.indexOf('-') + 1);
      info.object = layerMap[tileId] && layerMap[tileId].tile;
    }

    return info;
  }

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
    const frameNumber = tileset3d.update(viewport);
    const tilesetChanged = this.state.frameNumber !== frameNumber;
    if (tilesetChanged) {
      this.setState({frameNumber});
    }
  }

  _create3DTileLayer(tileHeader) {
    if (!tileHeader.content) {
      return null;
    }
    if (this.props.boundingBox) return this._createBoundingBoxTileLayer(tileHeader);

    switch (tileHeader.type) {
      case TILE_TYPE.POINTCLOUD:
        return this._createPointCloudTileLayer(tileHeader);
      default:
        throw new Error(`Tile3DLayer: Failed to render layer of type ${tileHeader.content.type}`);
    }
  }

  _createTexture() {
    const {gl} = this.context;
    const textureSize = Math.min(SIZE_2K, getParameters(gl, gl.MAX_TEXTURE_SIZE));

    this.setState({
      weightsTexture: new Texture2D(gl, {
        width: textureSize,
        height: textureSize,
        format: GL.RGBA32F,
        type: GL.FLOAT,
        ...TEXTURE_OPTIONS
      })
    });
  }

  _createPointCloudTileLayer(tileHeader) {
    const {
      attributes,
      pointCount,
      constantRGBA,
      cartographicOrigin,
      modelMatrix
    } = tileHeader.content;

    const {positions, colors} = attributes;
    if (!positions) {
      return null;
    }

    const {getPointColor, colorRange} = this.props;

    this._createTexture();
    const {weightsTexture} = this.state;
    const SubLayerClass = this.getSubLayerClass('roamespointcloud', RoamesPointCloudLayer);
    return new SubLayerClass(
      this.getSubLayerProps({
        id: 'roamespointcloud',
        colorRange,
        weightsTexture
      }),
      {
        id: `${this.id}-pointcloud-${tileHeader.id}`,
        data: {
          header: {
            vertexCount: pointCount
          },
          attributes: {
            POSITION: positions,
            COLOR_0: colors
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

  renderLayers() {
    const {tileset3d, layerMap} = this.state;
    if (!tileset3d) {
      return null;
    }

    return tileset3d.tiles
      .map(tile => {
        const layers = [];
        if (this.props.boundingBox) {
          const boundlayer = layerMap[`${tile.id}-bound`] && layerMap[`${tile.id}-bound`].layer;
          const layer = this.createLayer(tile, boundlayer, layerMap, true);
          layers.push(layer);
        }
        let layer = layerMap[tile.id] && layerMap[tile.id].layer;
        layer = this.createLayer(tile, layer, layerMap);
        layers.push(layer);

        return layers;
      })
      .filter(Boolean);
  }

  /* eslint-disable complexity */
  createLayer(tile, layer, layerMap, bound) {
    // render selected tiles
    if (tile.selected) {
      // create layer
      if (!layer) {
        if (!tile.content) {
          return null;
        }
        // layer = this._create3DTileLayer(tile);
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
}

Roames3DLayer.layerName = 'Roames3DLayer';
Roames3DLayer.defaultProps = defaultProps;
