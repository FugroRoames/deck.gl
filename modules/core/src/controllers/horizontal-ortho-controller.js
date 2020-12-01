import {clamp, Vector2, Vector3} from 'math.gl';
import Controller from './controller';
import ViewState from './view-state';
import {normalizeViewportProps} from '@math.gl/web-mercator';
import assert from '../utils/assert';
import LinearInterpolator from '../transitions/linear-interpolator';
import {TRANSITION_EVENTS} from './transition-manager';

const LINEAR_TRANSITION_PROPS = {
  transitionDuration: 300,
  transitionEasing: t => t,
  transitionInterpolator: new LinearInterpolator(),
  transitionInterruption: TRANSITION_EVENTS.BREAK
};

// MAPBOX LIMITS
export const MAPBOX_LIMITS = {
  minZoom: 0,
  maxZoom: 20,
  minPitch: 0,
  maxPitch: 60
};

const DEFAULT_STATE = {
  pitch: 0,
  bearing: 0,
  altitude: 1.5,
  target: [0, 0, 0]
};

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

/* Utils */

function wrap180(degrees) {
  if (degrees >= -180 && degrees <= 180) return degrees; // avoid rounding due to arithmetic ops if within range
  // longitude wrapping requires a sawtooth wave function; a general sawtooth wave is
  //     f(x) = (2ax/p - p/2) % p - a
  // where a = amplitude, p = period, % = modulo; however, JavaScript '%' is a remainder operator
  // not a modulo operator - for modulo, replace 'x%n' with '((x%n)+n)%n'
  const x = degrees;
  const a = 180;
  const p = 360;
  return (((((2 * a * x) / p - p / 2) % p) + p) % p) - a;
}

function wrap90(degrees) {
  if (degrees >= -90 && degrees <= 90) return degrees; // avoid rounding due to arithmetic ops if within range

  // latitude wrapping requires a triangle wave function; a general triangle wave is
  //     f(x) = 4a/p ⋅ | (x-p/4)%p - p/2 | - a
  // where a = amplitude, p = period, % = modulo; however, JavaScript '%' is a remainder operator
  // not a modulo operator - for modulo, replace 'x%n' with '((x%n)+n)%n'
  const x = degrees;
  const a = 90;
  const p = 360;
  return ((4 * a) / p) * Math.abs(((((x - p / 4) % p) + p) % p) - p / 2) - a;
}

export class HorizontalOrthoState extends ViewState {
  constructor({
    makeViewport,

    /** Mapbox viewport properties */
    /** The width of the viewport */
    width,
    /** The height of the viewport */
    height,
    /** The latitude at the center of the viewport */
    latitude,
    /** The longitude at the center of the viewport */
    longitude,
    /** The tile zoom level of the map. */
    zoom,
    /** The bearing of the viewport in degrees */
    bearing = DEFAULT_STATE.bearing,
    /** The pitch of the viewport in degrees */
    pitch = DEFAULT_STATE.pitch,
    /**
     * Specify the altitude of the viewport camera
     * Unit: map heights, default 1.5
     * Non-public API, see https://github.com/mapbox/mapbox-gl-js/issues/1137
     */
    altitude = DEFAULT_STATE.altitude,
    target = DEFAULT_STATE.target,

    /** Viewport constraints */
    maxZoom = MAPBOX_LIMITS.maxZoom,
    minZoom = MAPBOX_LIMITS.minZoom,
    maxPitch = MAPBOX_LIMITS.maxPitch,
    minPitch = MAPBOX_LIMITS.minPitch,

    /** Interaction states, required to calculate change during transform */
    /* The point on map being grabbed when the operation first started */
    startPanLngLat,
    /* Center of the zoom when the operation first started */
    startZoomLngLat,
    /** Bearing when current perspective rotate operation started */
    startBearing,
    /** Pitch when current perspective rotate operation started */
    startPitch,
    /** Zoom when current zoom operation started */
    startZoom,
    startTarget,
    startPanPosition
  } = {}) {
    assert(Number.isFinite(longitude), '`longitude` must be supplied');
    assert(Number.isFinite(latitude), '`latitude` must be supplied');
    assert(Number.isFinite(zoom), '`zoom` must be supplied');

    super({
      width,
      height,
      latitude,
      longitude,
      zoom,
      target,
      bearing,
      pitch,
      altitude,
      maxZoom,
      minZoom,
      maxPitch,
      minPitch
    });

    this._interactiveState = {
      startPanLngLat,
      startPanPosition,
      startZoomLngLat,
      startBearing,
      startPitch,
      startZoom,
      startTarget
    };

    this.makeViewport = makeViewport;
  }

  /* Public API */

  getViewportProps() {
    return this._viewportProps;
  }

  getInteractiveState() {
    return this._interactiveState;
  }

  /**
   * Start panning
   * @param {[Number, Number]} pos - position on screen where the pointer grabs
   */
  panStart({pos}) {
    const {target, bearing} = this._viewportProps;
    return this._getUpdatedState({
      startPanLngLat: [this._viewportProps.longitude, this._viewportProps.latitude], // this._unproject(pos),
      startPanPosition: pos,
      startTarget: target,
      startBearing: bearing
    });
  }

  /**
   * Pan
   * @param {[Number, Number]} pos - position on screen where the pointer is
   * @param {[Number, Number], optional} startPos - where the pointer grabbed at
   *   the start of the operation. Must be supplied of `panStart()` was not called
   */
  pan({pos, startPos}) {
    const startPanLngLat = this._interactiveState.startPanLngLat || this._unproject(startPos);
    const {startTarget, startPanPosition, startBearing} = this._interactiveState;

    if (!startPanLngLat) {
      return this;
    }

    // Pixel delta from start point of pan and current position
    const delta = new Vector2(pos).subtract(startPanPosition);

    const viewport = this.makeViewport(this._viewportProps);

    // Calculate the destination lon lat from the pixel offset
    const horizontal_delta = delta[0] * viewport.metersPerPixel;
    const dest_point = this._destinationPoint(startPanLngLat, startBearing, horizontal_delta);

    // Calculate height diff based off pixel offset
    const z_delta = delta[1] * viewport.metersPerPixel;
    const target = new Vector3(startTarget).add([0, 0, z_delta]);

    return this._getUpdatedState({
      longitude: dest_point[0],
      latitude: dest_point[1],
      target
    });
  }

  /**
   * End panning
   * Must call if `panStart()` was called
   */
  panEnd() {
    return this._getUpdatedState({
      startPanLngLat: null,
      startPanPosition: null,
      startTarget: null,
      startBearing: null
    });
  }

  /**
   * Start rotating
   * @param {[Number, Number]} pos - position on screen where the center is
   */
  rotateStart({pos}) {
    return this._getUpdatedState({
      startBearing: this._viewportProps.bearing,
      startPitch: this._viewportProps.pitch
    });
  }

  /**
   * Rotate
   * @param {Number} deltaScaleX - a number between [-1, 1] specifying the
   *   change to bearing.
   * @param {Number} deltaScaleY - a number between [-1, 1] specifying the
   *   change to pitch. -1 sets to minPitch and 1 sets to maxPitch.
   */
  rotate({deltaScaleX = 0, deltaScaleY = 0}) {
    const {startBearing, startPitch} = this._interactiveState;

    if (!Number.isFinite(startBearing) || !Number.isFinite(startPitch)) {
      return this;
    }

    const {pitch, bearing} = this._calculateNewPitchAndBearing({
      deltaScaleX,
      deltaScaleY,
      startBearing,
      startPitch
    });

    return this._getUpdatedState({
      bearing,
      pitch
    });
  }

  /**
   * End rotating
   * Must call if `rotateStart()` was called
   */
  rotateEnd() {
    return this._getUpdatedState({
      startBearing: null,
      startPitch: null
    });
  }

  /**
   * Start zooming
   * @param {[Number, Number]} pos - position on screen where the center is
   */
  zoomStart({pos}) {
    return this._getUpdatedState({
      startZoom: this._viewportProps.zoom
    });
  }

  /**
   * Zoom
   * @param {Number} scale - a number between [0, 1] specifying the accumulated
   *   relative scale.
   */
  zoom({scale}) {
    // Make sure we zoom around the current mouse position rather than map center
    let {startZoom} = this._interactiveState;

    if (!Number.isFinite(startZoom)) {
      // We have two modes of zoom:
      // scroll zoom that are discrete events (transform from the current zoom level),
      // and pinch zoom that are continuous events (transform from the zoom level when
      // pinch started).
      // If startZoom state is defined, then use the startZoom state;
      // otherwise assume discrete zooming
      startZoom = this._viewportProps.zoom;
    }

    const zoom = this._calculateNewZoom({scale, startZoom});

    return this._getUpdatedState({
      zoom
    });
  }

  /**
   * End zooming
   * Must call if `zoomStart()` was called
   */
  zoomEnd() {
    return this._getUpdatedState({
      startZoomLngLat: null,
      startZoom: null,
      startTarget: null
    });
  }

  zoomIn() {
    return this._zoomFromCenter(2);
  }

  zoomOut() {
    return this._zoomFromCenter(0.5);
  }

  moveLeft() {
    return this._panFromCenter([100, 0]);
  }

  moveRight() {
    return this._panFromCenter([-100, 0]);
  }

  moveUp() {
    return this._panFromCenter([0, 100]);
  }

  moveDown() {
    return this._panFromCenter([0, -100]);
  }

  rotateLeft() {
    return this._getUpdatedState({
      bearing: this._viewportProps.bearing - 15
    });
  }

  rotateRight() {
    return this._getUpdatedState({
      bearing: this._viewportProps.bearing + 15
    });
  }

  rotateUp() {
    return this._getUpdatedState({
      pitch: this._viewportProps.pitch + 10
    });
  }

  rotateDown() {
    return this._getUpdatedState({
      pitch: this._viewportProps.pitch - 10
    });
  }

  shortestPathFrom(viewState) {
    const fromProps = viewState.getViewportProps();
    const props = Object.assign({}, this._viewportProps);
    const {bearing, longitude} = props;

    if (Math.abs(bearing - fromProps.bearing) > 180) {
      props.bearing = bearing < 0 ? bearing + 360 : bearing - 360;
    }
    if (Math.abs(longitude - fromProps.longitude) > 180) {
      props.longitude = longitude < 0 ? longitude + 360 : longitude - 360;
    }
    return props;
  }

  /* Private methods */

  _zoomFromCenter(scale) {
    const {width, height} = this._viewportProps;
    return this.zoom({
      pos: [width / 2, height / 2],
      scale
    });
  }

  _panFromCenter(offset) {
    const {width, height} = this._viewportProps;
    return this.pan({
      startPos: [width / 2, height / 2],
      pos: [width / 2 + offset[0], height / 2 + offset[1]]
    });
  }

  _getUpdatedState(newProps) {
    // Update _viewportProps
    return new this.constructor({
      makeViewport: this.makeViewport,
      ...this._viewportProps,
      ...this._interactiveState,
      ...newProps
    });
  }

  // Apply any constraints (mathematical or defined by _viewportProps) to map state
  _applyConstraints(props) {
    // Ensure zoom is within specified range
    const {maxZoom, minZoom, zoom} = props;
    props.zoom = clamp(zoom, minZoom, maxZoom);

    // Ensure pitch is within specified range
    const {maxPitch, minPitch, pitch} = props;
    props.pitch = clamp(pitch, minPitch, maxPitch);

    Object.assign(props, normalizeViewportProps(props));

    return props;
  }

  _unproject(pos) {
    const viewport = this.makeViewport(this._viewportProps);
    return pos && viewport.unproject(pos);
  }

  _project(lnglat) {
    const viewport = this.makeViewport(this._viewportProps);
    return lnglat && viewport.project(lnglat);
  }

  // Calculate a new lnglat based on pixel dragging position
  _calculateNewLngLat({startPanLngLat, pos}) {
    const viewport = this.makeViewport(this._viewportProps);
    return viewport.getMapCenterByLngLatPosition({lngLat: startPanLngLat, pos});
  }

  // Calculates new zoom
  _calculateNewZoom({scale, startZoom}) {
    const {maxZoom, minZoom} = this._viewportProps;
    const zoom = startZoom + Math.log2(scale);
    return clamp(zoom, minZoom, maxZoom);
  }

  // Calculates a new pitch and bearing from a position (coming from an event)
  _calculateNewPitchAndBearing({deltaScaleX, deltaScaleY, startBearing, startPitch}) {
    // clamp deltaScaleY to [-1, 1] so that rotation is constrained between minPitch and maxPitch.
    // deltaScaleX does not need to be clamped as bearing does not have constraints.
    deltaScaleY = clamp(deltaScaleY, -1, 1);

    const {minPitch, maxPitch} = this._viewportProps;

    const bearing = startBearing + 180 * deltaScaleX;
    let pitch = startPitch;
    if (deltaScaleY > 0) {
      // Gradually increase pitch
      pitch = startPitch + deltaScaleY * (maxPitch - startPitch);
    } else if (deltaScaleY < 0) {
      // Gradually decrease pitch
      pitch = startPitch - deltaScaleY * (minPitch - startPitch);
    }

    return {
      pitch,
      bearing
    };
  }

  // https://www.movable-type.co.uk/scripts/latlong-vectors.html
  // Calculate Destination from initial point, bearing and distance
  /* eslint-disable max-statements */
  _destinationPoint(startPanLngLat, startBearing, distance) {
    const lat_r = startPanLngLat[1] * DEGREES_TO_RADIANS;
    const lon_r = startPanLngLat[0] * DEGREES_TO_RADIANS;
    const lat_sin = Math.sin(lat_r);
    const lat_cos = Math.cos(lat_r);
    const lon_sin = Math.sin(lon_r);
    const lon_cos = Math.cos(lon_r);

    const a = new Vector3([lat_cos * lon_cos, lat_cos * lon_sin, lat_sin]).normalize();

    const ang_dist = distance / 6371e3;

    let pos_bearing = startBearing - 90;
    if (startBearing < 0) {
      pos_bearing = 360 + startBearing - 90;
    }
    const bearing = pos_bearing * DEGREES_TO_RADIANS;

    const N = new Vector3(0, 0, 1).normalize();
    const de = new Vector3()
      .copy(N)
      .cross(a)
      .normalize();
    const dn = new Vector3().copy(a).cross(de);

    const de_sin = new Vector3().copy(de).scale(Math.sin(bearing));
    const dn_cos = new Vector3().copy(dn).scale(Math.cos(bearing));

    const d = new Vector3().copy(dn_cos).add(de_sin);

    const x = new Vector3().copy(a).scale(Math.cos(ang_dist));
    const y = new Vector3().copy(d).scale(Math.sin(ang_dist));
    const b = new Vector3()
      .copy(x)
      .add(y)
      .normalize();

    const lat = Math.atan2(b[2], Math.sqrt(b[0] * b[0] + b[1] * b[1]));
    const lon = Math.atan2(b[1], b[0]);
    const latitude = wrap90(lat * RADIANS_TO_DEGREES);
    const longitude = wrap180(lon * RADIANS_TO_DEGREES);
    return [longitude, latitude];
  }
  /* eslint-enable max-statements */
}

export default class HorizontalOrthoController extends Controller {
  constructor(props) {
    super(HorizontalOrthoState, props);
    this.invertPan = true;
  }

  _getTransitionProps() {
    // Enables Transitions on double-tap and key-down events.
    return LINEAR_TRANSITION_PROPS;
  }
}
