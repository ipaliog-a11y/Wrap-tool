// Shared paint styles: solid color, linear gradient and tiled patterns.
// Gradients and patterns are built in the layer's own canvas space, so they
// stay put while the view pans or zooms.

export type PaintStyleKind = 'solid' | 'gradient' | 'pattern'

export type PatternKind =
  | 'checkerboard'
  | 'stripes'
  | 'dots'
  | 'zigzag'
  | 'weave'

export interface PaintStyle {
  kind: PaintStyleKind
  /** Base colour (solid fill / pattern tint). */
  color: string
  /** Gradient end colour. */
  color2: string
  /** Gradient direction in degrees, 0 = to the right. */
  angle: number
  pattern: PatternKind
}

export const PATTERN_OPTIONS: { kind: PatternKind; label: string }[] = [
  { kind: 'checkerboard', label: 'Checkerboard' },
  { kind: 'stripes', label: 'Diagonal stripes' },
  { kind: 'dots', label: 'Dots' },
  { kind: 'zigzag', label: 'Zigzag' },
  { kind: 'weave', label: 'Carbon weave' },
]

export const DEFAULT_PAINT_STYLE: PaintStyle = {
  kind: 'solid',
  color: '#e82127',
  color2: '#111827',
  angle: 90,
  pattern: 'checkerboard',
}

export type CanvasStyle = string | CanvasGradient | CanvasPattern

const TILE = 24

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

/** '#rrggbb' with each channel scaled by amt (negative darkens). */
export function shadeColor(hex: string, amt: number): string {
  const fc = parseInt(hex.replace('#', ''), 16)
  if (Number.isNaN(fc) || hex.length !== 7) return hex
  const r = clampByte(((fc >> 16) & 255) * (1 + amt))
  const g = clampByte(((fc >> 8) & 255) * (1 + amt))
  const b = clampByte((fc & 255) * (1 + amt))
  return (
    '#' +
    [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
  )
}

/**
 * Paint one 24x24 tile. The tile repeats seamlessly in both axes, so the
 * pattern holds up at any layer size.
 */
export function drawPatternTile(
  ctx: CanvasRenderingContext2D,
  pattern: PatternKind,
  color: string,
): void {
  const light = shadeColor(color, 0.35)
  const dark = shadeColor(color, -0.55)
  ctx.clearRect(0, 0, TILE, TILE)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, TILE, TILE)
  switch (pattern) {
    case 'checkerboard':
      ctx.fillStyle = light
      ctx.fillRect(0, 0, 12, 12)
      ctx.fillRect(12, 12, 12, 12)
      break
    case 'stripes': {
      // 45-degree stripes: lines x - y = c repeat seamlessly because the
      // spacing (12) divides the tile (24).
      ctx.strokeStyle = light
      ctx.lineWidth = 6
      ctx.lineCap = 'butt'
      for (const c of [-12, 0, 12, 24]) {
        ctx.beginPath()
        ctx.moveTo(c, 24)
        ctx.lineTo(c + 24, 0)
        ctx.stroke()
      }
      break
    }
    case 'dots':
      ctx.fillStyle = light
      for (const [x, y] of [
        [6, 6],
        [18, 18],
        [18, 6],
        [6, 18],
      ] as const) {
        ctx.beginPath()
        ctx.arc(x, y, 3.2, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'zigzag':
      ctx.strokeStyle = light
      ctx.lineWidth = 3
      ctx.lineJoin = 'miter'
      ctx.lineCap = 'butt'
      ctx.beginPath()
      ctx.moveTo(0, 18)
      ctx.lineTo(6, 12)
      ctx.lineTo(12, 18)
      ctx.lineTo(18, 12)
      ctx.lineTo(24, 18)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, 6)
      ctx.lineTo(6, 0)
      ctx.lineTo(12, 6)
      ctx.lineTo(18, 0)
      ctx.lineTo(24, 6)
      ctx.stroke()
      break
    case 'weave':
      // Twill-ish weave: diagonal rib pairs in two tones, same seam rule as
      // the stripes.
      ctx.strokeStyle = dark
      ctx.lineWidth = 4
      ctx.lineCap = 'butt'
      for (const c of [-12, 0, 12, 24]) {
        ctx.beginPath()
        ctx.moveTo(c, 24)
        ctx.lineTo(c + 24, 0)
        ctx.stroke()
      }
      ctx.strokeStyle = light
      for (const c of [-6, 6, 18]) {
        ctx.beginPath()
        ctx.moveTo(c, 24)
        ctx.lineTo(c + 24, 0)
        ctx.stroke()
      }
      break
  }
}

function buildTile(pattern: PatternKind, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = TILE
  c.height = TILE
  drawPatternTile(c.getContext('2d')!, pattern, color)
  return c
}

/** The actual brush/fill style for this layer's context. */
export function paintStyleFor(style: PaintStyle, ctx: CanvasRenderingContext2D): CanvasStyle {
  if (style.kind === 'solid') return style.color
  if (style.kind === 'gradient') {
    const a = ((style.angle % 360) + 360) * (Math.PI / 180)
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    const g = ctx.createLinearGradient(
      -dx * ctx.canvas.width,
      -dy * ctx.canvas.height,
      dx * ctx.canvas.width,
      dy * ctx.canvas.height,
    )
    g.addColorStop(0, style.color)
    g.addColorStop(1, style.color2)
    return g
  }
  const tile = buildTile(style.pattern, style.color)
  const p = ctx.createPattern(tile, 'repeat')
  if (!p) return style.color
  return p
}

/** Small swatch (data URL) showing the current style, for the toolbar button. */
export function swatchDataUrl(style: PaintStyle, px = 28): string {
  const c = document.createElement('canvas')
  c.width = px
  c.height = px
  const ctx = c.getContext('2d')!
  ctx.fillStyle = style.kind === 'solid' ? style.color : '#ffffff'
  ctx.fillRect(0, 0, px, px)
  if (style.kind === 'gradient') {
    const a = style.angle * (Math.PI / 180)
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    const g = ctx.createLinearGradient(
      px / 2 - (dx * px) / 2,
      px / 2 - (dy * px) / 2,
      px / 2 + (dx * px) / 2,
      px / 2 + (dy * px) / 2,
    )
    g.addColorStop(0, style.color)
    g.addColorStop(1, style.color2)
    ctx.fillStyle = g
  } else if (style.kind === 'pattern') {
    const tile = buildTile(style.pattern, style.color)
    const p = ctx.createPattern(tile, 'repeat')
    if (p) ctx.fillStyle = p
  }
  ctx.fillRect(0, 0, px, px)
  return c.toDataURL('image/png')
}
