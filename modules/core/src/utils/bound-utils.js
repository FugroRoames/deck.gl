import {projectPosition} from '../shaderlib/project/project-functions';
import {COORDINATE_SYSTEM} from '../../src/lib/constants';
import {fp64LowPart} from './math-utils';

// Unproject all 4 corners of the current screen coordinates into world coordinates (lng/lat)
// Takes care of viewport has non zero bearing/pitch (i.e axis not aligned with world coordiante system)
export function updateBounds(viewport, worldBounds, textureInfo, newState, forceUpdate = false) {
  const viewportCorners = [
    viewport.unproject([0, 0]),
    viewport.unproject([viewport.width, 0]),
    viewport.unproject([viewport.width, viewport.height]),
    viewport.unproject([0, viewport.height])
  ];

  // #1: get world bounds for current viewport extends
  const visibleWorldBounds = getBounds(viewportCorners); // TODO: Change to visible bounds
  newState.visibleWorldBounds = visibleWorldBounds;
  newState.viewportCorners = viewportCorners;
  let boundsChanged = false;
  // Following section is used only when the texture bounds need re-calculating
  if (forceUpdate || !worldBounds || !boundsContain(worldBounds, visibleWorldBounds)) {
    // #2 : convert world bounds to common (Flat) bounds
    // #3 : extend common bounds to match aspect ratio with viewport
    const scaledCommonBounds = worldToCommonScreenBounds(visibleWorldBounds, viewport, textureInfo);

    // #4 :convert aligned common bounds to world bounds
    worldBounds = commonScreenToWorldBounds(scaledCommonBounds, viewport);
    // Clip webmercator projection limits
    worldBounds[1] = Math.max(worldBounds[1], -85.051129);
    worldBounds[3] = Math.min(worldBounds[3], 85.051129);
    worldBounds[0] = Math.max(worldBounds[0], -360);
    worldBounds[2] = Math.min(worldBounds[2], 360);

    // #5: now convert world bounds to common
    const normalizedCommonBounds = worldToCommonScreenBounds(worldBounds, viewport, textureInfo);

    newState.worldBounds = worldBounds;
    newState.normalizedCommonBounds = normalizedCommonBounds;

    boundsChanged = true;
  }

  return boundsChanged;
}

// Coverts long/lat to the common position in respect to the viewport
export function worldToCommonScreenBounds(worldBounds, viewport, textureInfo) {
  const [minLong, minLat, maxLong, maxLat] = worldBounds;
  const {textureSize, resolution} = textureInfo;
  const size = (textureSize * resolution) / viewport.scale;

  // to web mercator
  const bottomLeftCommon = viewport.projectPosition([minLong, minLat, 0]);
  const topRightCommon = viewport.projectPosition([maxLong, maxLat, 0]);

  // Ignore z component
  let commonBounds = bottomLeftCommon.slice(0, 2).concat(topRightCommon.slice(0, 2));
  commonBounds = scaleToAspectRatio(commonBounds, size, size);
  return commonBounds;
}

// Converts longlat to the the common position in respect to the specified coordination system
export function worldToCommonTextureBounds(
  worldBounds,
  viewport,
  textureInfo,
  coordinateSystem,
  coordinateOrigin
) {
  const [minLong, minLat, maxLong, maxLat] = worldBounds;
  const {textureSize, resolution} = textureInfo;
  const size = (textureSize * resolution) / viewport.scale;

  // to the specified
  const bottomLeftCommon = projectLongLatToLayerPosition(
    [minLong, minLat, 0],
    viewport,
    coordinateSystem,
    coordinateOrigin
  );
  const topRightCommon = projectLongLatToLayerPosition(
    [maxLong, maxLat, 0],
    viewport,
    coordinateSystem,
    coordinateOrigin
  );

  // Ignore z component
  let commonBounds = bottomLeftCommon.slice(0, 2).concat(topRightCommon.slice(0, 2));
  commonBounds = scaleToAspectRatio(commonBounds, size, size);
  return commonBounds;
}

export function projectLongLatToLayerPosition(xyz, viewport, coordinateSystem, coordinateOrigin) {
  return projectPosition(xyz, {
    viewport,
    coordinateSystem,
    coordinateOrigin,
    fromCoordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    fromCoordinateOrigin: [0, 0, 0]
  });
}

// input commonBounds: [xMin, yMin, xMax, yMax]
// output worldBounds: [minLong, minLat, maxLong, maxLat]
export function commonScreenToWorldBounds(commonBounds, viewport) {
  const [xMin, yMin, xMax, yMax] = commonBounds;
  const bottomLeftWorld = viewport.unprojectPosition([xMin, yMin]);
  const topRightWorld = viewport.unprojectPosition([xMax, yMax]);

  return bottomLeftWorld.slice(0, 2).concat(topRightWorld.slice(0, 2));
}

export function getBounds(points) {
  // Now build bounding box in world space (aligned to world coordiante system)
  const x = points.map(p => p[0]);
  const y = points.map(p => p[1]);

  const xMin = Math.min.apply(null, x);
  const xMax = Math.max.apply(null, x);
  const yMin = Math.min.apply(null, y);
  const yMax = Math.max.apply(null, y);

  return [xMin, yMin, xMax, yMax];
}

// true if currentBounds contains targetBounds, false otherwise
export function boundsContain(currentBounds, targetBounds) {
  if (
    targetBounds[0] >= currentBounds[0] &&
    targetBounds[2] <= currentBounds[2] &&
    targetBounds[1] >= currentBounds[1] &&
    targetBounds[3] <= currentBounds[3]
  ) {
    return true;
  }
  return false;
}

const scratchArray = new Float32Array(12);

// For given rectangle bounds generates two triangles vertices that coverit completely
export function packVertices(points, dimensions = 2) {
  let index = 0;
  // let scratchArray = new Float32Array(points.length * dimensions);
  // console.log(points.length * dimensions);
  for (const point of points) {
    for (let i = 0; i < dimensions; i++) {
      scratchArray[index++] = point[i] || 0;
    }
  }
  return scratchArray;
}

const scratchArray64 = new Float32Array(24);
// For given rectangle bounds generates two triangles vertices that coverit completely
export function packVertices64(points, dimensions = 2) {
  let index = 0;
  for (const point of points) {
    for (let i = 0; i < dimensions; i++) {
      const value = point[i] || 0;
      scratchArray64[index + i] = value;
      scratchArray64[index + i + dimensions] = fp64LowPart(value);
    }
    index += 2 * dimensions;
  }
  return scratchArray64;
}

// Expands boundingBox:[xMin, yMin, xMax, yMax] to match aspect ratio of given width and height
export function scaleToAspectRatio(boundingBox, width, height) {
  const [xMin, yMin, xMax, yMax] = boundingBox;

  const currentWidth = xMax - xMin;
  const currentHeight = yMax - yMin;

  let newWidth = currentWidth;
  let newHeight = currentHeight;
  if (currentWidth / currentHeight < width / height) {
    // expand bounding box width
    newWidth = (width / height) * currentHeight;
  } else {
    newHeight = (height / width) * currentWidth;
  }

  if (newWidth < width) {
    newWidth = width;
    newHeight = height;
  }

  const xCenter = (xMax + xMin) / 2;
  const yCenter = (yMax + yMin) / 2;

  return [
    xCenter - newWidth / 2,
    yCenter - newHeight / 2,
    xCenter + newWidth / 2,
    yCenter + newHeight / 2
  ];
}

// Get texture coordiante of point inside a bounding box
export function getTextureCoordinates(point, bounds) {
  const [xMin, yMin, xMax, yMax] = bounds;
  return [(point[0] - xMin) / (xMax - xMin), (point[1] - yMin) / (yMax - yMin)];
}
