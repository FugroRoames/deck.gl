import React, {useState} from 'react';
import {render} from 'react-dom';
import {StaticMap} from 'react-map-gl';
import DeckGL from '@deck.gl/react';

import {BoresightLayer} from '@deck.gl/geo-layers';
import {Tiles3DLoader} from '@loaders.gl/3d-tiles';

const FLIGHT_ONE_URL = `https://roames-hpc-home.s3-ap-southeast-2.amazonaws.com/users/peteroloughlin/tile3dtest4/tileset.json`;
const FLIGHT_TWO_URL = `https://roames-hpc-home.s3-ap-southeast-2.amazonaws.com/users/peteroloughlin/tile3dtest3/tileset.json`;

const INITIAL_VIEW_STATE = {
  longitude: 144.94345786971536,
  latitude: -37.812765742471754,
  zoom: 11,
  bearing: 0,
  pitch: 30
};

export default function App({
  mapStyle = 'mapbox://styles/mapbox/light-v9',
  x = null,
  y = null,
  z = null,
  data = [FLIGHT_ONE_URL, FLIGHT_TWO_URL],
  loader = Tiles3DLoader,
  loadOptions = {},
  colorRange = [
    [240, 8, 244],
    [253, 151, 6],
    [253, 253, 19],
    [251, 51, 51],
    [0, 252, 253],
    [99, 253, 97],
    [9, 153, 3],
    [0, 0, 200]
  ]
}) {
  const [initialViewState, setInitialViewState] = useState(INITIAL_VIEW_STATE);

  const onTilesetLoad = tileset => {
    // Recenter view to cover the new tileset
    const {cartographicCenter, zoom} = tileset;
    setInitialViewState({
      ...INITIAL_VIEW_STATE,
      longitude: cartographicCenter[0],
      latitude: cartographicCenter[1],
      zoom
    });
  };

  const layers = [
    new BoresightLayer({
      id: 'melb-boresight-layer',
      data,
      loader,
      loadOptions,
      colorRange,
      boundingBox: false,
      xRotation: x,
      yRotation: y,
      zRotation: z,
      onTilesetLoad
    })
  ];

  return (
    <DeckGL layers={layers} initialViewState={initialViewState} controller={true}>
      <StaticMap
        reuseMaps
        mapStyle={mapStyle}
        mapboxApiAccessToken={
          'pk.eyJ1IjoidWJlcmRhdGEiLCJhIjoiY2pwY3owbGFxMDVwNTNxcXdwMms2OWtzbiJ9.1PPVl0VLUQgqrosrI2nUhg'
        }
        preventStyleDiffing={true}
      />
    </DeckGL>
  );
}

export function renderToDOM(container) {
  render(<App />, container);
}
