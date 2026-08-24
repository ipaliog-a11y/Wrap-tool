import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Icon } from './icons'

interface Props {
  canvas: HTMLCanvasElement
  onClose: () => void
  /** Vehicle folder id, used to pick the matching template net. */
  vehicleId?: string
}

/**
 * A sub-region of the 1024x1024 wrap design, in canvas fractions. x/y is the
 * top-left corner (image coordinates, y grows downward), w/h the size.
 */
interface Region {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Where each car panel lands on the flat design, measured from Tesla's real
 * template nets (white = wrap-covered area, everything else is non-wrap).
 *
 *  side  - the dominant central side profile (front of the car at its left
 *          edge, rear at its right edge).
 *  front - the nose face strip, to the left of the side panel.
 *  rear  - the tail face strip, to the right of the side panel.
 *  roof  - the top band that folds onto the deck / roof.
 *
 * The sedan net (model3, a square 1024x1024 template) is the default and
 * matches the other sedans and SUVs. The Cybertruck net is 1024x768 and the
 * app contains it into the square design at scale 1 with a 128px (0.125)
 * top offset, so its regions are pre-mapped into canvas fractions
 * (x = tx, y = ty + 0.125).
 *
 * These fractions are verified against the nets and are intentionally NOT
 * adjusted for the geometry rebuild: both nets are drawn side-on with the
 * nose at the left edge, and the rebuilt flanks (the extrude caps) are the
 * full side profile, so the same region still covers the same panels.
 */
export interface WrapMap {
  side: Region
  front: Region
  rear: Region
  roof: Region
}

const SEDAN_MAP: WrapMap = {
  side: { x: 0.25, y: 0.16, w: 0.5, h: 0.51 },
  front: { x: 0.03, y: 0.36, w: 0.21, h: 0.44 },
  rear: { x: 0.77, y: 0.36, w: 0.21, h: 0.44 },
  roof: { x: 0.25, y: 0.02, w: 0.5, h: 0.15 },
}

const TRUCK_MAP: WrapMap = {
  side: { x: 0.114, y: 0.384, w: 0.805, h: 0.479 },
  front: { x: 0.016, y: 0.385, w: 0.082, h: 0.478 },
  rear: { x: 0.89, y: 0.384, w: 0.108, h: 0.474 },
  roof: { x: 0.0, y: 0.125, w: 1.0, h: 0.279 },
}

/** Pick a net by vehicle folder id; every sedan/SUV uses the sedan map. */
export const mapForVehicle = (vehicleId?: string): WrapMap =>
  vehicleId === 'cybertruck' ? TRUCK_MAP : SEDAN_MAP

// Car dimensions in world units (proportions ~ 4.4 : 1.9 : 1.4).
const CAR = {
  length: 4.4, // x: -2.2 (tail) .. +2.2 (nose)
  width: 1.9, // z: -0.95 (car left) .. +0.95 (car right)
  ground: 0.35, // body bottom above the floor
  sedanRoof: 1.38, // sedan roof height
  truckTop: 1.1, // truck bed-rail height
  wheelX: 1.15, // arch centers: front +x (nose), rear -x
  wheelY: 0.38,
  wheelZ: 0.9,
}
const BEVEL = 0.05 // sedan bevel: how far the edge flares beyond the flat flank

/**
 * Shared build context: the group plus everything to dispose on unmount and
 * the shared materials.
 */
interface BuildCtx {
  group: THREE.Group
  add: <T extends THREE.BufferGeometry>(g: T) => T
  wrapMat: THREE.MeshStandardMaterial
  glassMat: THREE.MeshStandardMaterial
  darkMat: THREE.MeshStandardMaterial
  hubMat: THREE.MeshStandardMaterial
  wellMat: THREE.MeshStandardMaterial
  steelMat: THREE.MeshStandardMaterial
}

/**
 * UV mapping for the extruded body's walls (group 1).
 *
 * The side profile Shape lives in the XY plane (x = length, nose at +x,
 * y = height up); the extrusion runs along +z (the car width). Each outline
 * segment becomes a full-width wall face, so the walls are: the nose face,
 * the tail face, the top faces (hood / windshield rake / roof / fastback /
 * trunk — the profile's top run) and the bottom faces (rocker + wheel
 * arches). Each wall quad belongs to exactly one outline segment, so the
 * segment is classified as a whole and every vertex of the quad is routed
 * to the matching net region with its own (x, y, z):
 *
 *   nose  (segment fully at x >  1.9)  -> front region: u across the width,
 *           v over the nose height. The front strip sits to the LEFT of the
 *           side panel in the net, so its right edge (u = x + w) joins the
 *           side panel's left edge at the car-LEFT nose corner.
 *   tail  (segment fully at x < -1.9)  -> rear region: the rear strip sits
 *           to the RIGHT of the side panel, so its left edge joins the side
 *           panel's right edge at the car-left tail corner.
 *   top   (midY > 0.85)               -> roof region: u along the length
 *           with the net's left edge at the nose, v across the width with
 *           the band folding over from the car-left roofline.
 *   bottom (rocker + arches)           -> side region, same mapping as the
 *           flanks, so the rocker shows the net's underbody edge and the
 *           arches the fender area of the side profile.
 *
 * `tf` runs 0 (car-left flank) .. 1 (car-right flank) from the pre-translate
 * extrusion z (0..depth). CanvasTexture samples with flipY, so a region's
 * top edge (y) maps to v = 1 - y and its bottom (y + h) to v = 1 - (y + h);
 * the car bottom (y = ground) lands on the region's bottom edge.
 */
function makeWallUV(
  map: WrapMap,
  opts: { depth: number; topY: number; noseTopY: number; tailTopY: number },
) {
  const { side, front, rear, roof } = map
  const L = CAR.length
  const g = CAR.ground
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

  const pt = (x: number, y: number, z: number, seg: 0 | 1 | 2 | 3): THREE.Vector2 => {
    const tf = clamp01(z / opts.depth) // 0 = car-left, 1 = car-right
    if (seg === 0) {
      // nose strip
      return new THREE.Vector2(
        front.x + front.w * (1 - tf),
        1 - (front.y + front.h) + ((y - g) / (opts.noseTopY - g)) * front.h,
      )
    }
    if (seg === 1) {
      // tail strip
      return new THREE.Vector2(
        rear.x + rear.w * tf,
        1 - (rear.y + rear.h) + ((y - g) / (opts.tailTopY - g)) * rear.h,
      )
    }
    if (seg === 2) {
      // hood / windshield rake / roof / fastback / trunk top run
      return new THREE.Vector2(
        roof.x + ((2.2 - x) / L) * roof.w,
        1 - (roof.y + roof.h) + roof.h * tf,
      )
    }
    // rocker + arches: same mapping as the flanks
    return new THREE.Vector2(
      side.x + ((2.2 - x) / L) * side.w,
      1 - (side.y + side.h) + ((y - g) / (opts.topY - g)) * side.h,
    )
  }

  return {
    generateTopUV(
      _geo: THREE.BufferGeometry,
      verts: number[],
      ia: number,
      ib: number,
      ic: number,
    ): THREE.Vector2[] {
      // raw shape coords; the caps (flanks) are remapped after the transform
      return [
        new THREE.Vector2(verts[ia * 3], verts[ia * 3 + 1]),
        new THREE.Vector2(verts[ib * 3], verts[ib * 3 + 1]),
        new THREE.Vector2(verts[ic * 3], verts[ic * 3 + 1]),
      ]
    },
    generateSideWallUV(
      _geo: THREE.BufferGeometry,
      verts: number[],
      ia: number,
      ib: number,
      ic: number,
      id: number,
    ): THREE.Vector2[] {
      const [ax, ay, az] = [verts[ia * 3], verts[ia * 3 + 1], verts[ia * 3 + 2]]
      const [bx, by] = [verts[ib * 3], verts[ib * 3 + 1]]
      // Classify the whole quad by its outline segment (a and b are the
      // segment's endpoints at the same extrusion layer).
      let seg: 0 | 1 | 2 | 3
      if (Math.min(ax, bx) > 1.9) seg = 0
      else if (Math.max(ax, bx) < -1.9) seg = 1
      else if ((ay + by) / 2 > 0.85) seg = 2
      else seg = 3
      return [
        pt(ax, ay, az, seg),
        pt(bx, by, verts[ib * 3 + 2], seg),
        pt(verts[ic * 3], verts[ic * 3 + 1], verts[ic * 3 + 2], seg),
        pt(verts[id * 3], verts[id * 3 + 1], verts[id * 3 + 2], seg),
      ]
    },
  }
}

/**
 * Remap the extrude cap UVs (group 0: the two flanks) from raw shape (x, y)
 * into the side region. The caps are the only group-0 faces, so a per-vertex
 * remap cannot touch wall vertices. Both flanks put the net's left edge
 * (front of the car) at the nose (+x) — the same orientation the verified
 * box model used (nose at +x, right flank unmirrored).
 */
function remapCapUVs(geo: THREE.ExtrudeGeometry, map: WrapMap, topY: number) {
  const side = map.side
  const L = CAR.length
  const g = CAR.ground
  const g0 = geo.groups[0]
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute
  for (let i = g0.start; i < g0.start + g0.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (Math.abs(z) < 0.3) continue // verts shared with wall layers
    uv.setXY(
      i,
      side.x + ((2.2 - x) / L) * side.w,
      1 - (side.y + side.h) + ((y - g) / (topY - g)) * side.h,
    )
  }
  uv.needsUpdate = true
}

/**
 * Sedan side profile (nose at +x): low raked nose, gentle hood, raked
 * windshield, set-back roof with a fastback tail and a slight ducktail,
 * flat bottom with arc cutouts over both wheels (centers at +/-1.15).
 */
function sedanProfile(): THREE.Shape {
  const g = CAR.ground
  const pts: [number, number][] = [
    [-2.2, g], // rear bumper bottom
    [-1.66, g],
    [-1.52, 0.57],
    [-1.34, 0.74],
    [-1.15, 0.82], // rear arch
    [-0.96, 0.74],
    [-0.78, 0.57],
    [-0.64, g],
    [0.64, g], // rocker
    [0.78, 0.57],
    [0.96, 0.74],
    [1.15, 0.82], // front arch
    [1.34, 0.74],
    [1.52, 0.57],
    [1.66, g],
    [2.2, g], // front bumper bottom
    [2.2, 0.62], // nose face (vertical)
    [2.0, 0.9], // raked nose top -> hood tip
    [1.3, 0.9], // hood
    [0.85, 0.94], // cowl
    [0.55, 0.96], // beltline front (A-pillar base)
    [0.36, 1.16], // raked windshield
    [0.14, 1.34],
    [0.0, 1.38], // roof front
    [-0.7, 1.38], // roof rear
    [-1.15, 1.28], // fastback
    [-1.6, 1.17],
    [-1.88, 1.14], // trunk deck
    [-2.06, 1.12],
    [-2.2, 1.08], // ducktail / tail top
  ]
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
}

/** Sedan greenhouse: the window band, inset from the body profile. */
function sedanGlassShape(): THREE.Shape {
  const pts: [number, number][] = [
    [0.52, 0.975], // beltline front
    [0.35, 1.15],
    [0.13, 1.3],
    [0.0, 1.33], // roof front
    [-0.68, 1.33], // roof rear
    [-1.12, 1.23], // fastback glass
    [-1.5, 1.12],
    [-1.52, 1.03], // beltline rear
    [-1.0, 1.0],
    [0.0, 0.985], // beltline
  ]
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
}

/**
 * Cybertruck wedge profile (nose at +x): low raked nose, long straight bed
 * rail, the signature slanted tailgate.
 */
function truckProfile(): THREE.Shape {
  const g = CAR.ground
  const pts: [number, number][] = [
    [-2.2, g], // tail bottom
    [-2.1, CAR.truckTop], // tailgate top (the slanted signature edge)
    [0.3, CAR.truckTop - 0.05], // bed rail
    [2.2, 0.68], // nose top (long rake)
    [2.2, g], // nose bottom
    [1.66, g],
    [1.52, 0.57],
    [1.34, 0.74],
    [1.15, 0.82], // front arch
    [0.96, 0.74],
    [0.78, 0.57],
    [0.64, g],
    [-0.64, g], // rocker
    [-0.78, 0.57],
    [-0.96, 0.74],
    [-1.15, 0.82], // rear arch
    [-1.34, 0.74],
    [-1.52, 0.57],
    [-1.66, g],
  ]
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
}

/**
 * Build a sedan: extruded side profile (flanks = the wrap's side region,
 * top run = the roof region, nose/tail faces = front/rear regions), an
 * inset dark glasshouse slab, wheels with 5-spoke hubs and dark half-disc
 * wells filling the arches.
 */
function buildSedanBody(ctx: BuildCtx, map: WrapMap) {
  const depth = CAR.width - 2 * BEVEL // bevel flares BEVEL beyond each flank
  const bodyGeo = ctx.add(
    new THREE.ExtrudeGeometry(sedanProfile(), {
      steps: 1,
      depth,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: 0.04,
      bevelSegments: 2,
      curveSegments: 6,
      UVGenerator: makeWallUV(map, {
        depth,
        topY: CAR.sedanRoof,
        noseTopY: 0.9,
        tailTopY: 1.08,
      }),
    }),
  )
  bodyGeo.translate(0, 0, -depth / 2)
  remapCapUVs(bodyGeo, map, CAR.sedanRoof)
  ctx.group.add(new THREE.Mesh(bodyGeo, ctx.wrapMat))

  // Glasshouse: a slab of the window band, protruding 2cm from the outer
  // body edge so the dark band reads on the wrap; its end faces are the
  // windshield and rear glass rakes.
  const glassDepth = CAR.width + 0.04
  const glassGeo = ctx.add(
    new THREE.ExtrudeGeometry(sedanGlassShape(), {
      steps: 1,
      depth: glassDepth,
      bevelEnabled: false,
    }),
  )
  glassGeo.translate(0, 0, -glassDepth / 2)
  ctx.group.add(new THREE.Mesh(glassGeo, ctx.glassMat))

  buildWheels(ctx)
}

/**
 * Build the Cybertruck wedge: sharp un-beveled corners, stainless bed rail,
 * a dark windshield quad on the nose rake; the slanted tail wall carries
 * the rear region and the bed rail top the roof region.
 */
function buildTruckBody(ctx: BuildCtx, map: WrapMap) {
  const depth = CAR.width
  const bodyGeo = ctx.add(
    new THREE.ExtrudeGeometry(truckProfile(), {
      steps: 1,
      depth,
      bevelEnabled: false,
      curveSegments: 6,
      UVGenerator: makeWallUV(map, {
        depth,
        topY: CAR.truckTop,
        noseTopY: 0.68,
        tailTopY: CAR.truckTop,
      }),
    }),
  )
  bodyGeo.translate(0, 0, -depth / 2)
  remapCapUVs(bodyGeo, map, CAR.truckTop)
  ctx.group.add(new THREE.Mesh(bodyGeo, ctx.wrapMat))

  // Windshield: a dark quad on the nose rake (2.2, 0.68) -> (0.3, 1.05),
  // offset 2cm along the rake normal to avoid z-fighting the body wall.
  const rakeLen = Math.hypot(2.2 - 0.3, 1.05 - 0.68)
  const rake = new THREE.Vector3(0.3 - 2.2, 1.05 - 0.68, 0).normalize()
  const upN = new THREE.Vector3(rake.y, -rake.x, 0) // ~+y, tilted to the nose
  const wsGeo = ctx.add(new THREE.PlaneGeometry(rakeLen, CAR.width - 0.34))
  const ws = new THREE.Mesh(wsGeo, ctx.glassMat)
  const m = new THREE.Matrix4().makeBasis(rake, new THREE.Vector3(0, 0, 1), upN)
  m.setPosition(1.25 + upN.x * 0.02, 0.865 + upN.y * 0.02, 0)
  ws.applyMatrix4(m)
  ctx.group.add(ws)

  // Stainless bed rail along the bed-rail top edge.
  const railGeo = ctx.add(new THREE.BoxGeometry(2.4, 0.04, CAR.width + 0.02))
  const rail = new THREE.Mesh(railGeo, ctx.steelMat)
  rail.position.set(-0.9, 1.055, 0)
  rail.rotation.z = -Math.atan2(0.05, 2.4)
  ctx.group.add(rail)

  buildWheels(ctx)
}

/** Wheels, 5-spoke hubs, and dark half-disc wells filling the arches. */
function buildWheels(ctx: BuildCtx) {
  const { group, add } = ctx
  const tireGeo = add(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 24))
  tireGeo.rotateX(Math.PI / 2)
  const rimGeo = add(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 20))
  rimGeo.rotateX(Math.PI / 2)
  const hubGeo = add(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12))
  hubGeo.rotateX(Math.PI / 2)
  const spokeGeo = add(new THREE.BoxGeometry(0.05, 0.3, 0.035))
  // Upper half-disc (flat side down) filling the arch opening behind the tire.
  const wellGeo = add(new THREE.CircleGeometry(0.52, 24, 0, Math.PI))

  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const px = sx * CAR.wheelX
      const py = CAR.wheelY
      const pz = sz * CAR.wheelZ

      const tire = new THREE.Mesh(tireGeo, ctx.darkMat)
      tire.position.set(px, py, pz)
      group.add(tire)

      const rim = new THREE.Mesh(rimGeo, ctx.hubMat)
      rim.position.set(px, py, pz + sz * 0.155)
      group.add(rim)

      const hub = new THREE.Mesh(hubGeo, ctx.hubMat)
      hub.position.set(px, py, pz + sz * 0.19)
      group.add(hub)

      for (let s = 0; s < 5; s++) {
        const a = (s * Math.PI * 2) / 5 + 0.3
        const spoke = new THREE.Mesh(spokeGeo, ctx.hubMat)
        spoke.position.set(px + 0.12 * Math.cos(a), py + 0.12 * Math.sin(a), pz + sz * 0.19)
        spoke.rotation.z = a - Math.PI / 2
        group.add(spoke)
      }

      // The well disc faces the arch opening (outward from the car center).
      const well = new THREE.Mesh(wellGeo, ctx.wellMat)
      well.position.set(px, py, pz - sz * 0.2)
      if (sz === -1) well.rotation.y = Math.PI
      group.add(well)
    }
  }
}

/** Build the full car. Returns the group plus everything to dispose. */
function buildCar(design: HTMLCanvasElement, map: WrapMap, isTruck: boolean) {
  const group = new THREE.Group()
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const textures: THREE.Texture[] = []
  const add = <T extends THREE.BufferGeometry>(g: T) => {
    geometries.push(g)
    return g
  }

  const base = new THREE.CanvasTexture(design)
  base.colorSpace = THREE.SRGBColorSpace
  base.anisotropy = 4
  textures.push(base)

  const wrapMat = new THREE.MeshStandardMaterial({ map: base, roughness: 0.4 })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x15181c,
    roughness: 0.15,
    metalness: 0.4,
  })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x26282d, roughness: 0.8 })
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x8a8f98,
    roughness: 0.35,
    metalness: 0.7,
  })
  const wellMat = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.9 })
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xb8bcc2,
    roughness: 0.25,
    metalness: 0.85,
  })
  materials.push(wrapMat, glassMat, darkMat, hubMat, wellMat, steelMat)

  const ctx: BuildCtx = {
    group,
    add,
    wrapMat,
    glassMat,
    darkMat,
    hubMat,
    wellMat,
    steelMat,
  }

  if (isTruck) buildTruckBody(ctx, map)
  else buildSedanBody(ctx, map)

  return { group, geometries, materials, textures }
}

/** Radial-gradient "contact shadow" under the car. */
function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128)
  g.addColorStop(0, 'rgba(0,0,0,0.5)')
  g.addColorStop(0.7, 'rgba(0,0,0,0.25)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Turntable preview of the current design on a stylized car. The design
 * canvas is sampled per face with the vehicle's template net (see
 * SEDAN_MAP / TRUCK_MAP); the glass stays dark. The camera is framed from
 * the model's bounding sphere rather than a hardcoded distance, so future
 * geometry changes still fit the viewport on open.
 */
export default function ThreeDPreview({ canvas, onClose, vehicleId }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const map = mapForVehicle(vehicleId)
  const isTruck = vehicleId === 'cybertruck'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const width = host.clientWidth || 800
    const height = host.clientHeight || 500

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x14161a)

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)

    const car = buildCar(canvas, map, isTruck)
    scene.add(car.group)

    // Frame the camera from the model's bounding sphere.
    const box = new THREE.Box3().setFromObject(car.group)
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const fitDist = (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.05
    const dir = new THREE.Vector3(5.2, 2.7, 6.4).normalize()
    camera.position.copy(sphere.center).addScaledVector(dir, fitDist)

    const shadowTex = shadowTexture()
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(9.5, 5),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.01
    scene.add(shadow)

    const hemi = new THREE.HemisphereLight(0xdfe6f2, 0x14161a, 1.1)
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(4.5, 6.5, 3.5)
    const fill = new THREE.DirectionalLight(0x9fb4ff, 0.5)
    fill.position.set(-5, 3, -4.5)
    const ambient = new THREE.AmbientLight(0xffffff, 0.25)
    scene.add(hemi, key, fill, ambient)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(sphere.center)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minDistance = 3.5
    controls.maxDistance = 14
    controls.maxPolarAngle = Math.PI / 2 - 0.04
    controls.autoRotate = true
    controls.autoRotateSpeed = 1.2

    // Auto-rotate pauses while the user drags and resumes after 2s idle.
    let idleTimer: number | null = null
    const scheduleResume = () => {
      if (idleTimer !== null) window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => {
        controls.autoRotate = true
      }, 2000)
    }
    const pause = () => {
      controls.autoRotate = false
      scheduleResume()
    }
    controls.addEventListener('start', pause)
    controls.addEventListener('end', scheduleResume)

    const resize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    let raf = 0
    const tick = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()

    closeRef.current?.focus()

    return () => {
      cancelAnimationFrame(raf)
      if (idleTimer !== null) window.clearTimeout(idleTimer)
      ro.disconnect()
      controls.dispose()
      car.geometries.forEach((g) => g.dispose())
      car.materials.forEach((m) => m.dispose())
      car.textures.forEach((t) => t.dispose())
      shadow.geometry.dispose()
      shadow.material.dispose()
      shadowTex.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [canvas, map, isTruck])

  return (
    <div
      className="preview-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label="3D preview of the current wrap"
      >
        <div className="preview-header">
          <span className="preview-title">3D Preview</span>
          <span className="preview-hint">Drag to rotate &bull; Scroll to zoom</span>
          <button
            ref={closeRef}
            className="preview-close"
            onClick={onClose}
            title="Close 3D preview (Esc)"
            aria-label="Close 3D preview"
          >
            <Icon name="close" />
          </button>
        </div>
        <div ref={hostRef} className="preview-stage" />
      </div>
    </div>
  )
}
