// The document model. Content is kept as layers with their own transforms
// rather than being rasterised into one bitmap on contact, so moving something
// off the edge never destroys it and imported images stay resizable.

// The wrap is an opaque image. This is painted beneath every composite rather
// than living in a layer, so erasing on the lowest layer reveals white instead
// of a checkerboard, and the export can never carry alpha.
export const BASE_COLOR = '#ffffff'

// Emoji families are listed explicitly so icon layers render in colour rather
// than falling back to tofu on systems where the default stack has no glyph.
const FONT_STACK =
  'Inter, system-ui, "Segoe UI Emoji", "Apple Color Emoji", ' +
  '"Noto Color Emoji", sans-serif'
export const fontFor = (size: number) => 'bold ' + size + 'px ' + FONT_STACK

export interface LayerBase {
  id: number
  name: string
  visible: boolean
  /** Position of the layer's top-left corner, in document coordinates. */
  x: number
  y: number
}

/** Raster target for brush/eraser/fill. Sized to the document, offset by x/y. */
export interface PaintLayer extends LayerBase {
  kind: 'paint'
  canvas: HTMLCanvasElement
}

export interface ImageLayer extends LayerBase {
  kind: 'image'
  source: HTMLImageElement
  naturalW: number
  naturalH: number
  scale: number
  /** Radians, applied about the layer's centre. */
  rotation: number
}

export interface TextLayer extends LayerBase {
  kind: 'text'
  text: string
  color: string
  fontSize: number
  /** Radians, applied about the layer's centre. */
  rotation: number
}

export type Layer = PaintLayer | ImageLayer | TextLayer
/** Layers whose size is a transform rather than a bitmap, so they can scale. */
export type ResizableLayer = ImageLayer | TextLayer

export const isResizable = (l: Layer | null): l is ResizableLayer =>
  l !== null && (l.kind === 'image' || l.kind === 'text')

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

export type MeasureText = (
  text: string,
  fontSize: number,
) => { width: number; height: number }

let domMeasure: MeasureText | null = null
function measureViaDom(): MeasureText {
  if (!domMeasure) {
    const ctx = document.createElement('canvas').getContext('2d')!
    domMeasure = (text, fontSize) => {
      ctx.font = fontFor(fontSize)
      return { width: ctx.measureText(text).width, height: fontSize }
    }
  }
  return domMeasure
}

export function createPaintLayer(
  id: number,
  size: number,
  name = 'Paint',
): PaintLayer {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  // Deliberately left transparent: BASE_COLOR is painted underneath instead, so
  // the eraser can cut through to whatever is below.
  return { kind: 'paint', id, name, visible: true, x: 0, y: 0, canvas }
}

/** Scale and position that make an image cover the square without distortion. */
export function coverFit(
  naturalW: number,
  naturalH: number,
  size: number,
): { x: number; y: number; scale: number } {
  const scale = Math.max(size / naturalW, size / naturalH)
  return {
    x: (size - naturalW * scale) / 2,
    y: (size - naturalH * scale) / 2,
    scale,
  }
}

/** Fit an image entirely inside the square, centred, without distortion. */
export function containFit(
  naturalW: number,
  naturalH: number,
  size: number,
): { x: number; y: number; scale: number } {
  const scale = Math.min(size / naturalW, size / naturalH)
  return {
    x: (size - naturalW * scale) / 2,
    y: (size - naturalH * scale) / 2,
    scale,
  }
}

/** Shade over everything the wrap does not cover. */
export const NON_WRAP_SCRIM = 'rgba(9, 10, 12, 0.66)'

/**
 * Templates are RGBA with the wrap-covered panels as opaque white and
 * everything else fully transparent. Punching the template out of a full
 * scrim therefore leaves exactly the non-wrap area shaded, so paint reads at
 * full strength where it will actually show on the car.
 *
 * Contain rather than cover: the Cybertruck template is 1024x768, and
 * stretching it to the square would misplace every panel edge.
 */
export function buildNonWrapMask(
  template: HTMLImageElement,
  size: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = NON_WRAP_SCRIM
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'destination-out'
  const w = template.naturalWidth || template.width
  const h = template.naturalHeight || template.height
  const fit = containFit(w, h, size)
  ctx.drawImage(template, fit.x, fit.y, w * fit.scale, h * fit.scale)
  return canvas
}

export function layerBounds(
  layer: Layer,
  size: number,
  measure?: MeasureText,
): Bounds {
  switch (layer.kind) {
    case 'paint':
      return { x: layer.x, y: layer.y, w: size, h: size }
    case 'image':
      return {
        x: layer.x,
        y: layer.y,
        w: layer.naturalW * layer.scale,
        h: layer.naturalH * layer.scale,
      }
    case 'text': {
      const m = (measure ?? measureViaDom())(layer.text, layer.fontSize)
      return { x: layer.x, y: layer.y, w: m.width, h: m.height }
    }
  }
}

export const containsPoint = (b: Bounds, p: { x: number; y: number }) =>
  p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h

/** Paint layers do not rotate; everything else carries its own angle. */
export const rotationOf = (l: Layer): number =>
  l.kind === 'paint' ? 0 : l.rotation

export function layerCenter(
  l: Layer,
  size: number,
  measure?: MeasureText,
): { x: number; y: number } {
  const b = layerBounds(l, size, measure)
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

export function rotatePoint(
  p: { x: number; y: number },
  c: { x: number; y: number },
  angle: number,
): { x: number; y: number } {
  if (!angle) return p
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

/** Document point -> the layer's own unrotated frame. */
export function toLocalPoint(
  p: { x: number; y: number },
  l: Layer,
  size: number,
  measure?: MeasureText,
): { x: number; y: number } {
  const rot = rotationOf(l)
  if (!rot) return p
  return rotatePoint(p, layerCenter(l, size, measure), -rot)
}

/** Topmost visible layer under the point, or null. Exact under rotation. */
export function hitTest(
  layers: Layer[],
  p: { x: number; y: number },
  size: number,
  measure?: MeasureText,
): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]
    if (!l.visible) continue
    const local = toLocalPoint(p, l, size, measure)
    if (containsPoint(layerBounds(l, size, measure), local)) return l
  }
  return null
}

export function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  size: number,
): void {
  if (!layer.visible) return
  ctx.save()
  const rot = rotationOf(layer)
  if (rot) {
    const c = layerCenter(layer, size)
    ctx.translate(c.x, c.y)
    ctx.rotate(rot)
    ctx.translate(-c.x, -c.y)
  }
  switch (layer.kind) {
    case 'paint':
      ctx.drawImage(layer.canvas, layer.x, layer.y)
      break
    case 'image':
      ctx.drawImage(
        layer.source,
        layer.x,
        layer.y,
        layer.naturalW * layer.scale,
        layer.naturalH * layer.scale,
      )
      break
    case 'text':
      ctx.font = fontFor(layer.fontSize)
      ctx.fillStyle = layer.color
      // 'top' keeps the draw origin and layerBounds in agreement, which the
      // handles and hit testing depend on.
      ctx.textBaseline = 'top'
      ctx.fillText(layer.text, layer.x, layer.y)
      break
  }
  ctx.restore()
}

/** Text metrics for callers that need to place a glyph before it exists. */
export const measureText: MeasureText = (text, fontSize) =>
  measureViaDom()(text, fontSize)

/**
 * The single definition of what the wrap looks like. Both the on-screen
 * preview and the exporter call this, so they cannot drift apart.
 */
export function compositeLayers(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  size: number,
): void {
  ctx.save()
  ctx.fillStyle = BASE_COLOR
  ctx.fillRect(0, 0, size, size)
  for (const layer of layers) drawLayer(ctx, layer, size)
  ctx.restore()
}

/** Flattened copy of the document at full size, ready to encode. */
export function compositeToCanvas(
  layers: Layer[],
  size: number,
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = size
  out.height = size
  compositeLayers(out.getContext('2d')!, layers, size)
  return out
}
