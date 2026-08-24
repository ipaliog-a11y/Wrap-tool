import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Vehicle, templateUrl } from '../data/vehicles'
import {
  Bounds,
  buildNonWrapMask,
  compositeLayers,
  compositeToCanvas,
  isResizable,
  layerBounds,
  hitTest,
  rotatePoint,
  rotationOf,
  toLocalPoint,
} from '../lib/layers'
import {
  PaintStyle,
  PATTERN_OPTIONS,
  DEFAULT_PAINT_STYLE,
  paintStyleFor,
  swatchDataUrl,
} from '../lib/paintStyle'
import { WrapDocument } from '../lib/useWrapDocument'
import { Icon, IconName } from './icons'
import IconPicker from './IconPicker'

export type Tool = 'brush' | 'eraser' | 'fill' | 'text' | 'move' | 'pan'

// Size of the on-screen canvas in device pixels. The document (canvasSize) is
// fitted into it, so display pixels and document pixels are never 1:1.
const DISPLAY_SIZE = 900

// Flood fill matches within this per-channel distance, so antialiased strokes
// don't leave a halo of near-miss pixels behind.
const FILL_TOLERANCE = 32

// Corner grab targets, in device pixels.
const HANDLE_PX = 12
// How far above the top edge the rotate handle floats, in device pixels.
const ROTATE_OFFSET_PX = 28

const TAU = Math.PI * 2
const rotateVector = (v: { x: number; y: number }, a: number) =>
  rotatePoint(v, { x: 0, y: 0 }, a)

type TemplateStatus = 'loading' | 'ready' | 'error'

interface Props {
  vehicle: Vehicle
  doc: WrapDocument
}

// Keep the artwork inside the viewport: centred while it fits, and never
// draggable past its own edges once zoomed in.
function clampOffset(
  o: { x: number; y: number },
  zoom: number,
): { x: number; y: number } {
  const artPx = DISPLAY_SIZE * zoom
  if (artPx <= DISPLAY_SIZE) {
    const centred = (DISPLAY_SIZE - artPx) / 2
    return { x: centred, y: centred }
  }
  const min = DISPLAY_SIZE - artPx
  return {
    x: Math.min(0, Math.max(min, o.x)),
    y: Math.min(0, Math.max(min, o.y)),
  }
}

/** Corners in a fixed order: top-left, top-right, bottom-left, bottom-right. */
const cornersOf = (b: Bounds) => [
  { x: b.x, y: b.y },
  { x: b.x + b.w, y: b.y },
  { x: b.x, y: b.y + b.h },
  { x: b.x + b.w, y: b.y + b.h },
]
const centreOf = (b: Bounds) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
/** Rotate grip, in the layer's unrotated frame. */
const rotateGripOf = (b: Bounds, viewScale: number) => ({
  x: b.x + b.w / 2,
  y: b.y - ROTATE_OFFSET_PX / viewScale,
})

const NEXT_STYLE: Record<PaintStyle['kind'], PaintStyle['kind']> = {
  solid: 'gradient',
  gradient: 'pattern',
  pattern: 'solid',
}
const STYLE_LABEL: Record<PaintStyle['kind'], string> = {
  solid: 'Solid',
  gradient: 'Gradient',
  pattern: 'Pattern',
}

export default function WrapCanvas({ vehicle, doc }: Props) {
  const canvasSize = doc.canvasSize
  const displayRef = useRef<HTMLCanvasElement>(null)
  const templateImgRef = useRef<HTMLImageElement | null>(null)
  // Prebuilt scrim over the non-wrap area; rebuilt only when the template changes.
  const maskRef = useRef<HTMLCanvasElement | null>(null)

  const [tool, setTool] = useState<Tool>('brush')
  const [paintStyle, setPaintStyle] = useState<PaintStyle>(DEFAULT_PAINT_STYLE)
  const [brushSize, setBrushSize] = useState(12)
  const [mirror, setMirror] = useState(false)
  const [dimNonWrap, setDimNonWrap] = useState(true)
  const [showGuides, setShowGuides] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [templateStatus, setTemplateStatus] = useState<TemplateStatus>('loading')
  const [textValue, setTextValue] = useState('')
  const [notice, setNotice] = useState('')
  const [iconsOpen, setIconsOpen] = useState(false)

  const drawing = useRef(false)
  const panning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const dragStart = useRef<{
    x: number
    y: number
    layerId: number
    lx: number
    ly: number
  } | null>(null)
  const resizeStart = useRef<{
    layerId: number
    /** Document-space position of the anchor corner, held fixed. */
    fixed: { x: number; y: number }
    /** Which quadrant the anchor sits in, relative to the centre. */
    sign: { x: number; y: number }
    bounds: Bounds
    rotation: number
    scale0: number
    fontSize0: number
  } | null>(null)
  const rotateStart = useRef<{
    layerId: number
    centre: { x: number; y: number }
    pointerAngle: number
    rotation0: number
  } | null>(null)

  // Device pixels per document pixel. Inverted by toCanvasCoords().
  const viewScale = (DISPLAY_SIZE / canvasSize) * zoom

  const selected = doc.selected
  const selectedBounds =
    selected && selected.visible ? layerBounds(selected, canvasSize) : null

  useEffect(() => {
    setOffset((o) => {
      const next = clampOffset(o, zoom)
      return next.x === o.x && next.y === o.y ? o : next
    })
    if (zoom <= 1) setTool((t) => (t === 'pan' ? 'brush' : t))
  }, [zoom])

  useEffect(() => {
    setTemplateStatus('loading')
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      templateImgRef.current = img
      maskRef.current = buildNonWrapMask(img, canvasSize)
      setTemplateStatus('ready')
    }
    img.onerror = () => {
      templateImgRef.current = null
      maskRef.current = null
      setTemplateStatus('error')
    }
    img.src = templateUrl(vehicle)
  }, [vehicle, canvasSize])

  const render = useCallback(() => {
    const display = displayRef.current
    if (!display) return
    const ctx = display.getContext('2d')!

    ctx.save()
    ctx.clearRect(0, 0, display.width, display.height)
    const s = 16
    for (let y = 0; y < display.height / s; y++) {
      for (let x = 0; x < display.width / s; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#1a1b1e' : '#141518'
        ctx.fillRect(x * s, y * s, s, s)
      }
    }

    // Below here, 1 unit == 1 document pixel - the same space the exporter
    // works in, so the preview cannot drift from the exported file.
    ctx.translate(offset.x, offset.y)
    ctx.scale(viewScale, viewScale)
    const size = canvasSize
    ctx.imageSmoothingEnabled = true

    compositeLayers(ctx, doc.layers, size)

    // Shade what the wrap does not cover, rather than washing out what it
    // does. Paint reads at full strength exactly where it will show on the car.
    if (dimNonWrap && maskRef.current) {
      ctx.drawImage(maskRef.current, 0, 0)
    }

    if (showGuides) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 1 / viewScale
      for (let i = 1; i < 4; i++) {
        ctx.beginPath()
        ctx.moveTo((size / 4) * i, 0)
        ctx.lineTo((size / 4) * i, size)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, (size / 4) * i)
        ctx.lineTo(size, (size / 4) * i)
        ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(62,106,255,0.5)'
      ctx.strokeRect(0, 0, size, size)
    }

    // Selection chrome is preview-only: the exporter calls compositeLayers
    // directly and never sees any of this.
    if (selectedBounds && selected) {
      const b = selectedBounds
      const rot = rotationOf(selected)
      const c = centreOf(b)
      ctx.save()
      if (rot) {
        ctx.translate(c.x, c.y)
        ctx.rotate(rot)
        ctx.translate(-c.x, -c.y)
      }
      ctx.strokeStyle = 'rgba(62,106,255,0.95)'
      ctx.lineWidth = 1.5 / viewScale
      ctx.setLineDash([6 / viewScale, 4 / viewScale])
      ctx.strokeRect(b.x, b.y, b.w, b.h)
      ctx.setLineDash([])
      if (isResizable(selected)) {
        const hs = HANDLE_PX / viewScale
        ctx.fillStyle = '#3e6aff'
        for (const corner of cornersOf(b)) {
          ctx.fillRect(corner.x - hs / 2, corner.y - hs / 2, hs, hs)
        }
        const grip = rotateGripOf(b, viewScale)
        ctx.beginPath()
        ctx.moveTo(c.x, b.y)
        ctx.lineTo(grip.x, grip.y)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(grip.x, grip.y, hs * 0.55, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    }
    ctx.restore()
  }, [
    canvasSize,
    doc.layers,
    offset,
    selected,
    selectedBounds,
    showGuides,
    dimNonWrap,
    templateStatus,
    viewScale,
  ])

  useEffect(() => {
    render()
  })

  const toCanvasCoords = (e: React.PointerEvent) => {
    const display = displayRef.current!
    const rect = display.getBoundingClientRect()
    const scaleX = display.width / rect.width
    const scaleY = display.height / rect.height
    const px = (e.clientX - rect.left) * scaleX
    const py = (e.clientY - rect.top) * scaleY
    // Exact inverse of the transform applied in render().
    return {
      x: (px - offset.x) / viewScale,
      y: (py - offset.y) / viewScale,
    }
  }

  const drawSegment = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    erase: boolean,
  ) => {
    const layer = doc.activePaintLayer
    const ctx = doc.getPaintContext()
    ctx.save()
    // Document coordinates -> this layer's own bitmap.
    ctx.translate(-layer.x, -layer.y)
    // A true erase, not white paint: it cuts through to the layer below, and
    // ultimately to the white base that every composite starts with.
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
    if (!erase) ctx.strokeStyle = paintStyleFor(paintStyle, ctx)
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    // Mirror across the vertical centreline, in the same composite mode (so a
    // mirrored erase cuts out the mirrored stroke). The style is rebuilt for
    // the mirrored pass so the stroke samples the gradient/pattern at its own
    // mirrored position.
    if (mirror) {
      const mw = doc.canvasSize
      if (!erase) ctx.strokeStyle = paintStyleFor(paintStyle, ctx)
      ctx.beginPath()
      ctx.moveTo(mw - from.x, from.y)
      ctx.lineTo(mw - to.x, to.y)
      ctx.stroke()
    }
    ctx.restore()
    doc.notePaint()
  }

  /**
   * Scanline flood fill of one region. The region is decided from the
   * flattened composite - what the user actually sees - and the result is
   * stamped into the paint layer. Seeding one neighbour per contiguous run
   * keeps the stack holding spans rather than pixels.
   */
  const fillRegion = (px: number, py: number) => {
    const w = canvasSize
    const h = canvasSize
    const x0 = Math.floor(px)
    const y0 = Math.floor(py)
    if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return

    const flat = compositeToCanvas(doc.layers, canvasSize)
    const data = flat.getContext('2d')!.getImageData(0, 0, w, h).data
    const start = (y0 * w + x0) * 4
    const sr = data[start]
    const sg = data[start + 1]
    const sb = data[start + 2]
    const sa = data[start + 3]

    // Compare the seed against the style's base colour (gradients/patterns
    // are multi-toned; their first colour is the best single stand-in).
    const fc = parseInt(paintStyle.color.slice(1), 16)
    const fr = (fc >> 16) & 255
    const fg = (fc >> 8) & 255
    const fb = fc & 255
    if (
      Math.abs(sr - fr) <= FILL_TOLERANCE &&
      Math.abs(sg - fg) <= FILL_TOLERANCE &&
      Math.abs(sb - fb) <= FILL_TOLERANCE &&
      sa === 255
    )
      return

    const visited = new Uint8Array(w * h)
    const matches = (p: number) => {
      if (visited[p]) return false
      const i = p * 4
      return (
        Math.abs(data[i] - sr) <= FILL_TOLERANCE &&
        Math.abs(data[i + 1] - sg) <= FILL_TOLERANCE &&
        Math.abs(data[i + 2] - sb) <= FILL_TOLERANCE &&
        Math.abs(data[i + 3] - sa) <= FILL_TOLERANCE
      )
    }

    const stack: number[] = [y0 * w + x0]
    while (stack.length) {
      const p = stack.pop()!
      if (!matches(p)) continue
      const cy = Math.floor(p / w)
      const rowStart = cy * w
      let left = p - rowStart
      let right = left
      while (left > 0 && matches(rowStart + left - 1)) left--
      while (right < w - 1 && matches(rowStart + right + 1)) right++
      for (let cx = left; cx <= right; cx++) visited[rowStart + cx] = 1
      for (const ny of [cy - 1, cy + 1]) {
        if (ny < 0 || ny >= h) continue
        const nRow = ny * w
        let inRun = false
        for (let cx = left; cx <= right; cx++) {
          if (matches(nRow + cx)) {
            if (!inRun) {
              stack.push(nRow + cx)
              inRun = true
            }
          } else {
            inRun = false
          }
        }
      }
    }

    // Stamp the mask into the paint layer, translated into its local space.
    // The fill style is built in this layer's space so gradients/patterns are
    // anchored to the canvas and never drift with panning or zooming.
    const layer = doc.activePaintLayer
    const ctx = doc.getPaintContext()
    const lw = layer.canvas.width
    const lh = layer.canvas.height
    const fillStyle = paintStyleFor(paintStyle, ctx)
    const ox = Math.round(layer.x)
    const oy = Math.round(layer.y)
    const stamp = document.createElement('canvas')
    stamp.width = w
    stamp.height = h
    const sctx = stamp.getContext('2d')!
    // Region mask: opaque where the fill applies.
    const mask = sctx.createImageData(w, h)
    for (let p = 0; p < w * h; p++) {
      if (!visited[p]) continue
      mask.data[p * 4 + 3] = 255
    }
    sctx.putImageData(mask, 0, 0)
    const tmp = document.createElement('canvas')
    tmp.width = w
    tmp.height = h
    const tctx = tmp.getContext('2d')!
    tctx.fillStyle = fillStyle
    tctx.fillRect(0, 0, w, h)
    tctx.globalCompositeOperation = 'destination-in'
    tctx.drawImage(stamp, 0, 0)
    // Copy only the stamped pixels into the layer.
    const target = ctx.getImageData(0, 0, lw, lh)
    const td = target.data
    const src = tctx.getImageData(0, 0, w, h).data
    for (let p = 0; p < w * h; p++) {
      if (!visited[p]) continue
      const dx = p % w
      const dy = (p - dx) / w
      const lx = dx - ox
      const ly = dy - oy
      if (lx < 0 || ly < 0 || lx >= lw || ly >= lh) continue
      const i = (ly * lw + lx) * 4
      const si = p * 4
      td[i] = src[si]
      td[i + 1] = src[si + 1]
      td[i + 2] = src[si + 2]
      td[i + 3] = 255
    }
    ctx.putImageData(target, 0, 0)
    doc.notePaint()
  }

  const floodFill = (px: number, py: number) => {
    fillRegion(px, py)
    if (mirror) fillRegion(canvasSize - px, py)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    if (tool === 'pan') {
      panning.current = true
      panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
      return
    }
    const p = toCanvasCoords(e)

    if (tool === 'move') {
      // Handles on the current selection win over re-selecting. They are
      // compared in the layer's own frame, so they stay grabbable when rotated.
      if (selected && isResizable(selected) && selectedBounds) {
        const b = selectedBounds
        const rot = rotationOf(selected)
        const centre = centreOf(b)
        const local = toLocalPoint(p, selected, canvasSize)
        const grab = HANDLE_PX / viewScale

        const grip = rotateGripOf(b, viewScale)
        if (Math.hypot(local.x - grip.x, local.y - grip.y) <= grab) {
          doc.snapshot()
          rotateStart.current = {
            layerId: selected.id,
            centre,
            pointerAngle: Math.atan2(p.y - centre.y, p.x - centre.x),
            rotation0: rot,
          }
          return
        }

        const corners = cornersOf(b)
        const index = corners.findIndex(
          (c) =>
            Math.abs(local.x - c.x) <= grab && Math.abs(local.y - c.y) <= grab,
        )
        if (index >= 0) {
          doc.snapshot()
          const anchor = corners[3 - index]
          resizeStart.current = {
            layerId: selected.id,
            // Held fixed in document space, so the anchor corner does not
            // drift even when the layer is rotated.
            fixed: rotatePoint(anchor, centre, rot),
            sign: {
              x: Math.sign(anchor.x - centre.x) || -1,
              y: Math.sign(anchor.y - centre.y) || -1,
            },
            bounds: b,
            rotation: rot,
            scale0: selected.kind === 'image' ? selected.scale : 1,
            fontSize0: selected.kind === 'text' ? selected.fontSize : 1,
          }
          return
        }
      }
      const hit = hitTest(doc.layers, p, canvasSize)
      if (!hit) {
        doc.select(null)
        return
      }
      if (hit.id !== doc.selectedId) doc.select(hit.id)
      doc.snapshot()
      dragStart.current = {
        x: p.x,
        y: p.y,
        layerId: hit.id,
        lx: hit.x,
        ly: hit.y,
      }
      return
    }

    if (tool === 'brush' || tool === 'eraser') {
      doc.snapshot()
      drawing.current = true
      lastPoint.current = p
      drawSegment(p, { x: p.x + 0.01, y: p.y }, tool === 'eraser')
      render()
    } else if (tool === 'fill') {
      doc.snapshot()
      floodFill(p.x, p.y)
      render()
    } else if (tool === 'text') {
      const value = textValue.trim()
      if (!value) {
        setNotice('Type the text in the toolbar first, then click the canvas.')
        return
      }
      setNotice('')
      doc.addTextLayer(value, p.x, p.y, paintStyle.color, brushSize * 3)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (panning.current) {
      const display = displayRef.current!
      const rect = display.getBoundingClientRect()
      const scale = display.width / rect.width
      setOffset(
        clampOffset(
          {
            x: panStart.current.ox + (e.clientX - panStart.current.x) * scale,
            y: panStart.current.oy + (e.clientY - panStart.current.y) * scale,
          },
          zoom,
        ),
      )
      return
    }

    if (rotateStart.current) {
      const r = rotateStart.current
      const p = toCanvasCoords(e)
      const angle = Math.atan2(p.y - r.centre.y, p.x - r.centre.x)
      doc.updateLayer(r.layerId, {
        rotation: r.rotation0 + (angle - r.pointerAngle),
      })
      return
    }

    if (resizeStart.current) {
      // Uniform scale about the opposite corner. The pointer offset is taken
      // back into the layer's frame so this behaves the same at any rotation.
      const r = resizeStart.current
      const p = toCanvasCoords(e)
      const v = rotateVector(
        { x: p.x - r.fixed.x, y: p.y - r.fixed.y },
        -r.rotation,
      )
      const minFactor = 8 / Math.max(r.bounds.w, r.bounds.h)
      const f = Math.max(
        minFactor,
        Math.min(20, Math.max(Math.abs(v.x) / r.bounds.w, Math.abs(v.y) / r.bounds.h)),
      )
      const w = r.bounds.w * f
      const h = r.bounds.h * f
      // Place the new centre so the anchor corner lands back on `fixed`.
      const offsetFromCentre = rotateVector(
        { x: (r.sign.x * w) / 2, y: (r.sign.y * h) / 2 },
        r.rotation,
      )
      const centre = {
        x: r.fixed.x - offsetFromCentre.x,
        y: r.fixed.y - offsetFromCentre.y,
      }
      const layer = doc.layers.find((l) => l.id === r.layerId)
      if (!layer) return
      doc.updateLayer(r.layerId, {
        x: centre.x - w / 2,
        y: centre.y - h / 2,
        ...(layer.kind === 'image'
          ? { scale: r.scale0 * f }
          : { fontSize: r.fontSize0 * f }),
      })
      return
    }

    if (dragStart.current) {
      const d = dragStart.current
      const p = toCanvasCoords(e)
      doc.updateLayer(d.layerId, {
        x: d.lx + (p.x - d.x),
        y: d.ly + (p.y - d.y),
      })
      return
    }

    if (!drawing.current || !lastPoint.current) return
    const p = toCanvasCoords(e)
    drawSegment(lastPoint.current, p, tool === 'eraser')
    lastPoint.current = p
    render()
  }

  const onPointerUp = () => {
    drawing.current = false
    lastPoint.current = null
    panning.current = false
    dragStart.current = null
    resizeStart.current = null
    rotateStart.current = null
  }

  const addImage = (file: File) => {
    const img = new Image()
    img.onload = () => {
      // The object URL is intentionally not revoked: the layer keeps this
      // element and the browser may need to re-decode it on later draws.
      doc.addImageLayer(img, file.name)
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      setNotice('That file could not be read as an image.')
    }
    img.src = URL.createObjectURL(file)
  }

  const importTemplate = () => {
    const img = templateImgRef.current
    if (!img) return
    // Contain, not cover: the Cybertruck template is 1024x768 and covering
    // would crop it.
    doc.addImageLayer(img, 'Template', 'contain')
  }

  const cyclePaintStyle = () =>
    setPaintStyle((s) => {
      const kind = NEXT_STYLE[s.kind]
      if (kind === 'gradient')
        return { ...s, kind, color2: s.color2 || '#111827' }
      if (kind === 'pattern') return { ...s, kind }
      return { ...s, kind }
    })

  const swatchUrl = useMemo(() => swatchDataUrl(paintStyle), [paintStyle])

  // Size as a share of the wrap, which reads the same for images and text.
  const sizePct = selectedBounds ? (selectedBounds.w / canvasSize) * 100 : 100
  const rotationDeg = selected
    ? Math.round((((rotationOf(selected) % TAU) + TAU) % TAU) * (180 / Math.PI)) %
      360
    : 0
  const applySizePct = (pct: number) => {
    if (!selected || !isResizable(selected) || !selectedBounds) return
    const f = ((pct / 100) * canvasSize) / selectedBounds.w
    if (!isFinite(f) || f <= 0) return
    doc.updateLayer(
      selected.id,
      selected.kind === 'image'
        ? { scale: selected.scale * f }
        : { fontSize: selected.fontSize * f },
    )
  }

  const tools: [Tool, string, string, IconName][] = [
    ['brush', 'Brush', 'Paint on the Paint layer', 'brush'],
    ['eraser', 'Eraser', 'Erase on the Paint layer', 'eraser'],
    ['fill', 'Fill', 'Flood fill what you see, onto the Paint layer', 'fill'],
    ['text', 'Text', 'Place text from the toolbar field as a new layer', 'text'],
    ['move', 'Move', 'Select, drag and resize a layer', 'move'],
    ['pan', 'Pan', 'Drag the zoomed view (needs zoom above 100%)', 'pan'],
  ]

  return (
    <div className="editor">
      <div className="toolbar">
        <div className="tool-group">
          {tools.map(([t, label, title, icon]) => (
            <button
              key={t}
              className={'tool' + (tool === t ? ' active' : '')}
              title={title}
              disabled={t === 'pan' && zoom <= 1}
              onClick={() => setTool(t)}
            >
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </div>
        <div className="tool-group">
          <button
            className={'tool' + (iconsOpen ? ' active' : '')}
            title="Toggle the stickers drawer"
            aria-expanded={iconsOpen}
            aria-controls="icon-drawer"
            onClick={() => setIconsOpen((o) => !o)}
          >
            <Icon name="smiley" />
            Icons
          </button>
        </div>
        {tool === 'text' && (
          <div className="tool-group">
            <input
              className="text-input"
              type="text"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="Type text, then click the canvas"
              aria-label="Text to place"
            />
          </div>
        )}
        {tool === 'move' && isResizable(selected) && (
          <div className="tool-group">
            <label className="slider-label">
              Scale
              <input
                type="range"
                min={5}
                max={400}
                step={1}
                value={Math.round(sizePct)}
                onPointerDown={() => doc.snapshot()}
                onChange={(e) => applySizePct(+e.target.value)}
              />
              <span className="slider-value">{Math.round(sizePct)}%</span>
            </label>
            <label className="slider-label">
              Rotate
              <input
                type="range"
                min={0}
                max={359}
                step={1}
                value={rotationDeg}
                onPointerDown={() => doc.snapshot()}
                onChange={(e) =>
                  selected &&
                  doc.updateLayer(selected.id, {
                    rotation: (+e.target.value * Math.PI) / 180,
                  })
                }
              />
              <span className="slider-value">{rotationDeg}&deg;</span>
            </label>
          </div>
        )}
        <div className="tool-group">
          <input
            type="color"
            value={paintStyle.color}
            onChange={(e) => setPaintStyle((s) => ({ ...s, color: e.target.value }))}
            title="Color"
          />
          {paintStyle.kind === 'gradient' && (
            <input
              type="color"
              value={paintStyle.color2}
              onChange={(e) =>
                setPaintStyle((s) => ({ ...s, color2: e.target.value }))
              }
              title="Gradient end color"
            />
          )}
          {paintStyle.kind === 'pattern' && (
            <select
              className="style-select"
              value={paintStyle.pattern}
              onChange={(e) =>
                setPaintStyle((s) => ({ ...s, pattern: e.target.value as PaintStyle['pattern'] }))
              }
              title="Pattern"
            >
              {PATTERN_OPTIONS.map((o) => (
                <option key={o.kind} value={o.kind}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {paintStyle.kind !== 'solid' && (
            <label className="slider-label" title="Gradient angle">
              Angle
              <input
                className="num-input"
                type="number"
                min={0}
                max={359}
                value={paintStyle.angle}
                onChange={(e) =>
                  setPaintStyle((s) => ({
                    ...s,
                    angle: Math.max(0, Math.min(359, +e.target.value || 0)),
                  }))
                }
              />
            </label>
          )}
          <button
            className={
              'tool style-btn' + (paintStyle.kind !== 'solid' ? ' active' : '')
            }
            onClick={cyclePaintStyle}
            title={'Paint style: ' + STYLE_LABEL[paintStyle.kind] + ' (click to change)'}
          >
            <img className="style-swatch" src={swatchUrl} alt="" />
            {STYLE_LABEL[paintStyle.kind]}
          </button>
          <label className="slider-label">
            Size
            <input
              type="range"
              min={2}
              max={60}
              value={brushSize}
              onChange={(e) => setBrushSize(+e.target.value)}
            />
            <span className="slider-value">{brushSize}</span>
          </label>
        </div>
        <div className="tool-group">
          <button className="tool" onClick={doc.undo} disabled={!doc.canUndo}>
            <Icon name="undo" />
            Undo
          </button>
          <button className="tool" onClick={doc.redo} disabled={!doc.canRedo}>
            <Icon name="redo" />
            Redo
          </button>
        </div>
        <div className="tool-group">
          <label
            className="check"
            title="Shade the parts of the square that the wrap does not cover"
          >
            <input
              type="checkbox"
              checked={dimNonWrap && templateStatus === 'ready'}
              disabled={templateStatus !== 'ready'}
              onChange={(e) => setDimNonWrap(e.target.checked)}
            />
            Dim non-wrap areas
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={showGuides}
              onChange={(e) => setShowGuides(e.target.checked)}
            />
            Guides
          </label>
          <label
            className="check"
            title="Mirror brush and fill across the vertical centreline"
          >
            <input
              type="checkbox"
              checked={mirror}
              onChange={(e) => setMirror(e.target.checked)}
            />
            <Icon name="mirror" />
            Mirror
          </label>
        </div>
        <div className="tool-group">
          <button
            className="tool icon-only"
            title="Zoom in"
            onClick={() => setZoom((z) => Math.min(6, z * 1.25))}
          >
            <Icon name="zoomIn" />
          </button>
          <button
            className="tool icon-only"
            title="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}
          >
            <Icon name="zoomOut" />
          </button>
          <button
            className="tool"
            title="Reset zoom"
            onClick={() => {
              setZoom(1)
              setOffset({ x: 0, y: 0 })
            }}
          >
            {Math.round(zoom * 100)}%
          </button>
        </div>
        <div className="tool-group">
          <button
            className="tool"
            onClick={importTemplate}
            disabled={templateStatus !== 'ready'}
          >
            <Icon name="template" />
            Import template
          </button>
          <label className="tool file-tool">
            <Icon name="image" />
            Add image
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) addImage(f)
                e.target.value = ''
              }}
            />
          </label>
          <button className="tool danger" onClick={doc.clearAll}>
            <Icon name="trash" />
            Clear
          </button>
        </div>
      </div>
      {notice && (
        <div className="notice">
          {notice}
          <button className="link" onClick={() => setNotice('')}>
            dismiss
          </button>
        </div>
      )}
      <div className="canvas-wrap">
        <canvas
          ref={displayRef}
          width={DISPLAY_SIZE}
          height={DISPLAY_SIZE}
          className={'wrap-canvas tool-' + tool}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        {templateStatus === 'loading' && (
          <div className="canvas-loading">Loading template...</div>
        )}
        {templateStatus === 'error' && (
          <div className="canvas-loading canvas-error">
            Template could not be loaded from raw.githubusercontent.com. You can
            still design and export a wrap, but the overlay and Import template
            are unavailable.
          </div>
        )}
        <div
          id="icon-drawer"
          className="icon-drawer-anchor"
          aria-hidden={!iconsOpen}
        >
          <IconPicker
            doc={doc}
            open={iconsOpen}
            onClose={() => setIconsOpen(false)}
          />
        </div>
      </div>
    </div>
  )
}
