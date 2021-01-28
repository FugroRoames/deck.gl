import GL from '@luma.gl/constants';
import {Buffer, Texture2D, getParameters} from '@luma.gl/core';

import {CompositeLayer} from '@deck.gl/core';

import {log} from '@deck.gl/core';

import {Tiles3DLoader} from '@loaders.gl/3d-tiles';
import {GeoJSONLoader} from '@loaders.gl/json';
import {load} from '@loaders.gl/core';

import TriangleLayer from './triangle-layer';
import Roames3DLayer from '../roames-3d-layer/roames-3d-layer';
import {PolygonLayer} from '@deck.gl/layers';

import {colorRangeToFlatArray} from '../../../aggregation-layers/src/utils/color-utils';
import {
  updateBounds,
  getTextureCoordinates,
  packVertices,
  packVertices64
} from '../../../core/src/utils/bound-utils';

const NULL_VALUE = -2147483648;
const SIZE_2K = 2048;

const defaultProps = {
  getPointColor: [0, 0, 0],
  colorDomain: {type: 'array', value: [-10, 10], optional: true},
  pointSize: 1.0,
  colorRange: {
    type: 'array',
    value: [
      [240, 8, 244],
      [253, 151, 6],
      [253, 253, 19],
      [251, 51, 51],
      [0, 252, 253],
      [99, 253, 97],
      [9, 153, 3],
      [0, 0, 200]
    ]
  },
  data: null,
  loadOptions: {},
  loader: Tiles3DLoader,
  getBoundBox: {start: null, end: null, widthPoint: null, interEnd: null, interWidth: null},
  nullValue: NULL_VALUE,
  groundPointUrl: null,
  heightDiffTexture: true,
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

async function fetchGCP(url) {
  try {
    return await load(url, GeoJSONLoader);
  } catch (error) {
    throw new Error(`An error occurred fetching Ground Control Points: ${error}`);
  }
}

export default class BoresightLayer extends CompositeLayer {
  initializeState() {
    const {gl} = this.context;

    if ('onTileLoadFail' in this.props) {
      log.removed('onTileLoadFail', 'onTileError')();
    }
    const textureSize = Math.min(SIZE_2K, getParameters(gl, gl.MAX_TEXTURE_SIZE));

    this.setState({
      layerMap: {},
      textureSize
    });
    this._createBuffers();

    const {groundPointUrl} = this.props;
    if (groundPointUrl) {
      const groundPointPromise = fetchGCP(groundPointUrl);
      groundPointPromise.then(geojson => {
        this.setState({groundPointData: geojson.features, gcpLoaded: true});
      });
    }
  }

  shouldUpdateState({changeFlags}) {
    return changeFlags.somethingChanged;
  }

  /* eslint-disable complexity, max-statements */
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

    if (props.colorDomain !== oldProps.colorDomain) {
      this.setState({colorDomainChanged: true});
    }

    if (oldProps.data && props.data !== oldProps.data) {
      this._checkToggledChanges(oldProps, props);
    }
    this._updateTextureRenderingBounds();

    // Check to see if the bounding box for the points needs to be reset
    const {getBoundBox} = this.props;
    if (Object.keys(getBoundBox).length === 0) {
      this.setState({bounds: {}});
    }
  }
  /* eslint-enable complexity, max-statements */

  getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
  }

  /* eslint-disable complexity, max-statements */
  renderLayers() {
    const {layerMap, bounds, groundPointData, gcpLoaded, colorDomainChanged} = this.state;
    const {
      data,
      loader,
      loadOptions,
      colorRange,
      nullValue,
      heightDiffTexture,
      colorDomain
    } = this.props;
    const subLayers = [];
    // Calculate the texture for each tiles 3d dataset
    // call Roames3DLayer for each dataset
    for (const dataUrl in data) {
      const parameters = data[dataUrl];
      const rot = parameters.rotation;
      const tran = parameters.translation;
      const boundingBox = parameters.boundingBox;
      const points = parameters.points;
      const gpsPoints = parameters.gpsPoints;
      const groundControl = parameters.groundControl;
      const displayTexture = parameters.displayTexture;

      let layer = layerMap[dataUrl] && layerMap[dataUrl].layer;
      if (!layer) {
        layer = new Roames3DLayer({
          id: `${this.id}-roames-3d-layer-${dataUrl}`,
          data: dataUrl,
          loader,
          loadOptions,
          colorRange,
          colorDomain,
          boundingBox,
          points,
          gpsPoints,
          groundControl,
          displayTexture,
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
          bounds,
          groundPointData
        });
        layerMap[dataUrl] = {layer, dataURL: dataUrl, rotated: false, translated: false};
      } else if (layerMap[dataUrl].rotated) {
        layer.updateRotation(rot.xRotation, rot.yRotation, rot.zRotation);
      } else if (layerMap[dataUrl].translated) {
        layer.updateTranslation(tran.xTranslation, tran.yTranslation, tran.zTranslation);
      } else if (layerMap[dataUrl].subLayerToggled) {
        layer.updateLayerToggle(boundingBox, points, gpsPoints, groundControl);
      } else if (gcpLoaded) {
        layer.updateGroundPointData(groundPointData);
        this.setState({gcpLoaded: false});
      } else if (layerMap[dataUrl].displayTextureToggled) {
        layer.updateDisplayTexture(displayTexture);
      }

      if (colorDomainChanged) {
        layer.updateColorDomain(colorDomain);
        this.setState({colorDomainChanged: false});
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

    const {triPositionBuffer, triTexCoordBuffer, colorTexture} = this.state;

    // Send the textures to the Triangle layer which will diff the values (height) and render
    if (textures && heightDiffTexture) {
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
            colorTexture,
            textureone: textures[0],
            texturetwo: textures[1],
            colorDomain,
            nullValue
          }
        )
      );
    }

    const {getBoundBox} = this.props;
    // Create bounds for DH layer
    if (getBoundBox.interEnd || getBoundBox.end) {
      const start = getBoundBox.start;
      const end = getBoundBox.end;
      const widthPoint = getBoundBox.widthPoint;
      const interEnd = getBoundBox.interEnd;
      const interWidth = getBoundBox.interWidth;

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

    return subLayers;
  }
  /* eslint-enable complexity, max-statements */

  finalizeState() {
    super.finalizeState();
    const {colorTexture, triPositionBuffer, triTexCoordBuffer} = this.state;
    if (colorTexture) {
      colorTexture.delete();
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

  /* eslint-disable complexity, max-statements */
  _checkToggledChanges(oldProps, props) {
    const {layerMap} = this.state;
    for (const key in props.data) {
      if (key in layerMap) {
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

        // Check if any of the input props have been toggled
        const boundingbox = props.data[key].boundingBox;
        const oldBoundingbox = oldProps.data[key].boundingBox;
        const points = props.data[key].points;
        const oldPoints = oldProps.data[key].points;
        const gpsPoints = props.data[key].gpsPoints;
        const oldGpsPoints = oldProps.data[key].gpsPoints;
        const groundControl = props.data[key].groundControl;
        const oldGroundControl = oldProps.data[key].groundControl;

        if (
          boundingbox !== oldBoundingbox ||
          points !== oldPoints ||
          gpsPoints !== oldGpsPoints ||
          groundControl !== oldGroundControl
        ) {
          layerMap[key].subLayerToggled = true;
        } else {
          layerMap[key].subLayerToggled = false;
        }
        // Check if the texture should be displayed
        const displayTexture = props.data[key].displayTexture;
        const oldDisplayTexture = oldProps.data[key].displayTexture;

        if (displayTexture !== oldDisplayTexture) {
          layerMap[key].displayTextureToggled = true;
        } else {
          layerMap[key].displayTextureToggled = false;
        }
      }
    }
  }
  /* eslint-enable complexity, max-statements */

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
