# Tesla Wrap Studio

Design custom wraps for your Tesla's Paint Shop 3D visualization directly in the browser. Pick your vehicle, create your artwork on top of Tesla's official wrap template, validate it against Tesla's requirements in real time, and export a ready-to-transfer file — no Photoshop required.

**Use it live:** [ipaliog-a11y.github.io/Wrap-tool](https://ipaliog-a11y.github.io/Wrap-tool/)

Built as a companion to Tesla's official [`teslamotors/custom-wraps`](https://github.com/teslamotors/custom-wraps) template repository. Templates and vehicle images are fetched from that repo at runtime, so nothing is bundled and assets stay up to date.

---

## Features

### Vehicle selection
All 12 Tesla vehicle/variant templates from the official repo, each shown with its vehicle image:

- Cybertruck
- Model 3
- Model 3 (2024+) — Standard & Premium, and Performance
- Model Y
- Model Y (2025+) — Standard, Premium, and Performance
- Model Y L
- Model S (2021+)
- Model S (2025+) Plaid
- Model X (2021+)

### Design editor
A canvas-based editor laid over your vehicle's official `template.png`:

- **Layers** — every imported image and every piece of text becomes its own layer. Select, reorder, hide and delete them from the sidebar. Brush, eraser and fill always draw on the single Paint layer.
- **Move** — drag any layer with the Move tool. This is **non-destructive**: content dragged past the edge is hidden, not cropped, and comes back if you drag it in again.
- **Resize** — drag the corner handles of a selected image or text layer, or use the Scale slider. Always uniform, so photos never distort.
- **Brush** and **Eraser** with adjustable color, size, gradients and patterns
- **Flood fill** — fills the region you can actually see (sampled from the flattened composite), with a colour tolerance so antialiased edges don't leave a halo
- **Text** placement with custom color and size, as its own movable, resizable layer
- **Icons / stickers** — drop emoji as layers
- **Add image** — import any photo; it is **cover-fitted** to the square without distortion, then free to move and resize
- **Import template** — add the official template as a layer to trace over
- **Dim non-wrap areas** toggle — shades the parts of the square the wrap doesn't cover, so your colours read at full strength exactly where they'll show on the car
- **Grid guides** toggle for alignment
- **Undo / Redo** — up to 30 steps covering every edit, capped at 64 MB of history
- **Zoom / Pan** for detail work; panning is clamped so the artwork can't be lost off-screen
- **Autosave** — named designs persist in the browser (localStorage)

### Validation & export
- **Live validation** against Tesla's exact requirements: PNG format, square 512×512–1024×1024 px, ≤ 1 MB, and filename rules (letters/numbers/spaces/`-`/`_`, ≤ 30 chars, auto-sanitized)
- **Always under 1 MB** — export automatically tries 1024² PNG → 512² PNG → 512² JPEG at decreasing quality until the file fits Tesla's 1 MB cap, and reports the final size/format (e.g. `512x512 PNG (640 KB)`)
- **Export PNG** — one square PNG per wrap, which is what every vehicle template in the official repo expects
- **3D preview** — spin the design on a simplified car before you export
- **Check an existing PNG** — validate a wrap you made in another tool (Photoshop, Figma, etc.)

---

## Getting started

### Prerequisites
- [Node.js](https://nodejs.org/) 18 or newer

### Install & run

```bash
git clone https://github.com/ipaliog-a11y/Wrap-tool.git
cd Wrap-tool
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### Production build

```bash
npm run typecheck  # tsc --noEmit
npm run build      # typecheck, then output to dist/
npm run preview    # preview the production build
```

GitHub Pages deploys `dist/` from `main` via `.github/workflows/pages.yml`.

---

## How to use your wrap on the car

Once you've exported a valid wrap PNG:

1. **Mobile app** (Tesla app v4.59.0 or later): Creations → Wrap → Upload
2. **USB drive**: format as exFAT / FAT32 (Windows) / MS-DOS FAT (Mac) / ext3 / ext4 (NTFS is not supported), create a folder named `Wraps` at the root, and place your PNG(s) inside. Make sure the drive has no map or firmware update files.
3. **In the car**: Toybox → Paint Shop → Wraps tab → select your wrap

You can have up to 10 wraps from the mobile app and up to 10 from a USB drive.

---

## How it works

| Piece | Detail |
|---|---|
| **Templates** | Fetched at runtime from `teslamotors/custom-wraps` (`<folder>/template.png` and `<folder>/vehicle_image.png`) over HTTPS with CORS — nothing bundled |
| **Document** | An ordered list of layers, each with its own position: one raster Paint layer plus an image or text layer per import. Nothing is rasterised on contact, which is what makes Move non-destructive and Resize possible |
| **Rendering** | `compositeLayers` in `src/lib/layers.ts` is the single definition of what the wrap looks like — both the on-screen preview and the exporter call it, so they cannot drift apart |
| **Opacity** | White is painted beneath every composite rather than living in a layer, so erasing reveals white instead of transparency and the export can never carry alpha |
| **History** | Image and text layers are immutable and stored by reference; paint pixels are shared between entries until a paint operation changes them, so move/resize/reorder entries are effectively free |
| **Cover-fit** | Importing a photo scales by `max(size/imgW, size/imgH)` and centers, so artwork fills the square with no distortion. The template uses `min(...)` instead — it must stay whole, and the Cybertruck template is 1024×768 rather than square |
| **Non-wrap mask** | Templates are RGBA with the wrap panels as opaque white and everything else transparent. `buildNonWrapMask` punches the template out of a full-square scrim, leaving only the non-wrap area shaded |
| **Compression** | `exportUnder1MB` re-encodes the canvas at progressively smaller size/quality (PNG → 512² PNG → JPEG q0.92…0.35) until the blob is ≤ 1 MB |
| **Export** | `canvas.toBlob`, flattened onto white so the wrap never carries alpha |
| **Validation** | Client-side checks mirror Tesla's README (format, dimensions, size, filename) |

---

## Tech stack

- **React 18** + **TypeScript** + **Vite**
- **HTML5 Canvas** for the editor (no drawing library)
- **three.js** for the 3D preview
- No backend — fully client-side; designs persist in localStorage

## Project structure

```
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── main.tsx                 # entry + global error surface
    ├── App.tsx                  # vehicle picker / studio swap
    ├── styles.css               # Tesla-inspired dark theme
    ├── data/
    │   └── vehicles.ts          # vehicle/template config + Tesla requirements
    ├── lib/
    │   ├── layers.ts            # layer model, compositing, bounds, hit testing
    │   ├── useWrapDocument.ts   # layers + selection + undo history + export
    │   ├── designStore.ts       # localStorage persistence
    │   ├── paintStyle.ts        # solid / gradient / pattern brushes
    │   └── validate.ts          # validation + exportUnder1MB compression
    └── components/
        ├── VehiclePicker.tsx    # vehicle grid
        ├── Studio.tsx           # layout, document owner, template download
        ├── WrapCanvas.tsx       # the canvas editor
        ├── LayersPanel.tsx      # layer list: select, reorder, hide, delete
        ├── IconPicker.tsx       # sticker drawer
        ├── ThreeDPreview.tsx    # three.js wrap preview
        └── ExportPanel.tsx      # validation + export + existing-PNG checker
```

---

## Notes & disclaimer

- This is an **unofficial fan tool** and is not affiliated with or endorsed by Tesla, Inc.
- Wraps personalize only the **3D vehicle visualization** in the Paint Shop — they do not change your car's physical appearance.
- PNG is the required format for the Paint Shop. JPEG export is offered only as a last-resort fallback to meet the 1 MB limit; where possible, keep artwork simple enough that a 1024² or 512² PNG stays under 1 MB.
- "Tesla", "Model 3", "Model Y", "Model S", "Model X", and "Cybertruck" are trademarks of Tesla, Inc.
