import { REQUIREMENTS } from '../data/vehicles'

export interface ValidationCheck {
  label: string
  pass: boolean
}
export interface ValidationResult {
  ok: boolean
  checks: ValidationCheck[]
}

// Strip any extension we might emit, so a JPEG fallback name is not judged
// against the filename pattern with its dot still attached.
const EXTENSION_RE = /\.(png|jpe?g)$/i

export function validateFileName(name: string): boolean {
  const base = name.replace(EXTENSION_RE, '')
  return (
    base.length > 0 &&
    base.length <= REQUIREMENTS.fileNameMaxLength &&
    REQUIREMENTS.fileNamePattern.test(base)
  )
}

export function sanitizeBaseName(name: string): string {
  const base = name
    .replace(EXTENSION_RE, '')
    .replace(/[^A-Za-z0-9_\- ]/g, '_')
    .slice(0, REQUIREMENTS.fileNameMaxLength)
    .trim()
  return base || 'wrap'
}

export function sanitizeFileName(name: string): string {
  return sanitizeBaseName(name) + '.png'
}

export function validateImage(
  width: number,
  height: number,
  bytes: number,
  type: string,
  fileName: string,
): ValidationResult {
  const square = width === height
  const inRange =
    width >= REQUIREMENTS.minSize &&
    width <= REQUIREMENTS.maxSize &&
    height >= REQUIREMENTS.minSize &&
    height <= REQUIREMENTS.maxSize
  const checks: ValidationCheck[] = [
    {
      label: 'Format is PNG (got ' + (type || 'unknown') + ')',
      pass: type === REQUIREMENTS.format,
    },
    { label: 'Square image (' + width + 'x' + height + ')', pass: square },
    {
      label:
        'Resolution ' + REQUIREMENTS.minSize + '-' + REQUIREMENTS.maxSize + 'px',
      pass: square && inRange,
    },
    {
      label: 'File size <= 1 MB (' + (bytes / 1024).toFixed(0) + ' KB)',
      pass: bytes <= REQUIREMENTS.maxBytes,
    },
    {
      label: 'Filename valid (letters/numbers/space/- _, max 30)',
      pass: validateFileName(fileName),
    },
  ]
  return { ok: checks.every((c) => c.pass), checks }
}

export interface ExportResult {
  blob: Blob
  width: number
  height: number
  format: string
  bytes: number
  note: string
}

function scaledCanvas(
  src: HTMLCanvasElement,
  size: number,
  whiteBg: boolean,
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const x = c.getContext('2d')!
  if (whiteBg) {
    x.fillStyle = '#ffffff'
    x.fillRect(0, 0, size, size)
  }
  x.drawImage(src, 0, 0, size, size)
  return c
}

function toBlob(c: HTMLCanvasElement, type: string, q?: number): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), type, q),
  )
}

// Try progressively smaller/lossier encodings until the result fits Tesla's 1 MB cap.
export async function exportUnder1MB(
  canvas: HTMLCanvasElement,
): Promise<ExportResult> {
  const max = REQUIREMENTS.maxBytes
  const png = await toBlob(canvas, 'image/png')
  if (png.size <= max)
    return {
      blob: png,
      width: canvas.width,
      height: canvas.height,
      format: 'image/png',
      bytes: png.size,
      note:
        canvas.width +
        'x' +
        canvas.height +
        ' PNG (' +
        Math.round(png.size / 1024) +
        ' KB)',
    }
  const png512 = await toBlob(scaledCanvas(canvas, 512, false), 'image/png')
  if (png512.size <= max)
    return {
      blob: png512,
      width: 512,
      height: 512,
      format: 'image/png',
      bytes: png512.size,
      note: '512x512 PNG (' + Math.round(png512.size / 1024) + ' KB)',
    }
  const c512w = scaledCanvas(canvas, 512, true)
  // Track the format alongside the blob: if no JPEG rung beats the 512 PNG we
  // must not hand back PNG bytes labelled as JPEG.
  let last = { blob: png512, format: 'image/png' }
  for (const q of [0.92, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) {
    const jpg = await toBlob(c512w, 'image/jpeg', q)
    if (jpg.size < last.blob.size) last = { blob: jpg, format: 'image/jpeg' }
    if (jpg.size <= max)
      return {
        blob: jpg,
        width: 512,
        height: 512,
        format: 'image/jpeg',
        bytes: jpg.size,
        note:
          '512x512 JPEG q' + q + ' (' + Math.round(jpg.size / 1024) + ' KB)',
      }
  }
  return {
    blob: last.blob,
    width: 512,
    height: 512,
    format: last.format,
    bytes: last.blob.size,
    note:
      '512x512 ' +
      (last.format === 'image/jpeg' ? 'JPEG' : 'PNG') +
      ' (' +
      Math.round(last.blob.size / 1024) +
      ' KB, OVER 1 MB)',
  }
}
