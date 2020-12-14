import React, {Component, useRef, useEffect } from 'react';
import App from 'website-roames/boresight-layer/app';
import {CesiumIonLoader, Tiles3DLoader} from '@loaders.gl/3d-tiles';

import {withPrefix} from 'gatsby';

import makeExample from '../components/example';

class BoresightDemo extends Component {
  static title = 'DZ - Flight Path 1 vs Flight Path 2';
  static parameters = {
    rotX: {displayName: 'Rotation X', value: 0, step: 0.001, type: 'range', min: -2, max: 2},
    rotY: {displayName: 'Rotation Y', value: 0, step: 0.001, type: 'range', min: -2, max: 2},
    rotZ: {displayName: 'Rotation Z', value: 0, step: 0.001, type: 'range', min: -2, max: 2},
    tranX: {
      displayName: 'Translation X',
      value: 0,
      step: 0.01,
      type: 'range',
      min: -10,
      max: 10
    },
    tranY: {
      displayName: 'Translation Y',
      value: 0,
      step: 0.01,
      type: 'range',
      min: -10,
      max: 10
    },
    tranZ: {
      displayName: 'Translation Z',
      value: 0,
      step: 0.01,
      type: 'range',
      min: -10,
      max: 10
    },
    colorMin: {displayName: 'Color Min', value: -1},
    colorMax: {displayName: 'Color Max', value: 1},
    data1: {
      displayName: 'Flight line 1',
      value: 'https://d3hwnz5sahda3g.cloudfront.net/petertestL/tileset.json'
      // value: 'https://d3hwnz5sahda3g.cloudfront.net/flightline1/tileset.json'
      // value:
      // 'https://d2p2h9bgfn7gmq.cloudfront.net/users/daikiichiyama/0010000_1/tileset.json?Policy=eyJTdGF0ZW1lbnQiOiBbeyJSZXNvdXJjZSI6Imh0dHBzOi8vZDJwMmg5YmdmbjdnbXEuY2xvdWRmcm9udC5uZXQvdXNlcnMvZGFpa2lpY2hpeWFtYS8qIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNjY3OTYyOTI4fX19XX0_&Signature=BmAww66GtiL0hPIB-l1o8gES-Ljey2BlFFojqCnkxlKauLZE8GYYZMWQopqgTZayTNgc-3omTd1KD5EitEUxtORVwLNyY3OBkoub~L~fwNn-lF9qIyA8j8pAQKfmLPJ2GuxU~Opaay~rNxzDwk1W4BAOUeU94w-nw4hWp7zE5CALH94fL0K8npwopsyy6UqEB42ox-0vSfG3k6oV3d7Z6RL4RV8ksdEHJ05py8MYLjT5y3wM1WXRbNmABdw9wWEodJlTg0gxQysZCcp76riSsZQ~icsidV3nXhM6-qTPezY4mFO6QG6z01fkQgIxywEhzBa~tDjl6U62L14egN8f4A__&Key-Pair-Id=APKAJNAMH5VW75CUXS4Q'
    },
    data2: {
      displayName: 'Flight line 2',
      value: 'https://d3hwnz5sahda3g.cloudfront.net/petertestM/tileset.json'
      // value: 'https://d3hwnz5sahda3g.cloudfront.net/flightline2/tileset.json'
      // value:
      // 'https://d2p2h9bgfn7gmq.cloudfront.net/users/daikiichiyama/0030000_1/tileset.json?Policy=eyJTdGF0ZW1lbnQiOiBbeyJSZXNvdXJjZSI6Imh0dHBzOi8vZDJwMmg5YmdmbjdnbXEuY2xvdWRmcm9udC5uZXQvdXNlcnMvZGFpa2lpY2hpeWFtYS8qIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNjY3OTYyOTI4fX19XX0_&Signature=BmAww66GtiL0hPIB-l1o8gES-Ljey2BlFFojqCnkxlKauLZE8GYYZMWQopqgTZayTNgc-3omTd1KD5EitEUxtORVwLNyY3OBkoub~L~fwNn-lF9qIyA8j8pAQKfmLPJ2GuxU~Opaay~rNxzDwk1W4BAOUeU94w-nw4hWp7zE5CALH94fL0K8npwopsyy6UqEB42ox-0vSfG3k6oV3d7Z6RL4RV8ksdEHJ05py8MYLjT5y3wM1WXRbNmABdw9wWEodJlTg0gxQysZCcp76riSsZQ~icsidV3nXhM6-qTPezY4mFO6QG6z01fkQgIxywEhzBa~tDjl6U62L14egN8f4A__&Key-Pair-Id=APKAJNAMH5VW75CUXS4Q'
    },
    boundingBox: {displayName: 'Bounding Box', value: false, type: 'checkbox'},
    points: {displayName: 'Points', value: false, type: 'checkbox'},
    gpsPoints: {displayName: 'GPS Points', value: false, type: 'checkbox'},
    drawBoundingBox: {displayName: 'Draw Bounding Box', value: false, type: 'checkbox'}
    // https://roames-hpc-home.s3-ap-southeast-2.amazonaws.com/users/peteroloughlin/gpspos2/tileset.json
  };

  static colorRange = [
    [128, 0, 128],
    [240, 8, 244],
    [253, 151, 6],
    [253, 253, 19],
    [251, 51, 51],
    [0, 252, 253],
    [99, 253, 97],
    [9, 153, 3],
    [0, 0, 200]
  ];

  static mapStyle = 'mapbox://styles/mapbox/light-v9';

  static renderInfo(meta) {
    const props = {
      id: "colorRange",
      style: {
        "zIndex": "10",
        "width":"100%",
        "height": "8px"
      }
    };

    const {colorRange} = BoresightDemo;
    const Canvas = props => {
      const canvasRef = useRef(null)
      useEffect(() => {
        const canvas = canvasRef.current
        const context = canvas.getContext('2d')

        for (let i = 0; i < colorRange.length; ++i) {
          let start = i/(colorRange.length) * context.canvas.width;
          let end = (i+1)/(colorRange.length) * context.canvas.width;
          context.fillStyle = `rgb(${colorRange[i][0]}, ${colorRange[i][1]}, ${colorRange[i][2]})`;
          context.fillRect(start, 0, end, context.canvas.height);
        }
      }, [])


      return <canvas ref={canvasRef} {...props}/>
    }

    return (
      <div>
        <p>Point cloud to DZ.</p>
        <div>
          {new Canvas(props)}
        </div>
        <p>Change Flight Path 1 Rotation</p>
      </div>
    );
  }

  render() {
    const {params} = this.props;
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
    const drawBoundingBox = params.drawBoundingBox.value;

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
        colorRange={BoresightDemo.colorRange}
        loadOptions={{}}
        drawBoundingBox={drawBoundingBox}
        // loader={CesiumIonLoader}
        // loadOptions={{'cesium-ion': {accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWMxMzcyYy0zZjJkLTQwODctODNlNi01MDRkZmMzMjIxOWIiLCJpZCI6OTYyMCwic2NvcGVzIjpbImFzbCIsImFzciIsImdjIl0sImlhdCI6MTU2Mjg2NjI3M30.1FNiClUyk00YH_nWfSGpiQAjR5V2OvREDq1PJ5QMjWQ'}}}
      />
    );
  }
}

export default makeExample(BoresightDemo);
