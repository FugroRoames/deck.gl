import React, {useState} from 'react';
import {render} from 'react-dom';
import {StaticMap} from 'react-map-gl';
import DeckGL from '@deck.gl/react';

import {View, MapView, HorizontalOrthoController, MapBoundController} from '@deck.gl/core';
import {BoresightLayer} from '@deck.gl/geo-layers';
import {registerLoaders} from '@loaders.gl/core';
import {Tiles3DLoader} from '@loaders.gl/3d-tiles';

// const FLIGHT_ONE_URL = `https://d3hwnz5sahda3g.cloudfront.net/flightline2/tileset.json`;
// const FLIGHT_TWO_URL = `https://d3hwnz5sahda3g.cloudfront.net/flightline1/tileset.json`;
const FLIGHT_ONE_URL =
  'https://d2p2h9bgfn7gmq.cloudfront.net/20072099-20201020150357/final/0010000_1/tileset.json';
const FLIGHT_TWO_URL =
  'https://d2p2h9bgfn7gmq.cloudfront.net/20072099-20201020150357/final/0020000_1/tileset.json';
// const FLIGHT_THREE_URL =
// 'https://d2p2h9bgfn7gmq.cloudfront.net/20072099-20201020150357/final/0030000_1/tileset.json';
// const FLIGHT_FOUR_URL =
// 'https://d2p2h9bgfn7gmq.cloudfront.net/20072099-20201020150357/final/0040000_1/tileset.json';

const INITIAL_VIEW_STATE = {
  longitude: 144.94345786971536,
  latitude: -37.812765742471754,
  zoom: 11,
  bearing: 0,
  pitch: 0,
  maxPitch: 90,
  maxZoom: 21
};

const BOUND_BOX = {
  start: null,
  end: null,
  widthPoint: null,
  interEnd: null,
  interWidth: null
};

export default function App({
  mapStyle = 'mapbox://styles/mapbox/light-v9',
  x = null,
  y = null,
  z = null,
  xT = null,
  yT = null,
  zT = null,
  boundingBox = false,
  points = false,
  gpsPoints = false,
  data = {
    [FLIGHT_ONE_URL]: {
      rotation: {
        xRotation: x,
        yRotation: y,
        zRotation: z
      },
      translation: {
        xTranslation: xT,
        yTranslation: yT,
        zTranslation: zT
      }
    },
    [FLIGHT_TWO_URL]: {
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
  },
  loader = Tiles3DLoader,
  loadOptions = {},
  colorRange = [
    [128, 0, 128],
    [240, 8, 244],
    [253, 151, 6],
    [253, 253, 19],
    [251, 51, 51],
    [0, 252, 253],
    [99, 253, 97],
    [9, 153, 3],
    [0, 0, 200]
  ],
  colorDomain = [-1, 1],
  drawBoundingBox
}) {
  registerLoaders(loader);
  const [initialViewState, setInitialViewState] = useState(INITIAL_VIEW_STATE);
  const [boundBoxState, setBoundBoxState] = useState(BOUND_BOX);

  const onTilesetLoad = (tileset) => {
    // Recenter view to cover the new tileset
    const {cartographicCenter, zoom} = tileset;
    setInitialViewState({
      ...INITIAL_VIEW_STATE,
      longitude: cartographicCenter[0],
      latitude: cartographicCenter[1],
      zoom,
      target: [0, 0, cartographicCenter[2]]
    });
  };

  const layers = [
    new BoresightLayer({
      id: 'melb-boresight-layer',
      data,
      loader,
      loadOptions,
      colorRange,
      boundingBox,
      points,
      gpsPoints,
      colorDomain,
      getBoundBox: boundBoxState,
      updateTriggers: {
        getBoundBox: boundBoxState
      },
      onTilesetLoad
    })
  ];
  const views = [
    new MapView({
      id: 'main',
      height: '50%',
      controller: MapBoundController,
      drawBoundingBox,
      orthographic: true,
      boundBoxState
    }),
    new MapView({
      id: 'minimap',
      x: 0,
      y: '50%',
      height: '50%',
      width: '100%',
      controller: HorizontalOrthoController,
      orthographic: true
    })
  ];

  const onClick = (info) => {
    if (!drawBoundingBox || boundBoxState.widthPoint) {
      setBoundBoxState({BOUND_BOX});
      return;
    }

    if (boundBoxState.end) {
      setBoundBoxState({
        ...boundBoxState,
        widthPoint: info.lngLat,
        interEnd: null,
        interWidth: null
      });
      return;
    }

    if (boundBoxState.start) {
      setBoundBoxState({
        ...boundBoxState,
        end: info.lngLat
      });
      return;
    }
    setBoundBoxState({
      ...boundBoxState,
      start: info.lngLat
    });
  };

  const onHover = (info, event) => {
    if (!drawBoundingBox || boundBoxState.widthPoint) {
      return;
    }

    if (boundBoxState.end) {
      setBoundBoxState({
        ...boundBoxState,
        interWidth: info.lngLat
      });
      return;
    }

    if (boundBoxState.start) {
      setBoundBoxState({
        ...boundBoxState,
        interEnd: info.lngLat
      });
      return;
    }
  };

  const onViewStateChange = (event) => {
    const viewState = event.viewState;
    const viewId = event.viewId;

    if (event.interactionState.bounds) {
      setBoundBoxState({
        ...boundBoxState,
        widthPoint: event.interactionState.bounds.interWidth
      });
    }

    if (viewId === 'main') {
      setInitialViewState((currentViewStates) => ({
        main: {
          ...viewState,
          target: null
        },
        minimap: {
          ...currentViewStates.minimap,
          longitude: viewState.longitude,
          latitude: viewState.latitude,
          zoom: viewState.zoom,
          bearing: viewState.bearing,
          maxPitch: 90,
          pitch: 90
        }
      }));
    } else {
      setInitialViewState((currentViewStates) => ({
        main: {
          ...currentViewStates.main,
          longitude: viewState.longitude,
          latitude: viewState.latitude,
          target: null,
          zoom: viewState.zoom,
          bearing: viewState.bearing
        },
        minimap: {
          ...viewState,
          longitude: viewState.longitude,
          latitude: viewState.latitude,
          target: viewState.target,
          maxPitch: 90,
          pitch: 90
        }
      }));
    }
  };

  const layerFilter = ({layer, viewport}) => {
    if (viewport.id === 'minimap') {
      if (layer.id.includes('pointcloud')) {
        return true;
      }

      return false;
    }
    return true;
  };

  return (
    <DeckGL
      layers={layers}
      // initialViewState={initialViewState}
      viewState={initialViewState}
      views={views}
      // redraw={true}
      onClick={onClick}
      onHover={onHover}
      layerFilter={layerFilter}
      onViewStateChange={onViewStateChange}
    >
      <View id="main">
        <StaticMap
          reuseMaps
          mapStyle={mapStyle}
          mapboxApiAccessToken={
            'pk.eyJ1IjoidWJlcmRhdGEiLCJhIjoiY2pwY3owbGFxMDVwNTNxcXdwMms2OWtzbiJ9.1PPVl0VLUQgqrosrI2nUhg'
          }
          preventStyleDiffing={true}
        />
      </View>
    </DeckGL>
  );
}

export function renderToDOM(container) {
  render(<App />, container);
}
