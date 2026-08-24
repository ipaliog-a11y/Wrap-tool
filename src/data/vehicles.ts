export const RAW_BASE =
  'https://raw.githubusercontent.com/teslamotors/custom-wraps/master'
export const REPO_BASE =
  'https://github.com/teslamotors/custom-wraps/tree/master'

// Tesla wrap image requirements (from repo README)
export const REQUIREMENTS = {
  minSize: 512,
  maxSize: 1024,
  maxBytes: 1024 * 1024, // 1 MB
  format: 'image/png',
  fileNamePattern: /^[A-Za-z0-9_\- ]+$/,
  fileNameMaxLength: 30,
}

// Every vehicle folder upstream contains exactly one template.png plus a
// vehicle_image.png. There is no per-panel wrap in Tesla's spec: a wrap is a
// single square image, for the Cybertruck as much as for anything else.
export const TEMPLATE_FILE = 'template.png'

export interface Vehicle {
  id: string
  name: string
  variant?: string
  folder: string
}

function vehicle(folder: string, name: string, variant?: string): Vehicle {
  return { id: folder, name, variant, folder }
}

export const VEHICLES: Vehicle[] = [
  vehicle('cybertruck', 'Cybertruck'),
  vehicle('model3', 'Model 3'),
  vehicle('model3-2024-base', 'Model 3 (2024+)', 'Standard & Premium'),
  vehicle('model3-2024-performance', 'Model 3 (2024+)', 'Performance'),
  vehicle('modely', 'Model Y'),
  vehicle('modely-2025-base', 'Model Y (2025+)', 'Standard'),
  vehicle('modely-2025-premium', 'Model Y (2025+)', 'Premium'),
  vehicle('modely-2025-performance', 'Model Y (2025+)', 'Performance'),
  vehicle('modely-l', 'Model Y L'),
  vehicle('models-2021', 'Model S (2021+)'),
  vehicle('models-2025-plaid', 'Model S (2025+)', 'Plaid'),
  vehicle('modelx-2021', 'Model X (2021+)'),
]

export const vehicleImage = (v: Vehicle): string =>
  `${RAW_BASE}/${v.folder}/vehicle_image.png`

export const templateUrl = (v: Vehicle): string =>
  `${RAW_BASE}/${v.folder}/${TEMPLATE_FILE}`
