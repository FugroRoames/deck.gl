import React, {Component} from 'react';
import App from 'website-roames/boresight-layer/app';
import {CesiumIonLoader, Tiles3DLoader} from '@loaders.gl/3d-tiles';

import {withPrefix} from 'gatsby';

import makeExample from '../components/example';

class BoresightDemo extends Component {
  static title = 'DZ - Flight Path 1 vs Flight Path 2';
  static parameters = {
    rotX: {displayName: 'Rotation X', value: 0, step: 0.001, type: 'range', min: -180, max: 180},
    rotY: {displayName: 'Rotation Y', value: 0, step: 0.001, type: 'range', min: -10, max: 10},
    rotZ: {displayName: 'Rotation Z', value: 0, step: 0.001, type: 'range', min: -10, max: 10},
    tranX: {
      displayName: 'Translation X',
      value: 0,
      step: 0.001,
      type: 'range',
      min: -100,
      max: 100
    },
    tranY: {
      displayName: 'Translation Y',
      value: 0,
      step: 0.001,
      type: 'range',
      min: -100,
      max: 100
    },
    tranZ: {
      displayName: 'Translation Z',
      value: 0,
      step: 0.001,
      type: 'range',
      min: -100,
      max: 100
    },
    colorMin: {displayName: 'Color Min', value: -10},
    colorMax: {displayName: 'Color Max', value: 10},
    data1: {
      displayName: 'Flight line 1',
      value: 'https://d3hwnz5sahda3g.cloudfront.net/flightline2/tileset.json'
    },
    data2: {
      displayName: 'Flight line 2',
      value: 'https://d3hwnz5sahda3g.cloudfront.net/flightline1/tileset.json'
    },
    boundingBox: {displayName: 'Bounding Box', value: false, type: 'checkbox'},
    points: {displayName: 'Points', value: false, type: 'checkbox'},
    gpsPoints: {displayName: 'GPS Points', value: false, type: 'checkbox'}

    // https://roames-hpc-home.s3-ap-southeast-2.amazonaws.com/users/peteroloughlin/gpspos2/tileset.json
  };

  static mapStyle = 'mapbox://styles/mapbox/light-v9';

  static renderInfo(meta) {
    return (
      <div>
        <p>Point cloud to DZ.</p>
        <div>
          <img
            src={withPrefix('/images/dz_boresight.png')}
            alt="color scale"
            style={{height: 8, width: '100%'}}
          />
        </div>
        <p>Change Flight Path 1 Rotation</p>
      </div>
    );
  }

  render() {
    const {params, data} = this.props;
    const rotX = params.rotX.value;
    const rotY = params.rotY.value;
    const rotZ = params.rotZ.value;
    const tranX = params.tranX.value;
    const tranY = params.tranY.value;
    const tranZ = params.tranZ.value;
    const colorMin = params.colorMin.value;
    const colorMax = params.colorMax.value;
    const data1 = params.data1.value;
    const data2 = params.data2.value;
    const boundingBox = params.boundingBox.value;
    const points = params.points.value;
    const gpsPoints = params.gpsPoints.value;

    return (
      <App
        {...this.props}
        data={{
          [data1]: {
            rotation: {
              xRotation: rotX,
              yRotation: rotY,
              zRotation: rotZ
            },
            translation: {
              xTranslation: tranX,
              yTranslation: tranY,
              zTranslation: tranZ
            }
          },
          [data2]: {
            rotation: {
              xRotation: 0,
              yRotation: 0,
              zRotation: 0
            },
            translation: {
              xTranslation: 0,
              yTranslation: 0,
              zTranslation: 0
            }
          }
        }}
        colorDomain={[colorMin, colorMax]}
        boundingBox={boundingBox}
        points={points}
        gpsPoints={gpsPoints}
        loader={Tiles3DLoader}
        loadOptions={{}}
        // loader={CesiumIonLoader}
        // loadOptions={{'cesium-ion': {accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWMxMzcyYy0zZjJkLTQwODctODNlNi01MDRkZmMzMjIxOWIiLCJpZCI6OTYyMCwic2NvcGVzIjpbImFzbCIsImFzciIsImdjIl0sImlhdCI6MTU2Mjg2NjI3M30.1FNiClUyk00YH_nWfSGpiQAjR5V2OvREDq1PJ5QMjWQ'}}}
      />
    );
  }
}

export default makeExample(BoresightDemo);
