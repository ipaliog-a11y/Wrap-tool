import { Vehicle, vehicleImage } from '../data/vehicles'
interface Props { vehicles: Vehicle[]; onSelect: (v: Vehicle) => void }
export default function VehiclePicker({ vehicles, onSelect }: Props) {
  return (
    <div className="picker">
      <div className="picker-hero">
        <h1>Design a custom wrap for your Tesla</h1>
        <p>Pick your vehicle, create your design on the official template, and export a file ready for the Paint Shop. Images are validated against Tesla's requirements automatically.</p>
      </div>
      <div className="vehicle-grid">
        {vehicles.map((v) => (
          <button key={v.id} className="vehicle-card" onClick={() => onSelect(v)}>
            <div className="vehicle-img-wrap">
              <img src={vehicleImage(v)} alt={v.name} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.15' }} />
            </div>
            <div className="vehicle-name">{v.name}</div>
            {v.variant && <div className="vehicle-variant">{v.variant}</div>}
          </button>
        ))}
      </div>
    </div>
  )
}
