# TODO - Fix Map Not Showing & Delivery Address Modal Not Opening

## Root Cause (Issue 1 & 2)
In `public/function.js`, the Leaflet Map Picker Modal Integration block was placed AFTER the `if (!trackForm) { return; }` early-return. On the home page there is no `trackForm`, so the function returned early and the map-picker code never ran.

## Fix Applied
1. Moved the `// --- Leaflet Map Picker Modal Integration ---` block to BEFORE the `trackForm` early-return check.
2. Removed the duplicate trailing map-picker block.
3. Switched the tile layer from `tiles.openfreemap.org` (Spotify's OpenFreeMap) to the standard `{s}.tile.openstreetmap.org` server, since the OpenFreeMap tiles were not rendering.

## Status
- [x] Move map-picker block before trackForm early-return
- [x] Remove duplicate map-picker block
- [x] Verify file syntactically valid (`node -c`)
- [x] Switch tile layer to standard OpenStreetMap server
- [x] Modal now opens on delivery-address click (confirmed by user)
- [ ] Confirm map tiles render in the modal body (browser)
