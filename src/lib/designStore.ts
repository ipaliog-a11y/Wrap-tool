// Design persistence in localStorage. One key per vehicle, holding a small
// index plus one entry per wrap name. Everything is wrapped in try/catch:
// storage may be unavailable (private mode, sandboxed embeds) or full, and a
// failed save must never break the editor.

import { Layer } from './layers'

export interface SavedPaintLayer {
  name: string
  visible: boolean
  x: number
  y: number
  png: string
}
export interface SavedImageLayer {
  name: string
  visible: boolean
  x: number
  y: number
  scale: number
  rotation: number
  /** Data URL, so the image survives a page reload. */
  url: string
}
export interface SavedTextLayer {
  name: string
  visible: boolean
  x: number
  y: number
  text: string
  color: string
  fontSize: number
  rotation: number
}
export type SavedLayer = SavedPaintLayer | SavedImageLayer | SavedTextLayer

export interface SavedDesign {
  name: string
  savedAt: number
  layers: SavedLayer[]
}

export interface DesignMeta {
  name: string
  vehicleId: string
  vehicleName: string
  savedAt: number
}

const INDEX_KEY = 'wrap-studio:designs'
const MAX_DESIGNS = 24
const MAX_PNG_PX = 512

const KEY_RE = /^wrap-studio:design:.+:[A-Za-z0-9_\- ]+$/
const sanitizeName = (name: string) =>
  name.replace(/[^A-Za-z0-9_\- ]/g, '_').slice(0, 30).trim() || 'design'

export const designKey = (vehicleId: string, name: string) =>
  `wrap-studio:design:${vehicleId}:${sanitizeName(name)}`

/** QuotaExceededError surfaces with different names/messages per engine. */
function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22 ||
      e.code === 1014)
  )
}

function readIndex(): DesignMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (m): m is DesignMeta =>
        !!m &&
        typeof m.name === 'string' &&
        typeof m.vehicleId === 'string' &&
        typeof m.savedAt === 'number',
    )
  } catch {
    return []
  }
}

function writeIndex(list: DesignMeta[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list))
  } catch (e) {
    if (isQuotaError(e)) {
      // Free up room for the design that actually triggered the save.
      for (const m of [...list].sort((a, b) => a.savedAt - b.savedAt)) {
        try {
          localStorage.removeItem(designKey(m.vehicleId, m.name))
        } catch {
          // ignore
        }
      }
      try {
        localStorage.setItem(INDEX_KEY, JSON.stringify(list))
      } catch {
        // Storage is unusable; the caller has already warned the user.
      }
    }
  }
}

export function listDesigns(): DesignMeta[] {
  const wanted = new Set<string>()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && KEY_RE.test(key)) wanted.add(key)
    }
  } catch {
    return []
  }
  const metas: DesignMeta[] = []
  for (const key of wanted) {
    let m: DesignMeta | null = null
    try {
      const d = JSON.parse(localStorage.getItem(key) ?? 'null')
      if (
        d &&
        typeof d.name === 'string' &&
        typeof d.savedAt === 'number' &&
        Array.isArray(d.layers)
      ) {
        const idx = key.lastIndexOf(':')
        m = {
          name: d.name,
          vehicleId: key.slice('wrap-studio:design:'.length, idx),
          vehicleName:
            typeof d.vehicleName === 'string' ? d.vehicleName : '',
          savedAt: d.savedAt,
        }
      }
    } catch {
      // Corrupt entry; skipped, and cleaned up below.
      try {
        localStorage.removeItem(key)
      } catch {
        // ignore
      }
      continue
    }
    if (m) metas.push(m)
  }
  // Drop index rows whose design key is gone.
  const kept = readIndex().filter((m) =>
    wanted.has(designKey(m.vehicleId, m.name)),
  )
  writeIndex(kept)
  return metas.sort((a, b) => b.savedAt - a.savedAt)
}

export function getDesign(
  vehicleId: string,
  name: string,
): SavedDesign | null {
  try {
    const d = JSON.parse(localStorage.getItem(designKey(vehicleId, name)) ?? 'null')
    if (
      d &&
      typeof d.name === 'string' &&
      typeof d.savedAt === 'number' &&
      Array.isArray(d.layers)
    )
      return d as SavedDesign
  } catch {
    // ignore
  }
  return null
}

/**
 * Encode a paint layer as a data URL, downscaling first if it is bigger than
 * maxPx on a side. Synchronous: reads the layer canvas directly, no image
 * decode involved.
 */
function encodePng(src: HTMLCanvasElement, maxPx: number): string {
  try {
    const maxSide = Math.max(src.width, src.height)
    if (maxSide <= maxPx) return src.toDataURL('image/png')
    const scale = maxPx / maxSide
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(src.width * scale))
    c.height = Math.max(1, Math.round(src.height * scale))
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(src, 0, 0, c.width, c.height)
    return c.toDataURL('image/png')
  } catch {
    try {
      return src.toDataURL('image/png')
    } catch {
      return ''
    }
  }
}

function serializeLayers(layers: Layer[], maxPngPx: number): SavedLayer[] {
  return layers.map((l): SavedLayer => {
    if (l.kind === 'paint') {
      return {
        name: l.name,
        visible: l.visible,
        x: l.x,
        y: l.y,
        png: encodePng(l.canvas, maxPngPx),
      }
    }
    if (l.kind === 'image') {
      return {
        name: l.name,
        visible: l.visible,
        x: l.x,
        y: l.y,
        scale: l.scale,
        rotation: l.rotation,
        url: l.source.src,
      }
    }
    return {
      name: l.name,
      visible: l.visible,
      x: l.x,
      y: l.y,
      text: l.text,
      color: l.color,
      fontSize: l.fontSize,
      rotation: l.rotation,
    }
  })
}

/**
 * Persists the design. Returns true on success; false when the write failed
 * (quota or otherwise), after the caller-visible warning state is set by the
 * caller via `onQuota`.
 */
export function saveDesign(
  vehicleId: string,
  vehicleName: string,
  name: string,
  layers: Layer[],
  onQuota?: () => void,
): boolean {
  let maxPngPx = MAX_PNG_PX
  for (let attempt = 0; attempt < 3; attempt++) {
    const design: SavedDesign = {
      name,
      savedAt: Date.now(),
      layers: serializeLayers(layers, maxPngPx),
    }
    const payload = JSON.stringify({
      ...design,
      vehicleId,
      vehicleName,
    })
    const key = designKey(vehicleId, name)
    try {
      localStorage.setItem(key, payload)
      const meta: DesignMeta = { name, vehicleId, vehicleName, savedAt: design.savedAt }
      const list = [
        meta,
        ...readIndex().filter((m) => !(m.name === name && m.vehicleId === vehicleId)),
      ]
      // Beyond the cap, drop the oldest designs (keys included), not just
      // their index rows - listDesigns scans the keys, so both must go.
      for (const m of list.slice(MAX_DESIGNS)) {
        try {
          localStorage.removeItem(designKey(m.vehicleId, m.name))
        } catch {
          // ignore
        }
      }
      writeIndex(list.slice(0, MAX_DESIGNS))
      return true
    } catch (e) {
      if (!isQuotaError(e)) {
        onQuota?.()
        return false
      }
      onQuota?.()
      // Retry with a smaller paint resolution to squeeze under the cap.
      maxPngPx = Math.max(128, Math.floor(maxPngPx / 2))
      // Drop the oldest saved designs to make room.
      const list = readIndex().sort((a, b) => b.savedAt - a.savedAt)
      const overflow = list.length - (MAX_DESIGNS - 1)
      for (let i = 0; i < overflow; i++) {
        const m = list[i]
        if (!m || m.name === name && m.vehicleId === vehicleId) continue
        try {
          localStorage.removeItem(designKey(m.vehicleId, m.name))
        } catch {
          // ignore
        }
      }
    }
  }
  return false
}

export function deleteDesign(vehicleId: string, name: string): void {
  try {
    localStorage.removeItem(designKey(vehicleId, name))
  } catch {
    // ignore
  }
  writeIndex(
    readIndex().filter(
      (m) => !(m.name === name && m.vehicleId === vehicleId),
    ),
  )
}
