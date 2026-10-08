# HouseVault

A digital library for your house documents (grondplannen, situatieschema's, eendraadschema's, keuringsverslagen…)
that also turns your floor plans into a scaled 3D model, including the electrical installation.

Everything runs in the browser – files are stored locally in IndexedDB, nothing is uploaded.

## Run

```bash
cd housevault
npx http-server . -p 8080 -c-1      # or any static file server
# open http://localhost:8080
```
No build step. Three.js and pdf.js are vendored in `vendor/`.

## Workflow

1. **Home → "Click here to upload your plan"**. Add one file per level (basement, ground, first, second, attic…); each can
   have an optional situatieschema. PDFs and images are supported.
2. **Floor plans tab** – per level: calibrate the scale (📏 click two points of known length, or "PDF printed at 1:N"),
   then **Detect walls** (axis-aligned, solid or double-line walls; gaps in walls become door/window/doorway candidates)
   or draw them by hand. Add doors, windows, doorways and garage doors; align levels (⇱) so they stack correctly.
3. **Electrical tab** – upload the situatieschema as underlay and place symbols from the Belgian palette.
   Wall devices snap to the nearest wall face; every symbol keeps its own type, height, circuit and label.
4. **Finish & visualize** → **My Projects** shows the project with a 3D preview.
5. **3D view** – orbit/zoom/pan, zoom buttons, preset views, layer-by-layer visibility (solo / up-to-here),
   exploded floors, horizontal section cut, X-ray walls, roof, electrical devices & markers by category,
   plan-on-floor overlay, hover tooltips, screenshot.

A built-in **demo house** (3 levels with a full electrical layout) is available on the home page.

## Symbol library

`js/symbols.js` inventories ~45 symbols used on Belgian installation drawings (AREI/RGIE) in Dutch, French and English:
lighting, single/double/two-way/intermediate switches, push buttons, dimmers, sockets (single/double/triple, worktop, IP44,
dedicated circuit, power, floor, EV), data/TV/phone, bells, thermostat, smoke/CO detectors, boards, meter, junction boxes,
appliances. Users can add their own icons. The pictograms are simplified redraws – compare against your own legend.
The Symbol Library page also summarises how other countries differ.

## Limits (honest notes)

* Wall detection is a heuristic for clean, axis-aligned plans. Scanned/rotated/hatched drawings need manual correction.
* Dimensions written on the plan are not read (no OCR) – you calibrate with one known length.
* Electrical symbols are placed manually; they are not recognised automatically on the uploaded situatieschema.
* The eendraadschema is stored in the library but not interpreted.
