import GL from '@luma.gl/constants';
import {Buffer, Texture2D, getParameters} from '@luma.gl/core';

import {CompositeLayer} from '@deck.gl/core';

import {log} from '@deck.gl/core';

import {Tiles3DLoader} from '@loaders.gl/3d-tiles';

import TriangleLayer from './triangle-layer';
import Roames3DLayer from '../roames-3d-layer/roames-3d-layer';
import {PolygonLayer, RoamesIconLayer} from '@deck.gl/layers';

import {colorRangeToFlatArray} from '../../../aggregation-layers/src/utils/color-utils';
import {
  updateBounds,
  getTextureCoordinates,
  packVertices,
  packVertices64,
  packVertix64
} from '../../../core/src/utils/bound-utils';

const NULL_VALUE = -2147483648;
const SIZE_2K = 2048;

const defaultProps = {
  getPointColor: [0, 0, 0],
  colorDomain: {type: 'array', value: [-10, 10], optional: true},
  pointSize: 1.0,
  colorRange: [
    [240, 8, 244],
    [253, 151, 6],
    [253, 253, 19],
    [251, 51, 51],
    [0, 252, 253],
    [99, 253, 97],
    [9, 153, 3],
    [0, 0, 200]
  ],
  data: null,
  loadOptions: {},
  loader: Tiles3DLoader,
  boundingBox: false,
  points: false,
  gpsPoints: false,
  getBoundBox: {start: null, end: null, widthPoint: null, interEnd: null, interWidth: null},
  bounds: null,
  nullValue: NULL_VALUE,
  groundPointData: null,
  onTilesetLoad: tileset3d => {},
  onTileLoad: tileHeader => {},
  onTileUnload: tileHeader => {},
  onTileError: (tile, message, url) => {}
};

const TEXTURE_OPTIONS = {
  mipmaps: false,
  parameters: {
    [GL.TEXTURE_MAG_FILTER]: GL.NEAREST,
    [GL.TEXTURE_MIN_FILTER]: GL.NEAREST,
    [GL.TEXTURE_WRAP_S]: GL.CLAMP_TO_EDGE,
    [GL.TEXTURE_WRAP_T]: GL.CLAMP_TO_EDGE
  },
  dataFormat: GL.RGBA
};

const dummyArray = new Float64Array();

export default class BoresightLayer extends CompositeLayer {
  initializeState() {
    const {gl} = this.context;

    if ('onTileLoadFail' in this.props) {
      log.removed('onTileLoadFail', 'onTileError')();
    }
    const textureSize = Math.min(SIZE_2K, getParameters(gl, gl.MAX_TEXTURE_SIZE));

    this.setState({
      layerMap: {},
      textureSize,
      boundBox: this.props.getBoundBox,
      bounds: this.props.bounds
    });
    this._createBuffers();
  }

  shouldUpdateState({changeFlags}) {
    return changeFlags.somethingChanged;
  }

  updateState(opts) {
    const {props, oldProps} = opts;

    // update state everytime ..?
    const {viewport} = this.context;
    const {worldBounds, textureSize, layerMap} = this.state;

    // if (changeFlags.viewportChanged) {
    const newState = {};
    updateBounds(viewport, worldBounds, {textureSize, resolution: 2}, newState, true);
    this.setState(newState);
    // }

    if (props.colorRange !== oldProps.colorRange) {
      this._updateColorTexture(opts);
    }

    if (oldProps.data && props.data !== oldProps.data) {
      for (const key in props.data) {
        const rotation = props.data[key].rotation;
        const oldRotation = oldProps.data[key].rotation;

        if (this._rotationChanged(rotation, oldRotation)) {
          layerMap[key].rotated = true;
        } else {
          layerMap[key].rotated = false;
        }

        const translation = props.data[key].translation;
        const oldTranslation = oldProps.data[key].translation;
        if (this._translationChanged(translation, oldTranslation)) {
          layerMap[key].translated = true;
        } else {
          layerMap[key].translated = false;
        }
      }
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

  getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
  }

  /* eslint-disable complexity, max-statements */
  renderLayers() {
    const {layerMap, bounds} = this.state;
    const {data, boundingBox, points, gpsPoints, nullValue} = this.props;

    const subLayers = [];
    // Calculate the texture for each tiles 3d dataset
    // call Roames3DLayer for each dataset
    for (const dataUrl in data) {
      const transforms = data[dataUrl];
      const rot = transforms.rotation;
      const tran = transforms.translation;
      let layer = layerMap[dataUrl] && layerMap[dataUrl].layer;
      if (!layer) {
        layer = new Roames3DLayer({
          id: `${this.id}-roames-3d-layer-${dataUrl}`,
          data: dataUrl,
          loader: this.props.loader,
          loadOptions: this.props.loadOptions,
          colorRange: this.props.colorRange,
          boundingBox,
          gpsPoints,
          points,
          nullValue,
          onTilesetLoad: this.props.onTilesetLoad,
          xRotation: rot.xRotation,
          yRotation: rot.yRotation,
          zRotation: rot.zRotation,
          xTranslation: tran.xTranslation,
          yTranslation: tran.yTranslation,
          zTranslation: tran.zTranslation,
          getPointColor: [
            this.getRandomInt(255),
            this.getRandomInt(255),
            this.getRandomInt(255),
            255
          ],
          bounds
        });
        layerMap[dataUrl] = {layer, dataURL: dataUrl, rotated: false, translated: false};
      } else if (layerMap[dataUrl].rotated) {
        layer.updateRotation(rot.xRotation, rot.yRotation, rot.zRotation);
      } else if (layerMap[dataUrl].translated) {
        layer.updateTranslation(tran.xTranslation, tran.yTranslation, tran.zTranslation);
      } else if (this.state.subLayerToggled) {
        layer.updateLayerToggle(boundingBox, points, gpsPoints);
      }

      if (bounds) {
        layer.updateBounds(bounds);
      }

      if (layer && layer.props && !layer.props.visible) {
        // Still has GPU resource but visibility is turned off so turn it back on so we can render it.
        layer = layer.clone({visible: true});
        layerMap[dataUrl].layer = layer;
      }
      subLayers.push(layer);
    }

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
                positions: {
                  buffer: triPositionBuffer,
                  value: dummyArray
                },
                texCoords: triTexCoordBuffer
              }
            },
            vertexCount: 4,
            colorTexture: this.state.colorTexture,
            textureone: textures[0],
            texturetwo: textures[1],
            colorDomain: this.props.colorDomain,
            nullValue
          }
        )
      );
    }

    // Create bounds for DH layer
    if (this.props.getBoundBox.interEnd || this.props.getBoundBox.end) {
      const start = this.props.getBoundBox.start;
      const end = this.props.getBoundBox.end;
      const widthPoint = this.props.getBoundBox.widthPoint;
      const interEnd = this.props.getBoundBox.interEnd;
      const interWidth = this.props.getBoundBox.interWidth;

      let wPoint = interWidth || [0, 0, 0];
      let to = interEnd;

      if (end) {
        to = end;
      }

      if (widthPoint) {
        wPoint = widthPoint;
      }

      const boundBox = this._getBounds(start, to, wPoint);
      this.setState({bounds: boundBox});

      const polyLayer = new PolygonLayer({
        id: 'polygon-bound-layer',
        data: [{bounds: boundBox}],
        pickable: false,
        stroked: true,
        wireframe: true,
        opacity: 0.1,
        getLineWidth: 1,
        getPolygon: d => d.bounds,
        getFillColor: [255, 0, 0]
      });

      subLayers.push(polyLayer);
    }

    if (this.props.groundPointData && textures[0]) {
      const {groundStationCoordBuffer} = this.state;

      const groundControlLayer = new RoamesIconLayer({
        id: 'ground-control-layer',
        data: this.props.groundPointData,
        heightTexture: textures[0],
        pickable: false,
        iconAtlas:
          'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website/icon-atlas.png',
        iconMapping: {
          marker: {
            x: 0,
            y: 0,
            width: 128,
            height: 128,
            mask: true
          }
        },
        sizeScale: 5,
        billboard: true,
        colorTexture: this.state.colorTexture,
        colorDomain: this.props.colorDomain,
        getPosition: d => d.coordinates,
        getIcon: d => 'marker',
        getSize: d => 5,
        getColor: d => [d.coordinates[2], 140, 140],
        getTexCoords: groundStationCoordBuffer.getData(),
        nullValue,
        updateTriggers: {
          getTexCoords: groundStationCoordBuffer.getData(),
          heightTexture: textures[0]
        }
      });
      subLayers.push(groundControlLayer);
    }

    return subLayers;
  }
  /* eslint-enable complexity, max-statements */

  finalizeState() {
    super.finalizeState();
    const {
      colorTexture,
      triPositionBuffer,
      triTexCoordBuffer,
      groundStationCoordBuffer
    } = this.state;
    if (colorTexture) {
      colorTexture.delete();
    }
    if (triPositionBuffer) {
      triPositionBuffer.delete();
    }
    if (triTexCoordBuffer) {
      triTexCoordBuffer.delete();
    }
    if (groundStationCoordBuffer) {
      groundStationCoordBuffer.delete();
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
      }),
      groundStationCoordBuffer: new Buffer(gl, {
        byteLength: 16,
        accessor: {size: 2}
      })
    });
  }

  _updateTextureRenderingBounds() {
    // Just render visible portion of the texture
    const {
      triPositionBuffer,
      triTexCoordBuffer,
      groundStationCoordBuffer,
      normalizedCommonBounds,
      viewportCorners
    } = this.state;

    const {viewport} = this.context;

    triPositionBuffer.subData(packVertices64(viewportCorners, 3));

    const textureBounds = viewportCorners.map(p =>
      getTextureCoordinates(viewport.projectPosition(p), normalizedCommonBounds)
    );
    triTexCoordBuffer.subData(packVertices(textureBounds, 2));

    if (this.props.groundPointData) {
      const p = [
        this.props.groundPointData[0].coordinates[0],
        this.props.groundPointData[0].coordinates[1]
      ];
      const webmercatorP = viewport.projectPosition(p);
      const heightTexturePoint = getTextureCoordinates(webmercatorP, normalizedCommonBounds);
      groundStationCoordBuffer.subData(packVertix64(heightTexturePoint, 2));
    }
  }

  _updateColorTexture(opts) {
    const {colorRange} = opts.props;
    let {colorTexture} = this.state;

    const colors = colorRangeToFlatArray(colorRange, false, Uint8Array);
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
        format: GL.RGBA,
        ...TEXTURE_OPTIONS
      });
    }
    this.setState({colorTexture});
  }

  _rotationChanged(rot1, rot2) {
    if (
      rot1.xRotation !== rot2.xRotation ||
      rot1.yRotation !== rot2.yRotation ||
      rot1.zRotation !== rot2.zRotation
    ) {
      return true;
    }
    return false;
  }

  _translationChanged(tran1, tran2) {
    if (
      tran1.xTranslation !== tran2.xTranslation ||
      tran1.yTranslation !== tran2.yTranslation ||
      tran1.zTranslation !== tran2.zTranslation
    ) {
      return true;
    }
    return false;
  }

  _getBounds(startP, endP, widthP, defaultWidth = 0.0001) {
    const {viewport} = this.context;
    let widthSet = true;
    if (widthP[0] === 0 && widthP[1] === 0 && widthP[2] === 0) {
      widthSet = false;
    }

    const start = viewport.projectPosition(startP);
    const to = viewport.projectPosition(endP);
    const wPoint = viewport.projectPosition(widthP);

    let width = defaultWidth;
    if (widthSet) {
      width = this._pointToLine(start, to, wPoint);
    }

    const line_vec = [start[0] - to[0], start[1] - to[1]];
    const ext1 = this._getExtrusionOffset(line_vec, -1, width);
    const ext2 = this._getExtrusionOffset(line_vec, 1, width);

    const bounds_mercator = [
      [start[0] + ext1[0], start[1] + ext1[1]],
      [to[0] + ext1[0], to[1] + ext1[1]],
      [to[0] + ext2[0], to[1] + ext2[1]],
      [start[0] + ext2[0], start[1] + ext2[1]]
    ];

    const bounds = [
      viewport.unprojectPosition(bounds_mercator[0]),
      viewport.unprojectPosition(bounds_mercator[1]),
      viewport.unprojectPosition(bounds_mercator[2]),
      viewport.unprojectPosition(bounds_mercator[3])
    ];

    return bounds;
  }

  // Get the offset point from linevec with the width in the offeset direction
  _getExtrusionOffset(line_vec, offset_direction, width) {
    const perp_vec = [-1.0 * line_vec[1], line_vec[0]];
    const norm = Math.sqrt(Math.pow(perp_vec[0], 2) + Math.pow(perp_vec[1], 2));
    const unit_perp_vec = [perp_vec[0] / norm, perp_vec[1] / norm];

    const offset_transform = offset_direction * width;
    return [unit_perp_vec[0] * offset_transform, unit_perp_vec[1] * offset_transform];
  }

  // Shortest distance from p3 to the vector p1->p2
  _pointToLine(p1, p2, p3) {
    return (
      Math.abs(p3[0] * (p2[1] - p1[1]) - p3[1] * (p2[0] - p1[0]) + p2[0] * p1[1] - p2[1] * p1[0]) /
      Math.sqrt(Math.pow(p2[1] - p1[1], 2) + Math.pow(p2[0] - p1[0], 2))
    );
  }
}

BoresightLayer.layerName = 'BoresightLayer';
BoresightLayer.defaultProps = defaultProps;
