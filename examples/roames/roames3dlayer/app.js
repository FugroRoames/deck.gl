import {Deck} from '@deck.gl/core';
import {Roames3DLayer} from '@deck.gl/geo-layers';
import {CesiumIonLoader} from '@loaders.gl/3d-tiles';

import mapboxgl from 'mapbox-gl';

const ION_ASSET_ID = 43978;
const ION_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWMxMzcyYy0zZjJkLTQwODctODNlNi01MDRkZmMzMjIxOWIiLCJpZCI6OTYyMCwic2NvcGVzIjpbImFzbCIsImFzciIsImdjIl0sImlhdCI6MTU2Mjg2NjI3M30.1FNiClUyk00YH_nWfSGpiQAjR5V2OvREDq1PJ5QMjWQ';
const TILESET_URL = `https://assets.cesium.com/${ION_ASSET_ID}/tileset.json`;

const INITIAL_VIEW_STATE = {
  // // Mortlake centre
  // longitude: 142.80669251998427,
  // latitude:-38.08083945106017,
  // Melbourne Centre
  longitude: 144.94345786971536,
  latitude: -37.812765742471754,
  zoom: 14,
  bearing: 0,
  pitch: 30
};
// Set your mapbox token here
mapboxgl.accessToken =
  'pk.eyJ1IjoidWJlcmRhdGEiLCJhIjoiY2pwY3owbGFxMDVwNTNxcXdwMms2OWtzbiJ9.1PPVl0VLUQgqrosrI2nUhg'; // eslint-disable-line

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v9',
  // Note: deck.gl will be in charge of interaction and event handling
  interactive: false,
  center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
  zoom: INITIAL_VIEW_STATE.zoom,
  bearing: INITIAL_VIEW_STATE.bearing,
  pitch: INITIAL_VIEW_STATE.pitch
});

export const deck = new Deck({
  canvas: 'deck-canvas',
  width: '100%',
  height: '100%',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  onViewStateChange: ({viewState}) => {
    map.jumpTo({
      center: [viewState.longitude, viewState.latitude],
      zoom: viewState.zoom,
      bearing: viewState.bearing,
      pitch: viewState.pitch
    });
  },
  layers: [
    // // Mortlake small singular tile
    // new Tile3DLayer({
    //   id: 'tile-3d-layer',
    //   pointSize: 2,
    //   data: 'https://roames-hpc-home.s3-ap-southeast-2.amazonaws.com/users/peteroloughlin/boresight/tileset.json',
    //   pickable: true,
    // }),
    // new Roames3DLayer({
    //   id: 'roames-3d-layer',
    //   data: 'https://roames-hpc-home.s3-ap-southeast-2.amazonaws.com/users/peteroloughlin/boresight/tileset.json',
    //   colorRange: [[240, 8, 244], [253, 151, 6],
    //                       [253, 253, 19], [251, 51, 51],
    //                       [0, 252, 253], [99, 253, 97],
    //                       [9, 153, 3], [0, 0, 200]],
    //   boundingBox: true
    // })

    // // Melbourne large multiple tiles
    // new Tile3DLayer({
    //   id: 'tile-3d-layer',
    //   pointSize: 2,
    //   data: TILESET_URL,
    //   loader: CesiumIonLoader,
    //   loadOptions: {'cesium-ion': {accessToken: ION_TOKEN}}
    // }),
    new Roames3DLayer({
      id: 'melb-roames-3d-box-layer',
      data: TILESET_URL,
      loader: CesiumIonLoader,
      loadOptions: {'cesium-ion': {accessToken: ION_TOKEN}},
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
      boundingBox: true
    })
  ]
});
