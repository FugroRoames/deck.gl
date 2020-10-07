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

import {Layer, project32, gouraudLighting, picking} from '@deck.gl/core';
import GL from '@luma.gl/constants';
import {Model, Geometry} from '@luma.gl/core';

import vs from './roames-point-cloud-layer-vertex.glsl';
import fs from './roames-point-cloud-layer-fragment.glsl';

const DEFAULT_COLOR = [0, 0, 0, 255];
const DEFAULT_NORMAL = [0, 0, 1];

const defaultProps = {
  sizeUnits: 'pixels',
  pointSize: {type: 'number', min: 0, value: 10}, //  point radius in pixels
  xRotationRad: {type: 'number', value: 0}, //  point radius in pixels
  yRotationRad: {type: 'number', value: 0}, //  point radius in pixels
  zRotationRad: {type: 'number', value: 0}, //  point radius in pixels
  xTranslation: {type: 'number', value: 0}, //  point radius in pixels
  yTranslation: {type: 'number', value: 0}, //  point radius in pixels
  zTranslation: {type: 'number', value: 0}, //  point radius in pixels
  getPosition: {type: 'accessor', value: x => x.position},
  getGpsPosition: {type: 'accessor', value: x => [0, 0, 0]},
  getGpsDirection: {type: 'accessor', value: x => [0, 0, 0, 0]},

  getNormal: {type: 'accessor', value: DEFAULT_NORMAL},
  getColor: {type: 'accessor', value: DEFAULT_COLOR},

  material: true,

  // Depreated
  radiusPixels: {deprecatedFor: 'pointSize'}
};

// support loaders.gl point cloud format
function normalizeData(data) {
  const {header, attributes} = data;
  if (!header || !attributes) {
    return;
  }

  data.length = header.vertexCount;

  if (attributes.POSITION) {
    attributes.instancePositions = attributes.POSITION;
  }
  if (attributes.GPS_POSITION) {
    attributes.gpsPositions = attributes.GPS_POSITION;
  }
  if (attributes.GPS_DIRECTION) {
    attributes.gpsDirections = attributes.GPS_DIRECTION;
  }
  if (attributes.NORMAL) {
    attributes.instanceNormals = attributes.NORMAL;
  }
  if (attributes.COLOR_0) {
    attributes.instanceColors = attributes.COLOR_0;
  }
}

export default class RoamesPointCloudLayer extends Layer {
  getShaders(id) {
    return super.getShaders({vs, fs, modules: [project32, gouraudLighting, picking]});
  }

  initializeState() {
    /* eslint-disable max-len */
    this.getAttributeManager().addInstanced({
      instancePositions: {
        size: 3,
        type: GL.DOUBLE,
        fp64: this.use64bitPositions(),
        transition: true,
        accessor: 'getPosition'
      },
      gpsPositions: {
        size: 3,
        type: GL.DOUBLE,
        fp64: this.use64bitPositions(),
        transition: true,
        accessor: 'getGpsPosition'
      },
      gpsDirections: {
        size: 4,
        type: GL.DOUBLE,
        fp64: this.use64bitPositions(),
        transition: true,
        accessor: 'getGpsDirection'
      },
      instanceNormals: {
        size: 3,
        transition: true,
        accessor: 'getNormal',
        defaultValue: DEFAULT_NORMAL
      },
      instanceColors: {
        size: this.props.colorFormat.length,
        type: GL.UNSIGNED_BYTE,
        normalized: true,
        transition: true,
        accessor: 'getColor',
        defaultValue: DEFAULT_COLOR
      }
    });
    this.setState({xRotationRad: 0, yRotationRad: 0, zRotationRad: 0});
    this.setState({xTranslation: 0, yTranslation: 0, zTranslation: 0});

    /* eslint-enable max-len */
  }

  updateState({props, oldProps, changeFlags}) {
    super.updateState({props, oldProps, changeFlags});
    if (changeFlags.extensionsChanged) {
      const {gl} = this.context;
      if (this.state.model) {
        this.state.model.delete();
      }
      this.setState({model: this._getModel(gl)});
      this.getAttributeManager().invalidateAll();
    }
    if (changeFlags.dataChanged) {
      normalizeData(props.data);
    }
  }

  draw({uniforms}) {
    const {viewport} = this.context;
    const {pointSize, sizeUnits} = this.props;
    const {
      xRotationRad,
      yRotationRad,
      zRotationRad,
      xTranslation,
      yTranslation,
      zTranslation
    } = this.state;
    const sizeMultiplier = sizeUnits === 'meters' ? 1 / viewport.metersPerPixel : 1;

    this.state.model
      .setUniforms(
        Object.assign({}, uniforms, {
          radiusPixels: pointSize * sizeMultiplier,
          xRotationRad,
          yRotationRad,
          zRotationRad,
          xTranslation,
          yTranslation,
          zTranslation
        })
      )
      .draw();
  }

  updateRotation(xRotation, yRotation, zRotation) {
    if (!this.state) {
      return;
    }
    const xRotationRad = xRotation * (Math.PI / 180);
    const yRotationRad = yRotation * (Math.PI / 180);
    const zRotationRad = zRotation * (Math.PI / 180);
    this.setState({xRotationRad, yRotationRad, zRotationRad});
  }

  updateTranslation(xTranslation, yTranslation, zTranslation) {
    if (!this.state) {
      return;
    }
    this.setState({xTranslation, yTranslation, zTranslation});
  }

  _getModel(gl) {
    // a triangle that minimally cover the unit circle
    const positions = [];
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      positions.push(Math.cos(angle) * 2, Math.sin(angle) * 2, 0);
    }

    return new Model(
      gl,
      Object.assign({}, this.getShaders(), {
        id: this.props.id,
        geometry: new Geometry({
          drawMode: GL.TRIANGLES,
          attributes: {
            positions: new Float32Array(positions)
          }
        }),
        isInstanced: true
      })
    );
  }
}

RoamesPointCloudLayer.layerName = 'RoamesPointCloudLayer';
RoamesPointCloudLayer.defaultProps = defaultProps;
