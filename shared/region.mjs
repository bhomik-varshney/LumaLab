// Coordinates are zero-based source pixels, independent of CSS size or device pixels.
export function validateRegion(value) {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !["x", "y", "width", "height"].includes(key)) ||
    !["x", "y", "width", "height"].every((key) => Number.isSafeInteger(value[key]))
  )
    throw Object.assign(new Error("Use integer region coordinates and dimensions."), {
      statusCode: 400,
    });
  if (
    value.x < 0 ||
    value.y < 0 ||
    value.width < 8 ||
    value.height < 8 ||
    value.x + value.width > 16000000 ||
    value.y + value.height > 16000000
  )
    throw Object.assign(new Error("Select a region of at least 8 × 8 pixels within the image."), {
      statusCode: 400,
    });
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}
