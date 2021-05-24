import GL from '@luma.gl/constants';
import {Buffer, Transform, Texture2D, getParameters} from '@luma.gl/core';

import {addMetersToLngLat} from '@math.gl/web-mercator';
import {Ellipsoid} from '@math.gl/geospatial';
import {COORDINATE_SYSTEM, CompositeLayer, WebMercatorViewport} from '@deck.gl/core';
import {
  PolygonLayer,
  PointCloudLayer,
  RoamesPointCloudLayer,
  RoamesIconLayer
} from '@deck.gl/layers';
import {RoamesHeightLayer} from '@deck.gl/aggregation-layers';

import {log} from '@deck.gl/core';

import {_mergeShaders as mergeShaders, project32} from '@deck.gl/core';

import {load} from '@loaders.gl/core';
import {Tileset3D} from '@loaders.gl/tiles';
import {Tiles3DLoader, Tile3DFeatureTable} from '@loaders.gl/3d-tiles';

import weights_vs from './weights-vs.glsl';
import weights_fs from './weights-fs.glsl';
import DebugTriangleLayer from './debug-triangle-layer';

import {
  updateBounds,
  getTextureCoordinates,
  packVertices,
  packVertices64
} from '../../../core/src/utils/bound-utils';

import {
  getPropChange,
  getHeightRange,
  parseBatchArray,
  createBoundingBox,
  toQuaternion
} from './roames-3d-layer-utils';

import * as nodeUrl from 'url';

const defaultProps = {
  getPointColor: [0, 0, 0],
  pointSize: 2.0,
  colorTexture: null,
  data: null,
  loadOptions: {},
  loader: Tiles3DLoader,
  onTilesetLoad: tileset3d => {},
  onTileLoad: tileHeader => {},
  onTileUnload: tileHeader => {},
  onTileError: (tile, message, url) => {},
  xRotation: 0,
  yRotation: 0,
  zRotation: 0,
  xTranslation: 0,
  yTranslation: 0,
  zTranslation: 0,
  height: true,
  boundingBox: false,
  points: false,
  gpsPoints: false,
  groundControl: false,
  displayTexture: false,
  bounds: null,
  gcpData: null
};

const TEXTURE_OPTIONS = {
  mipmaps: false,
  parameters: {
    [GL.TEXTURE_MAG_FILTER]: GL.NEAREST,
    [GL.TEXTURE_MIN_FILTER]: GL.NEAREST,
    [GL.TEXTURE_WRAP_S]: GL.CLAMP_TO_EDGE,
    [GL.TEXTURE_WRAP_T]: GL.CLAMP_TO_EDGE
  },
  dataFormat: GL.RED
};

const SIZE_2K = 2048;
const RESOLUTION = 2; // (number of common space pixels) / (number texels)
const dummyArray = new Float64Array();

export default class Roames3DLayer extends CompositeLayer {
  initializeState() {
    if ('onTileLoadFail' in this.props) {
      log.removed('onTileLoadFail', 'onTileError')();
    }

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

  /* eslint-disable complexity, max-statements */
  updateState(opts) {
    const {props, oldProps} = opts;

    this.setState(getPropChange(props, oldProps));

    const {viewport} = this.context;
    const {
      worldBounds,
      textureSize,
      tileset3d,
      totalWeightsTransform,
      zoom,
      rotationChanged,
      translationChanged,
      displayTextureChanged
    } = this.state;
    const changeFlags = this._getChangeFlags(opts);
    const {nullValue, displayTexture} = props;

    if (props.data && props.data !== oldProps.data) {
      this._loadTileset(props.data);
    }

    if (
      changeFlags.viewportChanged ||
      viewport.zoom !== zoom ||
      rotationChanged ||
      translationChanged ||
      displayTextureChanged
    ) {
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
      totalWeightsTransform.getFramebuffer().clear({color: [nullValue, 0.0, 0.0, 0.0]});
    }

    if (rotationChanged) {
      const {xRotation, yRotation, zRotation} = this.props;
      this.setState({quaternion: toQuaternion(xRotation, yRotation, zRotation)});
    }

    if (props.colorRange !== oldProps.colorRange) {
      this._updateColorTexture(opts);
    }

    // For rendering the texture
    if (displayTexture) {
      if (changeFlags.viewportChanged) {
        this._updateTextureRenderingBounds();
      }
    }
  }
  /* eslint-enable complexity, max-statements */

  renderLayers() {
    const {tileset3d} = this.state;
    const {displayTexture} = this.props;
    const {viewport} = this.context;
    if (!tileset3d) {
      return null;
    }

    const subLayers = [];
    subLayers.push(this._updateWeightmap());

    // If you want to actually render the single texture using this layer
    if (displayTexture) {
      const {totalWeightsTexture, triPositionBuffer, triTexCoordBuffer, heightRange} = this.state;
      const {colorTexture} = this.props;
      subLayers.push(
        new DebugTriangleLayer(
          {
            id: `debug-triangle-layer-${this.id}`
          },
          {
            data: {
              attributes: {
                positions: {
                  buffer: triPositionBuffer,
                  value: dummyArray
                },
                texCoords: triTexCoordBuffer
              }
            },
            vertexCount: 4,
            colorTexture,
            texture: totalWeightsTexture,
            colorDomain: heightRange
          }
        )
      );
    }

    this.setState({lastUpdate: Date.now(), zoom: viewport.zoom});

    return subLayers;
  }

  getTexture() {
    if (!this.state) {
      return null;
    }
    return this.state.totalWeightsTexture;
  }

  finalizeState() {
    super.finalizeState();
    const {
      totalWeightsTexture,
      totalWeightsTransform,
      triPositionBuffer,
      triTexCoordBuffer
    } = this.state;
    if (totalWeightsTexture) {
      totalWeightsTexture.delete();
    }

    if (totalWeightsTransform) {
      totalWeightsTransform.delete();
    }

    if (triPositionBuffer) {
      triPositionBuffer.delete();
    }

    if (triTexCoordBuffer) {
      triTexCoordBuffer.delete();
    }
  }

  _createBuffers() {
    const {gl} = this.context;
    this.setState({
      triPositionBuffer: new Buffer(gl, {
        byteLength: 96,
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

    triPositionBuffer.subData(packVertices64(viewportCorners, 3));

    const textureBounds = viewportCorners.map(p =>
      getTextureCoordinates(viewport.projectPosition(p), normalizedCommonBounds)
    );
    triTexCoordBuffer.subData(packVertices(textureBounds, 2));
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

  _hideSubLayer(tile, type) {
    const {layerMap} = this.state;
    const layer = layerMap[`${tile.id}-${type}`] && layerMap[`${tile.id}-${type}`].layer;
    if (layer && layer.props && layer.props.visible) {
      const newLayer = layer.clone({visible: false});
      layerMap[`${tile.id}-${type}`].layer = newLayer;
    }
  }

  _updateWeightmap() {
    const {tileset3d, layerMap} = this.state;
    const {points, gpsPoints, boundingBox, height, groundControl} = this.props;
    if (!tileset3d) {
      return null;
    }
    const sublayers = tileset3d.tiles
      .map(tile => {
        const layers = [];

        if (boundingBox) {
          const boundlayer = layerMap[`${tile.id}-bound`] && layerMap[`${tile.id}-bound`].layer;
          const layer = this._createLayer(tile, boundlayer, layerMap, 'bound');
          layers.push(layer);
        } else {
          this._hideSubLayer(tile, 'bound');
        }

        if (gpsPoints) {
          const gpslayer = layerMap[`${tile.id}-gps`] && layerMap[`${tile.id}-gps`].layer;
          const layer = this._createLayer(tile, gpslayer, layerMap, 'gps');
          layers.push(layer);
        } else {
          this._hideSubLayer(tile, 'gps');
        }

        if (points) {
          const pointLayer = layerMap[`${tile.id}-points`] && layerMap[`${tile.id}-points`].layer;
          const layer = this._createLayer(tile, pointLayer, layerMap, 'points');
          layers.push(layer);
        } else {
          this._hideSubLayer(tile, 'points');
        }

        if (height) {
          const heightLayer = layerMap[`${tile.id}-height`] && layerMap[`${tile.id}-height`].layer;
          const layer = this._createLayer(tile, heightLayer, layerMap, 'height');
          layers.push(layer);
        } else {
          this._hideSubLayer(tile, 'height');
        }

        return layers;
      })
      .filter(Boolean);

    if (groundControl) {
      const layer = this._createGroundControlLayer();
      if (layer) {
        sublayers.push(layer);
      }
    }

    return sublayers;
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

    // Dirty hack to push the query parameter to the tileset3d object.
    const url = nodeUrl.parse(tilesetUrl);
    if (url.query) {
      tileset3d._queryParamsString = `&${url.query}`;
    }

    // Get the tileset height range for coloring range
    const heightRange = getHeightRange(tileset3d);
    this.setState({
      tileset3d,
      layerMap: {},
      heightRange
    });

    this._updateTileset(tileset3d);
    this.props.onTilesetLoad(tileset3d);
  }

  _onTileLoad(tileHeader) {
    const {batchTableJson, batchTableBinary, pointCount} = tileHeader.content;
    if (batchTableBinary && batchTableBinary) {
      const batchTable = new Tile3DFeatureTable(batchTableJson, batchTableBinary);
      batchTable.featuresLength = pointCount;
      parseBatchArray(tileHeader.content, batchTable);
    }
    this.props.onTileLoad(tileHeader);

    this._updateTileset(this.state.tileset3d);
    this.setNeedsUpdate();
  }

  _onTileUnload(tileHeader) {
    // Was cleaned up from tileset cache. We no longer need to track it.
    if (this.state.layerMap[`${tileHeader.id}-height`]) {
      delete this.state.layerMap[`${tileHeader.id}-height`];
    }

    if (this.state.layerMap[`${tileHeader.id}-bound`]) {
      delete this.state.layerMap[`${tileHeader.id}-bound`];
    }

    if (this.state.layerMap[`${tileHeader.id}-points`]) {
      delete this.state.layerMap[`${tileHeader.id}-points`];
    }

    if (this.state.layerMap[`${tileHeader.id}-gps`]) {
      delete this.state.layerMap[`${tileHeader.id}-gps`];
    }
    this.props.onTileUnload(tileHeader);
  }

  _updateTileset(tileset3d) {
    const {timeline, viewport} = this.context;
    if (!timeline || !viewport || !tileset3d || !(viewport instanceof WebMercatorViewport)) {
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
        format: GL.R32F,
        type: GL.FLOAT,
        dataFormat: GL.RED,
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

  _createHeightTileLayer(tileHeader) {
    const {attributes, pointCount, cartographicOrigin, modelMatrix} = tileHeader.content;

    const {positions, gpsPositions, gpsDirections} = attributes;
    if (!positions) {
      return null;
    }

    const {xTranslation, yTranslation, zTranslation} = this.props;

    const {totalWeightsTransform, quaternion} = this.state;

    const SubLayerClass = this.getSubLayerClass('roamesheight', RoamesHeightLayer);
    return new SubLayerClass(
      this.getSubLayerProps({
        id: 'roamesheight',
        totalWeightsTransform
      }),
      {
        id: `${this.id}-height-${tileHeader.id}`,
        data: {
          header: {
            vertexCount: pointCount
          },
          attributes: {
            POSITION: positions,
            GPS_POSITION: gpsPositions,
            GPS_DIRECTION: gpsDirections
          }
        },
        coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS,
        coordinateOrigin: cartographicOrigin,
        modelMatrix,
        quaternion,
        xTranslation,
        yTranslation,
        zTranslation
      }
    );
  }

  _createGroundControlLayer() {
    const {totalWeightsTexture} = this.state;

    const {nullValue, gcpData, groundControl, colorTexture, colorDomainTexture} = this.props;

    if (!groundControl || !gcpData || !totalWeightsTexture || !colorTexture) {
      return null;
    }

    const SubLayerClass = this.getSubLayerClass('roamesicon', RoamesIconLayer);

    return new SubLayerClass({
      id: `${this.id}-roames-ground-control`,
      data: gcpData,
      heightTexture: totalWeightsTexture,
      pickable: true,
      iconAtlas:
        'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website/icon-atlas.png',
      iconMapping: {
        marker: {
          x: 128,
          y: 0,
          width: 128,
          height: 128,
          mask: true
        }
      },
      sizeScale: 10,
      billboard: true,
      colorTexture,
      colorDomainTexture,
      getPosition: d => d.geometry.coordinates,
      getIcon: d => 'marker',
      getSize: d => 5,
      nullValue,
      updateTriggers: {
        heightTexture: totalWeightsTexture,
        colorDomainTexture
      }
    });
  }

  _createPointCloudTileLayer(tileHeader) {
    const {attributes, pointCount, cartographicOrigin, modelMatrix} = tileHeader.content;
    const {positions, gpsPositions, gpsDirections, normals, colors} = attributes;

    if (!positions || !gpsPositions || !gpsDirections) {
      return null;
    }

    const {pointSize, pointColor, xTranslation, yTranslation, zTranslation, bounds} = this.props;
    const {quaternion} = this.state;

    const pcAttributes = {
      POSITION: positions,
      GPS_POSITION: gpsPositions,
      GPS_DIRECTION: gpsDirections,
      NORMAL: normals
    };

    if (!pointColor) {
      pcAttributes.COLOR_0 = colors;
    }

    const SubLayerClass = this.getSubLayerClass('pointcloud', RoamesPointCloudLayer);
    return new SubLayerClass(
      {
        pointSize
      },
      this.getSubLayerProps({
        id: 'pointcloud'
      }),
      {
        id: `${this.id}-pointcloud-${tileHeader.id}`,
        data: {
          header: {
            vertexCount: pointCount
          },
          attributes: pcAttributes
        },
        coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS,
        coordinateOrigin: cartographicOrigin,
        modelMatrix,
        bounds,
        quaternion,
        xTranslation,
        yTranslation,
        zTranslation,
        getColor: pointColor
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

    const verticies = createBoundingBox(boundingVolumeCenter, boundVolume);
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

  _createGPSLayer(tileHeader) {
    const {
      attributes,
      pointCount,
      constantRGBA,
      cartographicOrigin,
      modelMatrix
    } = tileHeader.content;

    const {gpsPositions} = attributes;
    if (!gpsPositions) {
      return null;
    }
    const {pointSize, getPointColor} = this.props;

    const SubLayerClass = this.getSubLayerClass('pointcloud', PointCloudLayer);
    return new SubLayerClass(
      {
        pointSize
      },
      this.getSubLayerProps({
        id: 'pointcloud'
      }),
      {
        id: `${this.id}-gps-pointcloud-${tileHeader.id}`,
        data: {
          header: {
            vertexCount: pointCount
          },
          attributes: {
            POSITION: gpsPositions
          }
        },
        coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS,
        coordinateOrigin: cartographicOrigin,
        modelMatrix,
        getColor: constantRGBA || getPointColor
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

  /* eslint-disable complexity, max-statements */
  _createLayer(tile, layer, layerMap, type) {
    if (!tile.content || tile.content.type !== 'pnts') {
      return null;
    }

    // render selected tiles
    if (tile.selected) {
      // create layer
      if (!layer) {
        if (!tile.content) {
          return null;
        }

        if (type === 'bound') {
          layer = this._createBoundingBoxTileLayer(tile);
          layerMap[`${tile.id}-bound`] = {layer, tile};
        }

        if (type === 'gps') {
          layer = this._createGPSLayer(tile);
          layerMap[`${tile.id}-gps`] = {layer, tile};
        }

        if (type === 'points') {
          layer = this._createPointCloudTileLayer(tile);
          layerMap[`${tile.id}-points`] = {layer, tile};
        }

        if (type === 'height') {
          layer = this._createHeightTileLayer(tile);
          layerMap[`${tile.id}-height`] = {layer, tile};
        }
      }

      const {pointColorChanged, rotationChanged, translationChanged, boundsChanged} = this.state;

      if (rotationChanged || translationChanged) {
        if (type === 'points') {
          layer = this._createPointCloudTileLayer(tile);
          layerMap[`${tile.id}-points`] = {layer, tile};
        } else if (type === 'height') {
          layer = this._createHeightTileLayer(tile);
          layerMap[`${tile.id}-height`] = {layer, tile};
        }
      }

      if (pointColorChanged || boundsChanged) {
        if (type === 'points') {
          layer = this._createPointCloudTileLayer(tile);
          layerMap[`${tile.id}-points`] = {layer, tile};
        }
      }

      // update layer visibility
      if (layer && layer.props && !layer.props.visible) {
        // Still has GPU resource but visibility is turned off so turn it back on so we can render it.
        layer = layer.clone({visible: true});
        if (type === 'bound') {
          layerMap[`${tile.id}-bound`].layer = layer;
        }

        if (type === 'gps') {
          layerMap[`${tile.id}-gps`].layer = layer;
        }

        if (type === 'points') {
          layerMap[`${tile.id}-points`].layer = layer;
        }

        if (type === 'height') {
          layerMap[`${tile.id}-height`].layer = layer;
        }
      }
      return layer;
    }

    // hide non-selected tiles
    if (layer && layer.props && layer.props.visible) {
      // Still in tileset cache but doesn't need to render this frame. Keep the GPU resource bound but don't render it.
      this._hideSubLayer(tile, type);
    }
    return null;
  }
  /* eslint-enable complexity, max-statements */
}

Roames3DLayer.layerName = 'Roames3DLayer';
Roames3DLayer.defaultProps = defaultProps;
