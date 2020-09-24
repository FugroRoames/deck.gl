// Copyright (c) 2015 - 2019 Uber Technologies, Inc.
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

/* global setTimeout clearTimeout */
import GL from '@luma.gl/constants';
import {getParameters, FEATURES, hasFeatures} from '@luma.gl/core';
import {AttributeManager, log} from '@deck.gl/core';

import AggregationLayer from '../aggregation-layer';
import {updateBounds, worldToCommonTextureBounds} from '../../../core/src/utils/bound-utils';

const RESOLUTION = 2; // (number of common space pixels) / (number texels)
const SIZE_2K = 2048;
const ZOOM_DEBOUNCE = 500; // milliseconds

const defaultProps = {
  getPosition: {type: 'accessor', value: x => x.position},
  radiusPixels: {type: 'number', min: 1, max: 100, value: 5},
  threshold: {type: 'number', min: 0, max: 1, value: 0.05},
  totalWeightsTransform: null
};

const REQUIRED_FEATURES = [
  FEATURES.BLEND_EQUATION_MINMAX, // max weight calculation
  FEATURES.TEXTURE_FLOAT // weight-map as texture
  // FEATURES.FLOAT_BLEND, // implictly supported when TEXTURE_FLOAT is supported
];

const DIMENSIONS = {
  data: {
    props: ['radiusPixels']
  }
};

// support loaders.gl point cloud format
function normalizeData(data) {
  const {header, attributes} = data;
  if (!header || !attributes) {
    return;
  }

  data.length = header.vertexCount;

  if (attributes.POSITION) {
    attributes.positions = attributes.POSITION;
  }
}

export default class RoamesPointCloudLayer extends AggregationLayer {
  initializeState() {
    const {gl} = this.context;
    const {totalWeightsTransform} = this.props;

    if (!hasFeatures(gl, REQUIRED_FEATURES)) {
      this.setState({supported: false});
      log.error(`HeatmapLayer: ${this.id} is not supported on this browser`)();
      return;
    }
    super.initializeState(DIMENSIONS);
    this._setupTextureParams();
    this._setupAttributes();
    this.setState({supported: true, totalWeightsTransform});
  }

  shouldUpdateState({changeFlags}) {
    // Need to be updated when viewport changes
    return changeFlags.somethingChanged;
  }

  /* eslint-disable complexity */
  /* eslint-disable max-statements */
  updateState(opts) {
    if (!this.state.supported) {
      return;
    }

    super.updateState(opts);
    const {props} = opts;
    const {worldBounds, textureSize} = this.state;
    const changeFlags = this._getChangeFlags(opts);

    if (changeFlags.dataChanged) {
      normalizeData(props.data);
    }

    if (changeFlags.viewportChanged) {
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

    if (changeFlags.dataChanged || changeFlags.boundsChanged) {
      this._updateWeightmap();
    } else if (changeFlags.viewportZoomChanged) {
      this._debouncedUpdateWeightmap();
    }

    this.setState({zoom: opts.context.viewport.zoom});
  }

  finalizeState() {
    super.finalizeState();
    const {updateTimer} = this.state;
    /* eslint-disable no-unused-expressions */
    updateTimer && clearTimeout(updateTimer);
    /* eslint-enable no-unused-expressions */
  }

  // PRIVATE
  // override Composite layer private method to create AttributeManager instance
  _getAttributeManager() {
    return new AttributeManager(this.context.gl, {
      id: this.props.id,
      stats: this.context.stats
    });
  }

  _getChangeFlags(opts) {
    const changeFlags = {};
    const {dimensions} = this.state;
    changeFlags.dataChanged =
      this.isAttributeChanged() || // if any attribute is changed
      this.isAggregationDirty(opts, {
        compareAll: true,
        dimension: dimensions.data
      });
    changeFlags.viewportChanged = opts.changeFlags.viewportChanged;

    const {zoom} = this.state;
    if (!opts.context.viewport || opts.context.viewport.zoom !== zoom) {
      changeFlags.viewportZoomChanged = true;
    }

    return changeFlags;
  }

  _setupAttributes() {
    const attributeManager = this.getAttributeManager();
    attributeManager.add({
      positions: {
        size: 3,
        type: GL.DOUBLE,
        fp64: this.use64bitPositions(),
        transition: true,
        accessor: 'getPosition'
      }
    });

    this.setState({positionAttributeName: 'positions'});
  }

  _setupTextureParams() {
    const {gl} = this.context;
    const textureSize = Math.min(SIZE_2K, getParameters(gl, gl.MAX_TEXTURE_SIZE));
    const floatTargetSupport = hasFeatures(gl, FEATURES.COLOR_ATTACHMENT_RGBA32F);
    const weightsScale = floatTargetSupport ? 1 : 1 / 255;
    this.setState({textureSize, weightsScale});
    if (!floatTargetSupport) {
      log.warn(
        `RoamesPointCloudLayer: ${
          this.id
        } rendering to float texture not supported, fallingback to low precession format`
      )();
    }
  }

  _updateWeightmap() {
    const {radiusPixels, coordinateSystem, coordinateOrigin} = this.props;
    const {viewport} = this.context;
    const {totalWeightsTransform, worldBounds, textureSize, weightsScale} = this.state;

    // convert world bounds to common using Layer's coordiante system and origin
    const commonBounds = worldToCommonTextureBounds(
      worldBounds,
      viewport,
      {textureSize, resolution: RESOLUTION},
      coordinateSystem,
      coordinateOrigin
    );

    const uniforms = {
      radiusPixels,
      commonBounds,
      textureWidth: textureSize,
      weightsScale
    };

    // Attribute manager sets data array count as instaceCount on model
    // we need to set that as elementCount on 'weightsTransform'
    totalWeightsTransform.update({
      elementCount: this.getNumInstances()
    });

    totalWeightsTransform.run({
      uniforms,
      parameters: {
        blend: true,
        blendFunc: [GL.ONE, GL.ONE],
        blendEquation: GL.MAX
      },
      clearRenderTarget: false,
      attributes: this.getAttributes(),
      moduleSettings: this.getModuleSettings()
    });
    this.setState({lastUpdate: Date.now()});
  }

  _debouncedUpdateWeightmap(fromTimer = false) {
    let {updateTimer} = this.state;
    const {worldBounds, textureSize} = this.state;
    const timeSinceLastUpdate = Date.now() - this.state.lastUpdate;

    if (fromTimer) {
      updateTimer = null;
    }

    if (timeSinceLastUpdate >= ZOOM_DEBOUNCE) {
      // update
      const newState = {};
      updateBounds(
        this.context.viewport,
        worldBounds,
        {textureSize, resolution: RESOLUTION},
        newState,
        true
      );
      this.setState(newState);
      this._updateWeightmap();
    } else if (!updateTimer) {
      updateTimer = setTimeout(
        this._debouncedUpdateWeightmap.bind(this, true),
        ZOOM_DEBOUNCE - timeSinceLastUpdate
      );
    }

    this.setState({updateTimer});
  }
}

RoamesPointCloudLayer.layerName = 'RoamesPointCloudLayer';
RoamesPointCloudLayer.defaultProps = defaultProps;
