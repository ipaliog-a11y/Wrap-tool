import { WrapDocument } from '../lib/useWrapDocument'
import { Icon } from './icons'

export default function LayersPanel({ doc }: { doc: WrapDocument }) {
  // Topmost layer first, which is how a stack reads.
  const rows = [...doc.layers].reverse()
  const paintCount = doc.layers.filter((l) => l.kind === 'paint').length

  return (
    <section className="panel-section">
      <h3>Layers</h3>
      <button className="btn secondary add-layer" onClick={doc.addPaintLayer}>
        <Icon name="plus" />
        Add paint layer
      </button>
      <div className="layer-list">
        {rows.map((layer) => {
          const index = doc.layers.indexOf(layer)
          return (
            <div
              key={layer.id}
              className={
                'layer-row' + (doc.selectedId === layer.id ? ' active' : '')
              }
            >
              <button
                className="layer-eye"
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                aria-pressed={layer.visible}
                onClick={() => doc.toggleVisible(layer.id)}
              >
                <Icon name={layer.visible ? 'eye' : 'eyeOff'} />
              </button>
              <button
                className="layer-name"
                title="Select layer"
                onClick={() => doc.select(layer.id)}
              >
                {layer.name}
                {layer.id === doc.activePaintLayer.id && (
                  <span className="layer-tag" title="Brush target">
                    brush
                  </span>
                )}
              </button>
              <button
                className="layer-btn"
                title="Move up"
                disabled={index === doc.layers.length - 1}
                onClick={() => doc.moveInStack(layer.id, 1)}
              >
                <Icon name="up" />
              </button>
              <button
                className="layer-btn"
                title="Move down"
                disabled={index === 0}
                onClick={() => doc.moveInStack(layer.id, -1)}
              >
                <Icon name="down" />
              </button>
              <button
                className="layer-btn danger"
                title={
                  layer.kind === 'paint' && paintCount <= 1
                    ? 'The last paint layer cannot be deleted'
                    : 'Delete layer'
                }
                disabled={layer.kind === 'paint' && paintCount <= 1}
                onClick={() => doc.removeLayer(layer.id)}
              >
                <Icon name="trash" />
              </button>
            </div>
          )
        })}
      </div>
      <p className="hint">
        Brush, eraser and fill draw on the layer tagged <em>brush</em> — select
        a paint layer to switch target. Use the Move tool to drag, scale and
        rotate any layer.
      </p>
    </section>
  )
}
