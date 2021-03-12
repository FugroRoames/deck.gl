import GL from '@luma.gl/constants';

import {Ellipsoid} from '@math.gl/geospatial';
import {addMetersToLngLat} from '@math.gl/web-mercator';

/* eslint-disable complexity, max-statements */
export function getPropChange(props, oldProps) {
  let rotationChanged = false;
  if (
    props.xRotation !== oldProps.xRotation ||
    props.yRotation !== oldProps.yRotation ||
    props.zRotation !== oldProps.zRotation
  ) {
    rotationChanged = true;
  }

  let translationChanged = false;
  if (
    props.xTranslation !== oldProps.xTranslation ||
    props.yTranslation !== oldProps.yTranslation ||
    props.zTranslation !== oldProps.zTranslation
  ) {
    translationChanged = true;
  }

  let pointColorChanged = false;
  if (props.pointColor !== oldProps.pointColor) {
    pointColorChanged = true;
  }

  let colorTextureChanged = false;
  if (props.colorTexture !== oldProps.colorTexture) {
    colorTextureChanged = true;
  }

  let colorDomainChanged = false;
  if (props.colorDomain !== oldProps.colorDomain) {
    colorDomainChanged = true;
  }

  let displayTextureChanged = false;
  if (props.displayTexture !== oldProps.displayTexture) {
    displayTextureChanged = true;
  }

  let boundsChanged = false;
  if (props.bounds !== oldProps.bounds) {
    boundsChanged = true;
  }
  return {
    rotationChanged,
    translationChanged,
    pointColorChanged,
    colorTextureChanged,
    colorDomainChanged,
    displayTextureChanged,
    boundsChanged
  };
}
/* eslint-enable complexity, max-statements */

export function getHeightRange(tileHeader) {
  const boundingVolumeCenter = tileHeader.cartesianCenter;
  const cartCenter = [0, 0, 0];
  cartCenter[0] = boundingVolumeCenter[0] + tileHeader.tileset.root.boundingVolume.box[3];
  cartCenter[1] = boundingVolumeCenter[1] + tileHeader.tileset.root.boundingVolume.box[4];
  cartCenter[2] = boundingVolumeCenter[2] + tileHeader.tileset.root.boundingVolume.box[5];

  cartCenter[0] += tileHeader.tileset.root.boundingVolume.box[6];
  cartCenter[1] += tileHeader.tileset.root.boundingVolume.box[7];
  cartCenter[2] += tileHeader.tileset.root.boundingVolume.box[8];

  cartCenter[0] += tileHeader.tileset.root.boundingVolume.box[9];
  cartCenter[1] += tileHeader.tileset.root.boundingVolume.box[10];
  cartCenter[2] += tileHeader.tileset.root.boundingVolume.box[11];
  const result = [];
  const longlatheight = Ellipsoid.WGS84.cartesianToCartographic(cartCenter, result);

  return [tileHeader.cartographicCenter[2], longlatheight[2]];
}

export function parseBatchArray(tile, batchTable) {
  if (!tile.attributes.gpsPositions) {
    if (batchTable.hasProperty('GPS_POSITION')) {
      tile.attributes.gpsPositions = batchTable.getPropertyArray('GPS_POSITION', GL.FLOAT, 3);
    }
  }
  if (!tile.attributes.gpsDirections) {
    if (batchTable.hasProperty('GPS_DIRECTION')) {
      tile.attributes.gpsDirections = batchTable.getPropertyArray('GPS_DIRECTION', GL.FLOAT, 4);
    }
  }
}

export function createBoundingBox(boundingVolumeCenter, boundVolume) {
  const result = [];
  const longlat = Ellipsoid.WGS84.cartesianToCartographic(boundingVolumeCenter, result);
  const verticies = [];

  const center = longlat; // addMetersToLngLat(longlat, [boundVolume[0], boundVolume[1], boundVolume[2]]);

  const x_shift = boundVolume[3];
  const y_shift = boundVolume[7];
  const z_shift = boundVolume[11];

  verticies.push(addMetersToLngLat(center, [x_shift, y_shift, z_shift]).slice(0, 2));
  verticies.push(addMetersToLngLat(center, [x_shift, -1 * y_shift, z_shift]).slice(0, 2));
  verticies.push(addMetersToLngLat(center, [-1 * x_shift, -1 * y_shift, z_shift]).slice(0, 2));
  verticies.push(addMetersToLngLat(center, [-1 * x_shift, y_shift, z_shift]).slice(0, 2));

  return verticies;
}

export function toQuaternion(xRotation, yRotation, zRotation) {
  const xRotationRad = xRotation * (Math.PI / 180);
  const yRotationRad = yRotation * (Math.PI / 180);
  const zRotationRad = zRotation * (Math.PI / 180);

  const cr = Math.cos(xRotationRad * 0.5);
  const sr = Math.sin(xRotationRad * 0.5);
  const cp = Math.cos(yRotationRad * 0.5);
  const sp = Math.sin(yRotationRad * 0.5);
  const cy = Math.cos(zRotationRad * 0.5);
  const sy = Math.sin(zRotationRad * 0.5);
  return [
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy
  ];
}
