import Controller from './controller';
import {MapState} from './map-controller';
import LinearInterpolator from '../transitions/linear-interpolator';
import {TRANSITION_EVENTS} from './transition-manager';
import assert from '../utils/assert';

const LINEAR_TRANSITION_PROPS = {
  transitionDuration: 300,
  transitionEasing: t => t,
  transitionInterpolator: new LinearInterpolator(['target', 'zoom']),
  transitionInterruption: TRANSITION_EVENTS.BREAK
};

const NO_TRANSITION_PROPS = {
  transitionDuration: 0
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
  altitude: 1.5
};

export class MapBoundState extends MapState {
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
    /** experiment */
    drawBoundingBox = false,
    boundBoxState = {}
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
      bearing,
      pitch,
      altitude,
      maxZoom,
      minZoom,
      maxPitch,
      minPitch,
      startPanLngLat,
      startZoomLngLat,
      startBearing,
      startPitch,
      startZoom
    });

    this.makeViewport = makeViewport;
    this.drawBoundingBox = drawBoundingBox;
    this.boundBoxState = boundBoxState;
  }

  storeBoundPoint({point}) {
    this.boundingBox.push(point);
  }

  getViewport() {
    return this.makeViewport(this._viewportProps);
  }

  zoomToBound(bound) {
    const vp = this.getViewport();
    const new_vp = vp.fitBounds(bound);

    return this._getUpdatedState({
      zoom: new_vp.zoom,
      longitude: new_vp.longitude,
      latitude: new_vp.latitude
      // pitch: 70
    });
  }
}

export default class MapBoundController extends Controller {
  constructor(props) {
    super(MapBoundState, props);
    this.invertPan = true;
    this.doubleClickZoom = false;
    this.events = ['mousedown', 'doubletap', 'leftButton'];
  }

  _getTransitionProps() {
    // Enables Transitions on double-tap and key-down events.
    return LINEAR_TRANSITION_PROPS;
  }

  handleEvent(event) {
    const {ControllerState} = this;
    this.controllerState = new ControllerState({
      makeViewport: this.makeViewport,
      ...this.controllerStateProps,
      ...this._state
    });

    switch (event.type) {
      case 'panstart':
        return this._onPanStart(event);
      case 'panmove':
        return this._onPan(event);
      case 'panend':
        return this._onPanEnd(event);
      case 'pinchstart':
        return this._onPinchStart(event);
      case 'pinchmove':
        return this._onPinch(event);
      case 'pinchend':
        return this._onPinchEnd(event);
      case 'doubletap':
        return this._onDoubleTap(event);
      case 'wheel':
        return this._onWheel(event);
      case 'keydown':
        return this._onKeyDown(event);
      case 'mousedown':
        return this._onMouseDown(event);
      default:
        return false;
    }
  }

  setProps(props) {
    super.setProps(props);
    this.drawBoundingBox = props.drawBoundingBox;
    this.boundBoxState = props.boundBoxState;
  }

  _onMouseDown(event) {
    if (!this.drawBoundingBox) {
      return false;
    }

    if (this.boundBoxState.interWidth) {
      const boundPoints = this._getBounds(
        this.boundBoxState.start,
        this.boundBoxState.end,
        this.boundBoxState.interWidth
      );
      const en = [-10000, -10000];
      const ws = [10000, 10000];
      for (const point of boundPoints) {
        if (point[0] > en[0]) {
          en[0] = point[0];
        }
        if (point[1] > en[1]) {
          en[1] = point[1];
        }

        if (point[0] < ws[0]) {
          ws[0] = point[0];
        }

        if (point[1] < ws[1]) {
          ws[1] = point[1];
        }
      }

      const newControllerState = this.controllerState.zoomToBound([ws, en]);

      return this.updateViewport(newControllerState, NO_TRANSITION_PROPS, {
        bounds: this.boundBoxState
      });
    }
    return false;
  }

  _getBounds(startP, endP, widthP, defaultWidth = 0.0001) {
    let widthSet = true;
    if (widthP[0] === 0 && widthP[1] === 0 && widthP[2] === 0) {
      widthSet = false;
    }

    const start = this._unproject(startP);
    const to = this._unproject(endP);
    const wPoint = this._unproject(widthP);

    let width = defaultWidth;
    if (widthSet) {
      width = this._pointToLine(start, to, wPoint);
    }

    const line_vec = [start[0] - to[0], start[1] - to[1]];
    const ext1 = this._getExtrusionOffset(line_vec, -1, width);
    const ext2 = this._getExtrusionOffset(line_vec, 1, width);

    const bounds_mercator = [
      [start[0] + ext1[0], start[1] + ext1[1]],
      [to[0] + ext1[0], to[1] + ext1[1]],
      [to[0] + ext2[0], to[1] + ext2[1]],
      [start[0] + ext2[0], start[1] + ext2[1]]
    ];

    // get viewport and project back to longlat
    const bounds = [
      this._project(bounds_mercator[0]),
      this._project(bounds_mercator[1]),
      this._project(bounds_mercator[2]),
      this._project(bounds_mercator[3])
    ];

    return bounds;
  }

  _onPanRotate(event) {
    if (!this.dragRotate) {
      return false;
    }
    const {deltaX} = event;
    const {width} = this.controllerState.getViewportProps();

    const deltaScaleX = deltaX / width;

    const newControllerState = this.controllerState.rotate({deltaScaleX, deltaScaleY: 0});
    return this.updateViewport(newControllerState, NO_TRANSITION_PROPS, {
      isDragging: true,
      isRotating: true
    });
  }

  _unproject(pos) {
    const viewport = this.makeViewport(this._viewportProps);
    return pos && viewport.unproject(pos);
  }

  _project(pos) {
    const viewport = this.makeViewport(this._viewportProps);
    return pos && viewport.project(pos);
  }

  // Get the offset point from linevec with the width in the offeset direction
  _getExtrusionOffset(line_vec, offset_direction, width) {
    const perp_vec = [-1.0 * line_vec[1], line_vec[0]];
    const norm = Math.sqrt(Math.pow(perp_vec[0], 2) + Math.pow(perp_vec[1], 2));
    const unit_perp_vec = [perp_vec[0] / norm, perp_vec[1] / norm];

    const offset_transform = offset_direction * width;
    return [unit_perp_vec[0] * offset_transform, unit_perp_vec[1] * offset_transform];
  }

  // Shortest distance from p3 to the vector p1->p2
  _pointToLine(p1, p2, p3) {
    return (
      Math.abs(p3[0] * (p2[1] - p1[1]) - p3[1] * (p2[0] - p1[0]) + p2[0] * p1[1] - p2[1] * p1[0]) /
      Math.sqrt(Math.pow(p2[1] - p1[1], 2) + Math.pow(p2[0] - p1[0], 2))
    );
  }
}
