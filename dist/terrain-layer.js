// The contour tiles start at the north-west corner; CRS.Simple counts rows
// southward from the southern edge (negative indices within the world).
function addTerrainContours(map, bounds) {
  const pane = map.createPane('terrainContours');
  pane.style.zIndex = '407';
  pane.style.pointerEvents = 'none';

  const Contours = L.TileLayer.extend({
    getTileUrl({x, y, z}) {
      const rows = 2 ** (z + 2);
      return 'wiki-contours/' + z + '/' + x + '/' + (y + rows) + '.png';
    }
  });
  return new Contours('', {
    pane: 'terrainContours',
    bounds,
    tileSize: 512,
    minZoom: map.getMinZoom(),
    maxZoom: map.getMaxZoom(),
    minNativeZoom: -2,
    maxNativeZoom: 2,
    noWrap: true,
    keepBuffer: 1
  }).addTo(map);
}
