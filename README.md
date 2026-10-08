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

## The easy way: drop everything

On the home page click the big upload area (or drop files / a **whole folder**). HouseVault

1. **recognises each file** from its name and, for PDFs, the text inside (Dutch / French / English / German keywords):
   floor plan per level (kelder / gelijkvloers / verdieping / zolder…), situatieschema, eendraadschema, gevelplan
   (voor- / achter- / zijgevel), inplantingsplan, EPC, keuringsverslag, other documents. You get one review screen to
   fix anything it got wrong;
2. **builds the house**: scale read by OCR from the dimension labels, walls / doors / windows / openings detected,
   room names read, levels stacked, facade drawings put on the right side, site plan on the ground, switches wired to
   lamps;
3. opens the **3D view** with a card "What I built – please check" that lists what is certain and what needs a look
   (e.g. "could not read a scale – calibrate with the 📏 tool").

Everything stays editable afterwards in the Floor plans / Electrical tabs. Prefer to go level by level? Use
*Set up manually*.

## Lighting simulation

* **Auto-wiring:** every switch controls the lamps of the space it faces (rooms joined by a doorway count as one space,
  so the living-room switch also lights the open kitchen). Double switches split main and accent lights. Override per
  symbol with "Switch group" in the Electrical tab, or press 🔌 *Auto-wire*.
* In 3D, **click a switch or lamp** (or use the Lighting panel) to flick it: lamps glow, real point lights fall on the
  walls, dimmers get a slider. **Night mode** switches the daylight off; "Evening: all lights on" shows the whole house.

## Exterior: facades, garden, site

* **Gevelplannen:** upload an elevation per side, drag a box around the building, and it is stretched over that side
  (best for rectangular buildings). Wall colour (render / brick / cladding), roof colour and gable / flat roof.
* **Garden:** lawn, pavement, trees. **Site plan (inplantingsplan):** draped on the ground; scale and position with the
  normal calibrate / move tools (*Underlay: site plan*).

## Architect & homeowner tools

* room **areas** (shown on the 3D labels), floor area, volume, a window/floor **daylight** indicator per room;
* **sun study**: month, time of day, plan orientation, animated day with shadows (Belgian latitude by default);
* **circuit highlight**: show only the devices of one breaker;
* **📄 Report** (printable HTML: levels, rooms, devices per circuit) and **📊 Device list** (CSV with room, circuit,
  height per symbol) for the electrician or the file cabinet;
* 📐 **measure** tool, ✨ **discover repeated symbols** (finds groups of identical glyphs on a situatieschema – you
  name each group once), 🔍 teach-by-example, OCR.

## Manual workflow

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

## OCR – reading dimensions and room names

**🔎 Read dimensions & room names (OCR)** (Floor plans / Electrical tab) runs Tesseract (WebAssembly, vendored in
`vendor/tesseract/`, Dutch + French + English models) in your browser – nothing is uploaded.

* **Scale:** every recognised number is matched to the dimension line it sits on (the segment between the tick marks),
  and the pixel length / stated value votes for a scale. Metres, centimetres and millimetres are tried and the
  hypothesis supported by most labels wins. Vertical dimension text is read too (3 passes). Result and confidence are
  shown before anything is applied; matched numbers are boxed on the drawing so you can verify.
  On the synthetic test plan 4 of 4 labels agreed and the scale came out exact.
* **Room / zone names:** words such as *Keuken*, *Magazijn*, *Loods* become draggable labels (also shown in 3D).

## Teach-by-example symbol finder (🔍, Electrical tab)

Drag a box around **one** symbol on your situatieschema, pick what it is, and HouseVault finds every look-alike on the
drawing (normalised cross-correlation) and places them – wall devices snap to the nearest wall face. Because the
template comes from *your* drawing, it works for any symbol style, including industrial and custom ones.
Matching assumes the same size and orientation as the example (box a rotated one separately).

## Industrial / commercial properties

Choose **Industrial / commercial building** when creating a project:

* level presets for halls, mezzanines, offices, technical levels (tall walls, thick slabs); floor elevation can be set
  manually, e.g. a mezzanine inside a hall;
* structural **columns** (square or round), overhead **sectional doors**, **loading-dock doors**, roller shutters,
  large openings, **gable roof** with adjustable pitch, room / zone labels;
* wall detection tuned for thick walls and large gaps (sectional / dock doors are suggested for wide outer gaps);
* 27 extra symbols: high-bay luminaires, cable trays and busbar trunking (with length), main (TGBT) / sub boards,
  CEE sockets 16/32/63 A, motors, VFDs, emergency stops, transformer cabin, generator, UPS, crane feed, DC fast
  charger – plus fire & security: manual call points, heat detectors, alarm panel, horns, sprinklers, extinguishers,
  hose reels, exit signs, CCTV, badge readers;
* an **industrial demo** (48 × 30 m hall with production area, dock doors and office mezzanine) on the home page.

## Limits (honest notes)

* Wall detection is a heuristic for clean, axis-aligned plans. Scanned, rotated or hatched drawings need correction.
* OCR needs reasonably clean, high-resolution drawings. Handwriting and very small or stylised fonts are missed, and
  dimension chains that lack tick marks may not be matched. Always glance at the OCR result before applying it.
* Symbols are not recognised from the built-in icon library (it is a redraw, not your installer's exact glyphs);
  use the teach-by-example finder or place them by hand.
* Levels share one coordinate system and a vertical stack; non-rectangular roofs are approximated by a bounding gable.
* The eendraadschema is stored in the library but not interpreted.
