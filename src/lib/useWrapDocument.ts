import { useCallback, useRef, useState } from 'react'
import {
  compositeToCanvas,
  containFit,
  coverFit,
  createPaintLayer,
  ImageLayer,
  Layer,
  PaintLayer,
  TextLayer,
} from './layers'

const HISTORY_MAX_STEPS = 30
const HISTORY_MAX_BYTES = 64 * 1024 * 1024

/**
 * A history entry. Image and text layers are immutable value objects and are
 * stored by reference, so they cost nothing. Only paint pixels are heavy, and
 * those are shared between entries until a paint operation actually changes
 * them - so move, resize, reorder and visibility entries are effectively free.
 */
type SnapLayer =
  | {
      kind: 'paint'
      id: number
      name: string
      visible: boolean
      x: number
      y: number
      image: ImageData
    }
  | ImageLayer
  | TextLayer

interface Snapshot {
  layers: SnapLayer[]
  selectedId: number | null
}

/** Counts each ImageData once, however many entries reference it. */
function historyBytes(entries: Snapshot[]): number {
  const seen = new Set<ImageData>()
  let total = 0
  for (const entry of entries) {
    for (const layer of entry.layers) {
      if (layer.kind !== 'paint' || seen.has(layer.image)) continue
      seen.add(layer.image)
      total += layer.image.data.byteLength
    }
  }
  return total
}

export function trimHistory(entries: Snapshot[]): Snapshot[] {
  let out =
    entries.length > HISTORY_MAX_STEPS
      ? entries.slice(entries.length - HISTORY_MAX_STEPS)
      : entries
  while (out.length > 1 && historyBytes(out) > HISTORY_MAX_BYTES) {
    out = out.slice(1)
  }
  return out
}

export type LayerPatch = Partial<Omit<ImageLayer, 'kind'>> &
  Partial<Omit<TextLayer, 'kind'>> &
  Partial<Omit<PaintLayer, 'kind'>>

export interface WrapDocument {
  layers: Layer[]
  selectedId: number | null
  selected: Layer | null
  /** Brush target: the selected paint layer, else the topmost one. */
  activePaintLayer: PaintLayer
  canvasSize: number
  canUndo: boolean
  canRedo: boolean
  select(id: number | null): void
  /** Capture the current state. Call before a mutation, once per gesture. */
  snapshot(): void
  /** 2D context for the paint layer. Invalidates the cached pixel snapshot. */
  getPaintContext(): CanvasRenderingContext2D
  updateLayer(id: number, patch: LayerPatch): void
  addPaintLayer(): void
  addImageLayer(
    source: HTMLImageElement,
    name: string,
    fit?: 'cover' | 'contain',
  ): void
  addTextLayer(
    text: string,
    x: number,
    y: number,
    color: string,
    fontSize: number,
  ): void
  removeLayer(id: number): void
  toggleVisible(id: number): void
  moveInStack(id: number, delta: number): void
  clearAll(): void
  undo(): void
  redo(): void
  /** Restores a deserialized design, replacing the current content. */
  loadDesign(layers: Layer[], selectedId: number | null): void
  /** Bumped by loadDesign/clearAll so callers can reset transient UI state. */
  contentTick: number
  /** Cheap pixel-write notification, used to schedule design autosaves. */
  notePaint(): void
  exportCanvas(): HTMLCanvasElement
}

export function useWrapDocument(canvasSize: number): WrapDocument {
  const nextId = useRef(1)
  const [layers, setLayers] = useState<Layer[]>(() => [
    createPaintLayer(nextId.current++, canvasSize),
  ])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [undoStack, setUndoStack] = useState<Snapshot[]>([])
  const [redoStack, setRedoStack] = useState<Snapshot[]>([])
  // Pixel snapshot per paint layer, valid until getPaintContext hands the
  // canvas out for writing.
  const paintCache = useRef(new Map<number, ImageData>())
  const [contentTick, setContentTick] = useState(0)

  const selected = layers.find((l) => l.id === selectedId) ?? null
  const paintLayers = layers.filter((l): l is PaintLayer => l.kind === 'paint')
  // Painting follows the selection when it is a paint layer, so adding one and
  // drawing does the obvious thing; otherwise it falls back to the topmost.
  const activePaintLayer =
    selected?.kind === 'paint'
      ? selected
      : paintLayers[paintLayers.length - 1]

  const capture = useCallback(
    (ls: Layer[], sel: number | null): Snapshot => ({
      selectedId: sel,
      layers: ls.map((l) => {
        if (l.kind !== 'paint') return l
        let image = paintCache.current.get(l.id)
        if (!image) {
          image = l.canvas
            .getContext('2d')!
            .getImageData(0, 0, l.canvas.width, l.canvas.height)
          paintCache.current.set(l.id, image)
        }
        return {
          kind: 'paint',
          id: l.id,
          name: l.name,
          visible: l.visible,
          x: l.x,
          y: l.y,
          image,
        }
      }),
    }),
    [],
  )

  const restore = useCallback((snap: Snapshot) => {
    paintCache.current.clear()
    setLayers((prev) =>
      snap.layers.map((sl) => {
        if (sl.kind !== 'paint') return sl
        const existing = prev.find(
          (l): l is PaintLayer => l.id === sl.id && l.kind === 'paint',
        )
        const canvas = existing?.canvas ?? document.createElement('canvas')
        canvas.width = sl.image.width
        canvas.height = sl.image.height
        canvas.getContext('2d')!.putImageData(sl.image, 0, 0)
        // The canvas now matches this ImageData, so consecutive undos stay cheap.
        paintCache.current.set(sl.id, sl.image)
        return {
          kind: 'paint',
          id: sl.id,
          name: sl.name,
          visible: sl.visible,
          x: sl.x,
          y: sl.y,
          canvas,
        }
      }),
    )
    setSelectedId(snap.selectedId)
  }, [])

  // Entries are built before the updaters run, keeping the updaters pure.
  const snapshot = useCallback(() => {
    const entry = capture(layers, selectedId)
    setUndoStack((u) => trimHistory([...u, entry]))
    setRedoStack([])
  }, [capture, layers, selectedId])

  const getPaintContext = useCallback(() => {
    paintCache.current.delete(activePaintLayer.id)
    return activePaintLayer.canvas.getContext('2d')!
  }, [activePaintLayer])

  const addPaintLayer = useCallback(() => {
    snapshot()
    const id = nextId.current++
    // Sits above the current selection so a new layer is immediately on top of
    // whatever you were looking at.
    const at = selectedId
      ? layers.findIndex((l) => l.id === selectedId) + 1
      : layers.length
    const layer = createPaintLayer(
      id,
      canvasSize,
      'Paint ' + (layers.filter((l) => l.kind === 'paint').length + 1),
    )
    setLayers((ls) => {
      const next = [...ls]
      next.splice(Math.min(at, next.length), 0, layer)
      return next
    })
    setSelectedId(id)
  }, [canvasSize, layers, selectedId, snapshot])

  const updateLayer = useCallback((id: number, patch: LayerPatch) => {
    setLayers((ls) =>
      ls.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)),
    )
  }, [])

  const addImageLayer = useCallback(
    (source: HTMLImageElement, name: string, mode: 'cover' | 'contain' = 'cover') => {
      snapshot()
      const naturalW = source.naturalWidth || source.width
      const naturalH = source.naturalHeight || source.height
      // Photos fill the square; the template must stay whole and undistorted.
      const fit =
        mode === 'contain'
          ? containFit(naturalW, naturalH, canvasSize)
          : coverFit(naturalW, naturalH, canvasSize)
      const id = nextId.current++
      setLayers((ls) => [
        ...ls,
        {
          kind: 'image',
          id,
          name,
          visible: true,
          x: fit.x,
          y: fit.y,
          scale: fit.scale,
          rotation: 0,
          source,
          naturalW,
          naturalH,
        },
      ])
      setSelectedId(id)
    },
    [canvasSize, snapshot],
  )

  const addTextLayer = useCallback(
    (text: string, x: number, y: number, color: string, fontSize: number) => {
      snapshot()
      const id = nextId.current++
      setLayers((ls) => [
        ...ls,
        {
          kind: 'text',
          id,
          name: text.length > 18 ? text.slice(0, 18) + '...' : text,
          visible: true,
          x,
          y,
          text,
          color,
          fontSize,
          rotation: 0,
        },
      ])
      setSelectedId(id)
    },
    [snapshot],
  )

  const removeLayer = useCallback(
    (id: number) => {
      // Something has to remain as the brush target, so the last paint layer
      // cannot be removed.
      const target = layers.find((l) => l.id === id)
      if (
        target?.kind === 'paint' &&
        layers.filter((l) => l.kind === 'paint').length <= 1
      )
        return
      snapshot()
      setLayers((ls) => ls.filter((l) => l.id !== id))
      setSelectedId((s) => (s === id ? null : s))
    },
    [layers, snapshot],
  )

  const toggleVisible = useCallback(
    (id: number) => {
      snapshot()
      setLayers((ls) =>
        ls.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
      )
    },
    [snapshot],
  )

  const moveInStack = useCallback(
    (id: number, delta: number) => {
      const from = layers.findIndex((l) => l.id === id)
      const to = from + delta
      if (from < 0 || to < 0 || to >= layers.length) return
      snapshot()
      setLayers((ls) => {
        const next = [...ls]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
      })
    },
    [layers, snapshot],
  )

  const clearAll = useCallback(() => {
    snapshot()
    paintCache.current.clear()
    setLayers([createPaintLayer(nextId.current++, canvasSize)])
    setSelectedId(null)
    setContentTick((t) => t + 1)
  }, [canvasSize, snapshot])

  const loadDesign = useCallback(
    (ls: Layer[], sel: number | null) => {
      // History is kept: a caller that snapshotted before loading can undo
      // back to the previous design, exactly like any other mutation.
      paintCache.current.clear()
      setLayers(ls)
      setSelectedId(sel)
      setContentTick((t) => t + 1)
    },
    [],
  )

  const notePaint = useCallback(() => {
    paintCache.current.delete(activePaintLayer.id)
  }, [activePaintLayer])

  const undo = useCallback(() => {
    if (undoStack.length === 0) return
    const current = capture(layers, selectedId)
    restore(undoStack[undoStack.length - 1])
    setUndoStack((u) => u.slice(0, -1))
    setRedoStack((r) => trimHistory([...r, current]))
  }, [capture, layers, restore, selectedId, undoStack])

  const redo = useCallback(() => {
    if (redoStack.length === 0) return
    const current = capture(layers, selectedId)
    restore(redoStack[redoStack.length - 1])
    setRedoStack((r) => r.slice(0, -1))
    setUndoStack((u) => trimHistory([...u, current]))
  }, [capture, layers, redoStack, restore, selectedId])

  const exportCanvas = useCallback(
    () => compositeToCanvas(layers, canvasSize),
    [canvasSize, layers],
  )

  return {
    layers,
    selectedId,
    selected,
    activePaintLayer,
    canvasSize,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    select: setSelectedId,
    snapshot,
    getPaintContext,
    updateLayer,
    addPaintLayer,
    addImageLayer,
    addTextLayer,
    removeLayer,
    toggleVisible,
    moveInStack,
    clearAll,
    undo,
    redo,
    loadDesign,
    contentTick,
    notePaint,
    exportCanvas,
  }
}
