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
import {Layer, project32, picking} from '@deck.gl/core';
import GL from '@luma.gl/constants';
import {Model, Geometry, getParameters} from '@luma.gl/core';

import vs from './roames-icon-layer-vertex.glsl';
import fs from './roames-icon-layer-fragment.glsl';
import IconManager from '../icon-layer/icon-manager';
import {updateBounds, worldToCommonTextureBounds} from '../../../core/src/utils/bound-utils';

const DEFAULT_COLOR = [0, 0, 0, 255];
const RESOLUTION = 2; // (number of common space pixels) / (number texels)
const SIZE_2K = 2048;
/*
 * @param {object} props
 * @param {Texture2D | string} props.iconAtlas - atlas image url or texture
 * @param {object} props.iconMapping - icon names mapped to icon definitions
 * @param {object} props.iconMapping[icon_name].x - x position of icon on the atlas image
 * @param {object} props.iconMapping[icon_name].y - y position of icon on the atlas image
 * @param {object} props.iconMapping[icon_name].width - width of icon on the atlas image
 * @param {object} props.iconMapping[icon_name].height - height of icon on the atlas image
 * @param {object} props.iconMapping[icon_name].anchorX - x anchor of icon on the atlas image,
 *   default to width / 2
 * @param {object} props.iconMapping[icon_name].anchorY - y anchor of icon on the atlas image,
 *   default to height / 2
 * @param {object} props.iconMapping[icon_name].mask - whether icon is treated as a transparency
 *   mask. If true, user defined color is applied. If false, original color from the image is
 *   applied. Default to false.
 * @param {number} props.size - icon size in pixels
 * @param {func} props.getPosition - returns anchor position of the icon, in [lng, lat, z]
 * @param {func} props.getIcon - returns icon name as a string
 * @param {func} props.getSize - returns icon size multiplier as a number
 * @param {func} props.getColor - returns color of the icon in [r, g, b, a]. Only works on icons
 *   with mask: true.
 * @param {func} props.getAngle - returns rotating angle (in degree) of the icon.
 */
const defaultProps = {
  iconAtlas: {type: 'object', value: null, async: true},
  iconMapping: {type: 'object', value: {}, async: true},
  sizeScale: {type: 'number', value: 1, min: 0},
  billboard: true,
  sizeUnits: 'pixels',
  sizeMinPixels: {type: 'number', min: 0, value: 0}, //  min point radius in pixels
  sizeMaxPixels: {type: 'number', min: 0, value: Number.MAX_SAFE_INTEGER}, // max point radius in pixels
  alphaCutoff: {type: 'number', value: 0.05, min: 0, max: 1},

  getPosition: {type: 'accessor', value: (x) => x.position},
  getIcon: {type: 'accessor', value: (x) => x.icon},
  getColor: {type: 'accessor', value: DEFAULT_COLOR},
  getSize: {type: 'accessor', value: 1},
  getAngle: {type: 'accessor', value: 0},
  getPixelOffset: {type: 'accessor', value: [0, 0]},
  getTexCoords: {type: 'accesor', value: [0, 0]},
  heightTexture: null,
  nullValue: -2147483648
};

export default class RoamesIconLayer extends Layer {
  getShaders() {
    return super.getShaders({vs, fs, modules: [project32, picking]});
  }

  initializeState() {
    this.state = {
      iconManager: new IconManager(this.context.gl, {onUpdate: () => this._onUpdate()})
    };

    const attributeManager = this.getAttributeManager();
    /* eslint-disable max-len */
    attributeManager.addInstanced({
      instancePositions: {
        size: 3,
        type: GL.DOUBLE,
        fp64: this.use64bitPositions(),
        transition: true,
        accessor: 'getPosition'
      },
      instanceSizes: {
        size: 1,
        transition: true,
        accessor: 'getSize',
        defaultValue: 1
      },
      instanceOffsets: {size: 2, accessor: 'getIcon', transform: this.getInstanceOffset},
      instanceIconFrames: {size: 4, accessor: 'getIcon', transform: this.getInstanceIconFrame},
      instanceColorModes: {
        size: 1,
        type: GL.UNSIGNED_BYTE,
        accessor: 'getIcon',
        transform: this.getInstanceColorMode
      },
      instanceColors: {
        size: this.props.colorFormat.length,
        type: GL.UNSIGNED_BYTE,
        normalized: true,
        transition: true,
        accessor: 'getColor',
        defaultValue: DEFAULT_COLOR
      },
      instanceAngles: {
        size: 1,
        transition: true,
        accessor: 'getAngle'
      },
      instancePixelOffset: {
        size: 2,
        transition: true,
        accessor: 'getPixelOffset'
      }
    });

    const {gl} = this.context;
    this.setState({textureSize: Math.min(SIZE_2K, getParameters(gl, gl.MAX_TEXTURE_SIZE))});
    /* eslint-enable max-len */
  }

  shouldUpdateState({changeFlags}) {
    return changeFlags.somethingChanged;
  }

  /* eslint-disable max-statements, complexity */
  updateState({oldProps, props, changeFlags}) {
    super.updateState({props, oldProps, changeFlags});

    const attributeManager = this.getAttributeManager();
    const {iconAtlas, iconMapping, data, getIcon} = props;
    const {iconManager} = this.state;

    iconManager.setProps({loadOptions: props.loadOptions});

    let iconMappingChanged = false;
    const prePacked = iconAtlas || this.internalState.isAsyncPropLoading('iconAtlas');

    // prepacked iconAtlas from user
    if (prePacked) {
      if (oldProps.iconAtlas !== props.iconAtlas) {
        iconManager.setProps({iconAtlas, autoPacking: false});
      }

      if (oldProps.iconMapping !== props.iconMapping) {
        iconManager.setProps({iconMapping});
        iconMappingChanged = true;
      }
    } else {
      // otherwise, use autoPacking
      iconManager.setProps({autoPacking: true});
    }

    if (
      changeFlags.dataChanged ||
      (changeFlags.updateTriggersChanged &&
        (changeFlags.updateTriggersChanged.all || changeFlags.updateTriggersChanged.getIcon))
    ) {
      iconManager.setProps({data, getIcon});
    }

    if (iconMappingChanged) {
      attributeManager.invalidate('instanceOffsets');
      attributeManager.invalidate('instanceIconFrames');
      attributeManager.invalidate('instanceColorModes');
    }

    if (changeFlags.extensionsChanged) {
      const {gl} = this.context;
      if (this.state.model) {
        this.state.model.delete();
      }
      this.setState({model: this._getModel(gl)});
      attributeManager.invalidateAll();
    }

    if (changeFlags.viewportChanged) {
      const {worldBounds, textureSize} = this.state;

      const newState = {};
      changeFlags.boundsChanged = updateBounds(
        this.context.viewport,
        worldBounds,
        {textureSize, resolution: RESOLUTION},
        newState,
        true
      );
      this.setState(newState);
    }
  }
  /* eslint-enable max-statements, complexity */

  get isLoaded() {
    return super.isLoaded && this.state.iconManager.isLoaded;
  }

  finalizeState() {
    super.finalizeState();
    // Release resources held by the icon manager
    this.state.iconManager.finalize();
  }

  draw({uniforms}) {
    const {
      sizeScale,
      sizeMinPixels,
      sizeMaxPixels,
      sizeUnits,
      billboard,
      alphaCutoff,
      heightTexture,
      colorTexture,
      colorDomain,
      nullValue
    } = this.props;
    const {iconManager, textureSize, worldBounds} = this.state;
    const {viewport} = this.context;

    const {coordinateSystem, coordinateOrigin} = this.props;
    // convert world bounds to common using Layer's coordiante system and origin
    const commonBounds = worldToCommonTextureBounds(
      worldBounds,
      viewport,
      {textureSize, resolution: RESOLUTION},
      coordinateSystem,
      coordinateOrigin
    );

    const iconsTexture = iconManager.getTexture();
    if (iconsTexture && iconsTexture.loaded) {
      this.state.model
        .setUniforms(
          Object.assign({}, uniforms, {
            iconsTexture,
            iconsTextureDim: [iconsTexture.width, iconsTexture.height],
            sizeScale: sizeScale * (sizeUnits === 'pixels' ? viewport.metersPerPixel : 1),
            sizeMinPixels,
            sizeMaxPixels,
            billboard,
            alphaCutoff,
            heightTexture,
            colorTexture,
            colorDomain,
            nullValue,
            commonBounds,
            textureSize,
            zoomLevel: viewport.zoom
          })
        )
        .draw();
    }
  }

  _getModel(gl) {
    // The icon-layer vertex shader uses 2d positions
    // specifed via: attribute vec2 positions;
    const positions = [-1, -1, -1, 1, 1, 1, 1, -1];

    return new Model(
      gl,
      Object.assign({}, this.getShaders(), {
        id: this.props.id,
        geometry: new Geometry({
          drawMode: GL.TRIANGLE_FAN,
          attributes: {
            // The size must be explicitly passed here otherwise luma.gl
            // will default to assuming that positions are 3D (x,y,z)
            positions: {
              size: 2,
              value: new Float32Array(positions)
            }
          }
        }),
        isInstanced: true
      })
    );
  }

  _onUpdate() {
    this.setNeedsRedraw();
  }

  getInstanceOffset(icon) {
    const rect = this.state.iconManager.getIconMapping(icon);
    return [rect.width / 2 - rect.anchorX || 0, rect.height / 2 - rect.anchorY || 0];
  }

  getInstanceColorMode(icon) {
    const mapping = this.state.iconManager.getIconMapping(icon);
    return mapping.mask ? 1 : 0;
  }

  getInstanceIconFrame(icon) {
    const rect = this.state.iconManager.getIconMapping(icon);
    return [rect.x || 0, rect.y || 0, rect.width || 0, rect.height || 0];
  }
}

RoamesIconLayer.layerName = 'RoamesIconLayer';
RoamesIconLayer.defaultProps = defaultProps;
