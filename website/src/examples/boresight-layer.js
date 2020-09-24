import React, {Component} from 'react';
import App from 'website-roames/roames3dlayer/app';
import {CesiumIonLoader, Tiles3DLoader} from '@loaders.gl/3d-tiles';

import {withPrefix} from 'gatsby';

import makeExample from '../components/example';

class BoresightDemo extends Component {
  static title = 'DZ - Flight Path 1 vs Flight Path 2';
  static parameters = {
    x: {displayName: 'X Rotation', value: 0, step: 0.001, type: 'range', min: -0.2, max: 0.2},
    y: {displayName: 'Y Rotation', value: 0, step: 0.001, type: 'range', min: -0.2, max: 0.2},
    z: {displayName: 'Z Rotation', value: 0, step: 0.01, type: 'range', min: -50, max: 50}
  };
  
  static mapStyle = 'mapbox://styles/mapbox/light-v9';

  static renderInfo(meta) {
    return (
      <div>
        <p>Point cloud to DZ.</p>
        <div>
          <img src={withPrefix('/images/dz_boresight.png')} alt="color scale" style={{height: 8, width: '100%'}} />
        </div>
        <p>Change Flight Path 1 Rotation</p>
      </div>
    );
  }

  render() {
    const {params, data} = this.props;
    const x = params.x.value;
    const y = params.y.value;
    const z = params.z.value;
    return (
      <App
        {...this.props}
        // data={['https://assets.cesium.com/43978/tileset.json', 'https://assets.cesium.com/43978/tileset.json']}
        data={["https://roames-hpc-home.s3-ap-southeast-2.amazonaws.com/users/peteroloughlin/tile3dtest4/tileset.json", "https://roames-hpc-home.s3-ap-southeast-2.amazonaws.com/users/peteroloughlin/tile3dtest3/tileset.json"]}
        x={x}
        y={y}
        z={z}
        loader={Tiles3DLoader}
        loadOptions={{}}
        // loader={CesiumIonLoader}
        // loadOptions={{'cesium-ion': {accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWMxMzcyYy0zZjJkLTQwODctODNlNi01MDRkZmMzMjIxOWIiLCJpZCI6OTYyMCwic2NvcGVzIjpbImFzbCIsImFzciIsImdjIl0sImlhdCI6MTU2Mjg2NjI3M30.1FNiClUyk00YH_nWfSGpiQAjR5V2OvREDq1PJ5QMjWQ'}}}
      />
    );
  }
}

export default makeExample(BoresightDemo);
