// The terrain covers 10,240 game units, drawn in 2,048 Leaflet CRS.Simple units.
// Pindrop uses 256-pixel tile interiors and two pixels of overlap on shared edges.
function addTerrainDetail(map) {
  const mapExtent = 2048;
  const baseResolution = 2560;
  const tilePixels = 256;
  const displayScale = mapExtent / baseResolution;
  const pane = map.createPane('terrainDetail');
  pane.style.zIndex = '405';
  pane.style.pointerEvents = 'none';

  const DetailGrid = L.GridLayer.extend({
    createTile(coords, done) {
      const tile = document.createElement('div');
      tile.style.overflow = 'hidden';

      const resolution = baseResolution * 2 ** coords.z;
      const columns = resolution / tilePixels;
      // Leaflet's grid has its row origin on the south edge in CRS.Simple.
      const col = coords.x;
      const row = coords.y + columns;
      const image = new Image();
      image.alt = '';
      image.draggable = false;
      image.style.position = 'absolute';
      image.style.maxWidth = 'none';
      image.style.maxHeight = 'none';
      image.style.left = (col > 0 ? -2 * displayScale : 0) + 'px';
      image.style.top = (row > 0 ? -2 * displayScale : 0) + 'px';
      image.onload = () => {
        image.style.width = image.naturalWidth * displayScale + 'px';
        image.style.height = image.naturalHeight * displayScale + 'px';
        tile.appendChild(image);
        done(null, tile);
      };
      image.onerror = () => done(new Error('Terrain tile unavailable'), tile);
      image.src = 'https://tiles.pindrop.gg/enshrouded/base-v2/v11/' +
        resolution + '/' + col + '_' + row + '.webp';
      return tile;
    }
  });

  return new DetailGrid({
    tileSize: tilePixels * displayScale,
    bounds: [[0, 0], [mapExtent, mapExtent]],
    minZoom: 1,
    maxNativeZoom: 4,
    maxZoom: Math.max(4, map.getMaxZoom()),
    keepBuffer: 1,
    noWrap: true,
    pane: 'terrainDetail'
  }).addTo(map);
}

// The contour tiles start at the north-west corner; CRS.Simple counts rows
// southward from the southern edge (negative indices within the world).
function addTerrainContours(map, bounds) {
  const pane = map.createPane('terrainContours');
  pane.style.zIndex = '407';
  pane.style.pointerEvents = 'none';

  const Contours = L.TileLayer.extend({
    getTileUrl({x, y, z}) {
      const rows = 2 ** (z + 2);
      return 'contours/' + z + '/' + x + '/' + (y + rows) + '.png';
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
