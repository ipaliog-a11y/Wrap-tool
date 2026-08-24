import { useState } from 'react'
import { REQUIREMENTS } from '../data/vehicles'
import {
  exportUnder1MB,
  sanitizeBaseName,
  validateImage,
  ValidationResult,
} from '../lib/validate'
import ThreeDPreview from './ThreeDPreview'
import { Icon } from './icons'

interface Props {
  /** Flattened copy of the document, from useWrapDocument. */
  getCanvas: () => HTMLCanvasElement | null
  /** Vehicle folder id, so the 3D preview uses the right template net. */
  vehicleId?: string
}

interface PreparedExport {
  fileName: string
  validation: ValidationResult
  blob: Blob
  note: string
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const extensionFor = (format: string) =>
  format === 'image/jpeg' ? '.jpg' : '.png'

export default function ExportPanel({ getCanvas, vehicleId }: Props) {
  const [baseName, setBaseName] = useState('my-wrap')
  const [prepared, setPrepared] = useState<PreparedExport | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploadResult, setUploadResult] = useState<ValidationResult | null>(null)
  const [uploadName, setUploadName] = useState('')
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null)

  const openPreview = () => {
    // A flattened copy at the moment of the click: the preview keeps showing
    // the captured design even as the user keeps editing behind the modal.
    setPreviewCanvas(getCanvas())
  }

  const prepare = async (): Promise<PreparedExport | null> => {
    const canvas = getCanvas()
    if (!canvas) {
      setPrepared(null)
      setError('Nothing to export yet.')
      return null
    }
    // Walks the PNG -> 512 PNG -> JPEG ladder until the blob fits the 1 MB cap.
    const out = await exportUnder1MB(canvas)
    const fileName = sanitizeBaseName(baseName) + extensionFor(out.format)
    const result: PreparedExport = {
      fileName,
      validation: validateImage(
        out.width,
        out.height,
        out.bytes,
        out.format,
        fileName,
      ),
      blob: out.blob,
      note: out.note,
    }
    setError('')
    setPrepared(result)
    return result
  }

  const onValidate = async () => {
    setBusy(true)
    await prepare()
    setBusy(false)
  }

  // No window.confirm: blocking modals are unavailable in sandboxed embeds.
  // A failing export surfaces an inline override instead of a dialog.
  const onExport = async () => {
    setBusy(true)
    const result = await prepare()
    setBusy(false)
    if (!result) return
    if (!result.validation.ok) return
    download(result.blob, result.fileName)
  }

  const onUploadValidate = (file: File) => {
    setUploadResult(null)
    setUploadName(file.name)
    const img = new Image()
    img.onload = () => {
      setUploadResult(
        validateImage(img.width, img.height, file.size, file.type, file.name),
      )
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => {
      setUploadResult({
        ok: false,
        checks: [{ label: 'Not a readable image', pass: false }],
      })
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  }

  const sanitized = sanitizeBaseName(baseName)

  return (
    <section className="panel-section export-panel">
      <h3>Export</h3>
      <label className="field">
        <span>Wrap name</span>
        <input
          value={baseName}
          onChange={(e) => setBaseName(e.target.value)}
          maxLength={REQUIREMENTS.fileNameMaxLength}
          placeholder="my-wrap"
        />
      </label>
      {sanitized !== baseName.trim() && (
        <p className="warn">Name will be sanitized to "{sanitized}"</p>
      )}
      <div className="row">
        <button className="btn secondary" onClick={onValidate} disabled={busy}>
          <Icon name="shield" />
          Validate
        </button>
        <button className="btn primary" onClick={onExport} disabled={busy}>
          <Icon name="download" />
          Export PNG
        </button>
      </div>
      <div className="row">
        <button
          className="btn secondary"
          onClick={openPreview}
          title="Spin the design on a 3D car"
        >
          <Icon name="cube" />
          3D Preview
        </button>
      </div>
      {error && (
        <div className="checks">
          <div className="check-line fail">
            <span className="dot" />
            {error}
          </div>
        </div>
      )}
      {prepared && (
        <div className="checks">
          <p className="hint">{prepared.note}</p>
          {prepared.validation.checks.map((c, i) => (
            <div key={i} className={'check-line ' + (c.pass ? 'pass' : 'fail')}>
              <span className="dot" />
              {c.label}
            </div>
          ))}
          {!prepared.validation.ok && (
            <>
              <p className="warn">
                This file does not meet Tesla’s requirements and may be rejected
                by the Paint Shop.
              </p>
              <button
                className="btn secondary"
                onClick={() => download(prepared.blob, prepared.fileName)}
              >
                <Icon name="download" />
                Download anyway
              </button>
            </>
          )}
        </div>
      )}
      <hr />
      <h3>Check an existing PNG</h3>
      <p className="hint">Validate a wrap you made in another tool.</p>
      <label className="btn secondary file-btn">
        <Icon name="fileSearch" />
        Choose PNG to validate
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUploadValidate(f)
            e.target.value = ''
          }}
        />
      </label>
      {uploadResult && (
        <div className="checks">
          <div className={'upload-status ' + (uploadResult.ok ? 'pass' : 'fail')}>
            {uploadName}:{' '}
            {uploadResult.ok
              ? 'Ready for your Tesla'
              : 'Does not meet requirements'}
          </div>
          {uploadResult.checks.map((c, i) => (
            <div key={i} className={'check-line ' + (c.pass ? 'pass' : 'fail')}>
              <span className="dot" />
              {c.label}
            </div>
          ))}
        </div>
      )}
      <hr />
      <h3>Transfer to your vehicle</h3>
      <ol className="steps">
        <li>Mobile app (v4.59.0+): Creations &gt; Wrap &gt; Upload</li>
        <li>
          USB: put PNGs in a folder named <code>Wraps</code> (exFAT/FAT32)
        </li>
        <li>In car: Toybox &gt; Paint Shop &gt; Wraps tab</li>
      </ol>
      {previewCanvas && (
        <ThreeDPreview
          canvas={previewCanvas}
          vehicleId={vehicleId}
          onClose={() => setPreviewCanvas(null)}
        />
      )}
    </section>
  )
}
