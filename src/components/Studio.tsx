import { useCallback, useEffect, useRef, useState } from 'react'
import { Vehicle, VEHICLES, templateUrl } from '../data/vehicles'
import { useWrapDocument } from '../lib/useWrapDocument'
import { Layer } from '../lib/layers'
import {
  deleteDesign,
  DesignMeta,
  getDesign,
  listDesigns,
  saveDesign,
  SavedDesign,
} from '../lib/designStore'
import WrapCanvas from './WrapCanvas'
import LayersPanel from './LayersPanel'
import ExportPanel from './ExportPanel'
import { Icon } from './icons'

const CANVAS_SIZE = 1024
const AUTOSAVE_DEBOUNCE_MS = 1000
const QUOTA_NOTICE_MS = 8000

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })
}

/**
 * Deserialize a stored design back into live layers. Image sources are
 * decoded first so layers exist with correct bounds from the first render;
 * an unreadable image layer is dropped rather than breaking the restore.
 */
async function materializeDesign(d: SavedDesign): Promise<Layer[]> {
  const out: Layer[] = []
  let nextId = 1
  for (const sl of d.layers) {
    if ('png' in sl) {
      const id = nextId++
      const canvas = document.createElement('canvas')
      canvas.width = CANVAS_SIZE
      canvas.height = CANVAS_SIZE
      try {
        const img = await loadImage(sl.png)
        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled = true
        // PNG is a snapshot of the paint bitmap, not document space — draw
        // at 0,0 so a stored layer offset is not applied twice.
        ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
      } catch {
        // Empty paint layer rather than aborting the whole restore.
      }
      out.push({
        kind: 'paint',
        id,
        name: sl.name,
        visible: sl.visible,
        x: sl.x,
        y: sl.y,
        canvas,
      })
    } else if ('url' in sl) {
      const id = nextId++
      let source: HTMLImageElement
      try {
        source = await loadImage(sl.url)
      } catch {
        continue
      }
      out.push({
        kind: 'image',
        id,
        name: sl.name,
        visible: sl.visible,
        x: sl.x,
        y: sl.y,
        scale: sl.scale,
        rotation: sl.rotation,
        source,
        naturalW: source.naturalWidth || source.width,
        naturalH: source.naturalHeight || source.height,
      })
    } else {
      const id = nextId++
      out.push({
        kind: 'text',
        id,
        name: sl.name,
        visible: sl.visible,
        x: sl.x,
        y: sl.y,
        text: sl.text,
        color: sl.color,
        fontSize: sl.fontSize,
        rotation: sl.rotation,
      })
    }
  }
  return out
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function Studio({ vehicle }: { vehicle: Vehicle }) {
  const doc = useWrapDocument(CANVAS_SIZE)

  const [designName, setDesignName] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [designs, setDesigns] = useState<DesignMeta[]>([])
  const [storageError, setStorageError] = useState('')
  const [confirmNew, setConfirmNew] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)

  const docRef = useRef(doc)
  docRef.current = doc
  const nameRef = useRef(designName)
  nameRef.current = designName
  const dirty = useRef(false)
  const skipAutosaveRef = useRef(false)
  const timer = useRef<number | null>(null)
  const quotaTimer = useRef<number | null>(null)

  const refreshDesigns = useCallback(() => {
    try {
      setDesigns(listDesigns())
    } catch {
      // Storage unavailable; the list just stays empty.
    }
  }, [])

  useEffect(() => {
    refreshDesigns()
  }, [refreshDesigns])

  const flashStorageError = useCallback((msg: string) => {
    setStorageError(msg)
    if (quotaTimer.current) window.clearTimeout(quotaTimer.current)
    quotaTimer.current = window.setTimeout(
      () => setStorageError(''),
      QUOTA_NOTICE_MS,
    )
  }, [])

  const scheduleAutosave = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const d = docRef.current
      if (!dirty.current) return
      dirty.current = false
      const ok = saveDesign(
        vehicle.id,
        vehicle.name,
        nameRef.current,
        d.layers,
        () =>
          flashStorageError(
            'Storage is full - the design could not be autosaved. Delete old designs or export the wrap.',
          ),
      )
      if (ok) setSavedAt(Date.now())
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [vehicle, flashStorageError])

  const markDirty = useCallback(() => {
    dirty.current = true
    scheduleAutosave()
  }, [scheduleAutosave])

  useEffect(() => {
    if (doc.contentTick === 0) return
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false
      return
    }
    if (!nameRef.current.trim()) return
    markDirty()
  }, [doc.layers, doc.contentTick, markDirty])

  useEffect(() => {
    let cancelled = false
    const list = listDesigns().filter((m) => m.vehicleId === vehicle.id)
    if (list.length > 0) {
      const meta = list[0]
      const d = getDesign(vehicle.id, meta.name)
      if (d) {
        materializeDesign(d)
          .then((layers) => {
            if (cancelled) return
            skipAutosaveRef.current = true
            doc.loadDesign(layers, null)
            setDesignName(meta.name)
            setSavedAt(d.savedAt)
          })
          .catch(() => undefined)
      }
    }
    return () => {
      cancelled = true
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [vehicle])

  const onSaveAs = () => {
    const name = designName.trim()
    if (!name) return
    const ok = saveDesign(
      vehicle.id,
      vehicle.name,
      name,
      doc.layers,
      () =>
        flashStorageError(
          'Storage is full - the design could not be saved. Delete old designs or export the wrap.',
        ),
    )
    if (ok) {
      setSavedAt(Date.now())
      setDesignName(name)
      dirty.current = false
      refreshDesigns()
    }
  }

  const onNewDesign = () => {
    doc.clearAll()
    setDesignName('')
    setSavedAt(null)
    setConfirmNew(false)
  }

  const onLoadDesign = (m: DesignMeta) => {
    const d = getDesign(m.vehicleId, m.name)
    if (!d) return
    materializeDesign(d)
      .then((layers) => {
        skipAutosaveRef.current = true
        doc.loadDesign(layers, null)
        setDesignName(d.name)
        setSavedAt(d.savedAt)
      })
      .catch(() => undefined)
  }

  const onDeleteDesign = (m: DesignMeta) => {
    deleteDesign(m.vehicleId, m.name)
    refreshDesigns()
  }

  const vehicleLabel = (v: Vehicle) =>
    v.name + (v.variant ? ' — ' + v.variant : '')

  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen])

  return (
    <div className={'studio' + (panelOpen ? ' panel-open' : '')}>
      {panelOpen && (
        <button
          className="panel-backdrop"
          aria-label="Close panel"
          onClick={() => setPanelOpen(false)}
        />
      )}
      <aside className={'studio-side' + (panelOpen ? ' open' : '')}>
        <div className="studio-side-head">
          <h2>Layers & export</h2>
          <button
            className="layer-btn"
            title="Close panel"
            onClick={() => setPanelOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <section className="panel-section">
          <h3>My designs</h3>
          <div className="row">
            <input
              className="text-input design-name"
              type="text"
              value={designName}
              onChange={(e) => setDesignName(e.target.value)}
              maxLength={30}
              placeholder="Design name"
              aria-label="Design name"
            />
            <button
              className="tool"
              title="Save under the chosen name"
              onClick={onSaveAs}
              disabled={!designName.trim()}
            >
              <Icon name="save" />
              Save
            </button>
          </div>
          <div className="row">
            {confirmNew ? (
              <button
                className="tool danger"
                title="Start a blank design"
                onClick={onNewDesign}
              >
                Confirm new design?
              </button>
            ) : (
              <button
                className="tool"
                title="Clear the canvas and start fresh"
                onClick={() => setConfirmNew(true)}
              >
                <Icon name="new" />
                New
              </button>
            )}
            {savedAt && (
              <span className="autosaved" title="Last autosave">
                Autosaved {formatTime(savedAt)}
              </span>
            )}
          </div>
          {storageError && (
            <div className="notice notice-inline">
              {storageError}
              <button className="link" onClick={() => setStorageError('')}>
                dismiss
              </button>
            </div>
          )}
          <div className="design-list">
            {designs.map((m) => {
              const v = VEHICLES.find((x) => x.id === m.vehicleId)
              return (
                <div className="design-row" key={m.vehicleId + ':' + m.name}>
                  <button
                    className="design-name-btn"
                    title={'Load "' + m.name + '"'}
                    onClick={() => onLoadDesign(m)}
                  >
                    <span className="design-title">{m.name}</span>
                    <span className="design-meta">
                      {v ? vehicleLabel(v) : m.vehicleName || m.vehicleId}
                      {' \u00b7 '}
                      {formatTime(m.savedAt)}
                    </span>
                  </button>
                  <button
                    className="layer-btn danger"
                    title="Delete design"
                    onClick={() => onDeleteDesign(m)}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              )
            })}
            {designs.length === 0 && (
              <p className="hint">
                Nothing saved yet. Give the design a name and hit Save —
                after that, drawing autosaves.
              </p>
            )}
          </div>
        </section>
        <section className="panel-section">
          <h3>Template</h3>
          <a
            className="template-link"
            href={templateUrl(vehicle)}
            download
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="download" />
            Download original template PNG
          </a>
          <p className="hint">
            The white areas on the template are the wrap-covered panels. Your
            design is exported at {CANVAS_SIZE}x{CANVAS_SIZE} as PNG.
          </p>
        </section>
        <LayersPanel doc={doc} />
        <ExportPanel getCanvas={doc.exportCanvas} vehicleId={vehicle.id} />
      </aside>
      <div className="studio-main">
        <button
          className="panel-toggle"
          title="Open layers, save and export"
          onClick={() => setPanelOpen(true)}
        >
          <Icon name="menu" />
          Layers & export
        </button>
        <WrapCanvas vehicle={vehicle} doc={doc} />
      </div>
    </div>
  )
}
