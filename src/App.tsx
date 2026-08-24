import { useEffect, useState } from 'react'
import { VEHICLES, Vehicle } from './data/vehicles'
import VehiclePicker from './components/VehiclePicker'
import Studio from './components/Studio'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
}

function InstallButton() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
    if (standalone) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setEvt(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!evt) return null
  return (
    <button
      className="tool"
      title="Install Wrap Studio on this device"
      onClick={async () => {
        await evt.prompt()
        setEvt(null)
      }}
    >
      Install
    </button>
  )
}

export default function App() {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  return (
    <div className="app">
      <header className="app-header">
        <button className="brand" onClick={() => setVehicle(null)}>
          <span className="brand-mark">T</span><span className="brand-name">Wrap Studio</span>
        </button>
        {vehicle && (
          <div className="header-vehicle">
            {vehicle.name}{vehicle.variant ? ' — ' + vehicle.variant : ''}
            <button className="link" onClick={() => setVehicle(null)}>change</button>
          </div>
        )}
        <div className="header-actions">
          <InstallButton />
        </div>
      </header>
      <main>
        {vehicle ? <Studio vehicle={vehicle} /> : <VehiclePicker vehicles={VEHICLES} onSelect={setVehicle} />}
      </main>
    </div>
  )
}
