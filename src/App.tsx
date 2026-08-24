import { useState } from 'react'
import { VEHICLES, Vehicle } from './data/vehicles'
import VehiclePicker from './components/VehiclePicker'
import Studio from './components/Studio'

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
      </header>
      <main>
        {vehicle ? <Studio vehicle={vehicle} /> : <VehiclePicker vehicles={VEHICLES} onSelect={setVehicle} />}
      </main>
    </div>
  )
}
