import { useMemo, useState } from 'react'
import { measureText } from '../lib/layers'
import { WrapDocument } from '../lib/useWrapDocument'

// Emoji are placed as ordinary text layers, so they move, scale and rotate
// with exactly the same machinery as typed text.
export interface IconCategory {
  label: string
  /** Each emoji plus 1-3 keywords the search filter matches against. */
  items: [string, string[]][]
}

// Only cross-platform emoji (Unicode 13 / Emoji 13 or older) are used, so
// nothing is missing on Windows 10 1903+ or the major mobile platforms.
const ICON_CATEGORIES: IconCategory[] = [
  {
    label: 'Existing',
    items: [
      ['🔥', ['fire', 'flame']],
      ['⚡', ['bolt', 'electric', 'tesla lightning']],
      ['💀', ['skull', 'bone']],
      ['👑', ['crown', 'king']],
      ['⭐', ['star', 'gold']],
      ['✨', ['sparkle', 'glitter', 'magic']],
      ['💥', ['boom', 'collision', 'explosion']],
      ['🌀', ['swirl', 'spiral', 'vortex']],
      ['🏁', ['checkered', 'flag', 'racing finish']],
      ['🏆', ['trophy', 'winner']],
      ['🚀', ['rocket', 'launch', 'space']],
      ['🛸', ['ufo', 'saucer', 'alien']],
      ['🌊', ['wave', 'ocean', 'water']],
      ['🌴', ['palm', 'tropical']],
      ['🏔️', ['mountain', 'peak', 'snow']],
      ['🌵', ['cactus', 'desert']],
      ['❤️', ['heart', 'red', 'love']],
      ['💚', ['heart', 'green']],
      ['💙', ['heart', 'blue']],
      ['💜', ['heart', 'purple']],
      ['🖤', ['heart', 'black']],
      ['☠️', ['skull', 'crossbones', 'pirate']],
      ['👾', ['alien', 'invader', 'pixel']],
      ['🤖', ['robot', 'bot', 'cyber']],
      ['🐺', ['wolf', 'canine']],
      ['🦅', ['eagle', 'falcon', 'bird']],
      ['🦈', ['shark', 'fish', 'ocean']],
      ['🐉', ['dragon', 'mythical']],
      ['🐢', ['turtle', 'slow']],
      ['🦋', ['butterfly', 'insect']],
      ['🌸', ['flower', 'blossom', 'cherry']],
      ['🍀', ['clover', 'four leaf', 'luck']],
      ['☀️', ['sun', 'sunny']],
      ['🌙', ['moon', 'night', 'crescent']],
      ['❄️', ['snowflake', 'ice', 'cold']],
      ['🎯', ['target', 'dart', 'goal']],
      ['🎸', ['guitar', 'music']],
      ['⚙️', ['gear', 'cog', 'engine']],
      ['🔧', ['wrench', 'tool', 'repair']],
      ['🧲', ['magnet', 'magnetic']],
    ],
  },
  {
    label: 'Automotive',
    items: [
      ['🚗', ['car', 'automobile']],
      ['🚙', ['suv', 'off road', 'car']],
      ['🏎️', ['race car', 'racing', 'sports']],
      ['🚓', ['police', 'cop', 'car']],
      ['🚑', ['ambulance', 'medical', 'emergency']],
      ['🚒', ['fire truck', 'fire', 'rescue']],
      ['🚌', ['bus', 'transit']],
      ['🚛', ['truck', 'lorry', 'semi']],
      ['🚜', ['tractor', 'farm']],
      ['⛽', ['gas', 'fuel', 'pump']],
      ['🛞', ['tire', 'wheel', 'rim']],
      ['🛣️', ['road', 'highway']],
      ['🚦', ['traffic', 'light']],
      ['🅿️', ['parking', 'park']],
      ['🔑', ['key', 'keyring']],
      ['⚙️', ['gear', 'cog', 'engine']],
      ['⚡', ['bolt', 'electric', 'tesla lightning']],
      ['🔋', ['battery', 'charge']],
      ['🚘', ['car', 'vehicle']],
      ['🛻', ['pickup', 'truck', 'car']],
      ['🚕', ['taxi', 'cab', 'car']],
    ],
  },
  {
    label: 'Racing / Speed',
    items: [
      ['🏁', ['checkered', 'flag', 'racing finish']],
      ['🏆', ['trophy', 'winner']],
      ['🏅', ['medal', 'ribbon', 'honor']],
      ['💨', ['dash', 'wind', 'whoosh']],
      ['🌪️', ['tornado', 'whirlwind']],
      ['🔥', ['fire', 'flame']],
      ['❄️', ['snowflake', 'ice', 'cold']],
      ['💥', ['boom', 'collision', 'explosion']],
      ['⚡', ['bolt', 'electric', 'tesla lightning']],
    ],
  },
  {
    label: 'Tesla / Tech',
    items: [
      ['🚀', ['rocket', 'launch', 'space']],
      ['🔭', ['telescope', 'space']],
      ['💎', ['diamond', 'gem']],
      ['✨', ['sparkle', 'glitter', 'magic']],
      ['⭐', ['star', 'gold']],
      ['🌟', ['glowing star', 'star']],
      ['💫', ['dizzy', 'star', 'shooting']],
      ['☄️', ['comet', 'star']],
      ['🌌', ['galaxy', 'nebula', 'space']],
      ['🤖', ['robot', 'bot', 'cyber']],
      ['🦾', ['robot arm', 'cyber', 'mech']],
      ['👾', ['alien', 'invader', 'pixel']],
      ['🛰️', ['satellite', 'space', 'tech']],
    ],
  },
  {
    label: 'Nature / Graphics',
    items: [
      ['🐍', ['snake', 'serpent']],
      ['🦈', ['shark', 'fish', 'ocean']],
      ['🐉', ['dragon', 'mythical']],
      ['🦅', ['eagle', 'falcon', 'bird']],
      ['🌊', ['wave', 'ocean', 'water']],
      ['🌈', ['rainbow', 'color']],
      ['🌞', ['sun', 'sun face']],
      ['🌙', ['moon', 'night', 'crescent']],
      ['🍁', ['maple leaf', 'autumn']],
      ['🍂', ['leaf', 'falling', 'autumn']],
    ],
  },
  {
    label: 'Symbols / Shapes',
    items: [
      ['♾️', ['infinity', 'endless']],
      ['🌀', ['swirl', 'spiral', 'vortex']],
      ['🎯', ['target', 'dart', 'goal']],
      ['🧿', ['nazar', 'amulet', 'eye']],
      ['💠', ['diamond', 'dot']],
      ['🔷', ['blue diamond', 'shape']],
      ['🔶', ['orange diamond', 'shape']],
      ['🔻', ['down triangle', 'shape']],
      ['◼️', ['square', 'black']],
      ['▬', ['bar', 'rectangle']],
      ['⭕', ['circle', 'ring', 'red']],
      ['🔺', ['up triangle', 'shape']],
      ['⬛', ['square', 'black']],
    ],
  },
]

/** Placed width as a share of the wrap, matching the Scale slider's reading. */
const TARGET_WIDTH_FRACTION = 0.24
const PROBE_SIZE = 100

interface Props {
  doc: WrapDocument
  /** Controls the slide-in/out animation; the node stays mounted. */
  open: boolean
  onClose: () => void
}

export default function IconPicker({ doc, open, onClose }: Props) {
  const [query, setQuery] = useState('')

  const place = (icon: string) => {
    const size = doc.canvasSize
    // Derive the font size from the glyph's real metrics rather than assuming
    // one em equals its rendered width - emoji vary a lot between families.
    const probe = measureText(icon, PROBE_SIZE)
    const target = TARGET_WIDTH_FRACTION * size
    const fontSize =
      probe.width > 0 ? (target * PROBE_SIZE) / probe.width : target
    const m = measureText(icon, fontSize)
    doc.addTextLayer(
      icon,
      (size - m.width) / 2,
      (size - m.height) / 2,
      '#111111',
      fontSize,
    )
  }

  // Case-insensitive match against each emoji's keyword list (and, as a
  // fallback, the glyph itself).
  const needle = query.trim().toLowerCase()
  const groups = useMemo(() => {
    if (!needle) return ICON_CATEGORIES
    return ICON_CATEGORIES.map((c) => ({
      label: c.label,
      items: c.items.filter(
        ([icon, words]) =>
          icon.toLowerCase().includes(needle) ||
          words.some((w) => w.toLowerCase().includes(needle)),
      ),
    })).filter((c) => c.items.length > 0)
  }, [needle])

  // While closed the drawer is still in the tree (for the slide-out animation),
  // so its controls must be out of the tab order and hidden from a11y.
  const focusable = open ? 0 : -1

  return (
    <aside
      className={'icon-drawer' + (open ? ' open' : '')}
      aria-label="Stickers"
      aria-hidden={!open}
    >
      <div className="icon-drawer-head">
        <h3>Stickers</h3>
        <button
          type="button"
          className="icon-drawer-close"
          title="Close stickers"
          aria-label="Close stickers"
          tabIndex={focusable}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="icon-drawer-search">
        <input
          type="search"
          className="icon-drawer-input"
          placeholder="Search: bolt, fuel, robot…"
          aria-label="Search stickers"
          tabIndex={focusable}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="icon-drawer-body">
        {groups.length === 0 && (
          <p className="hint">No stickers match &ldquo;{query}&rdquo;.</p>
        )}
        {groups.map((g) => (
          <div className="icon-drawer-cat" key={g.label}>
            <h4>{g.label}</h4>
            <div className="icon-grid">
              {g.items.map(([icon, words]) => (
                <button
                  key={icon}
                  type="button"
                  className="icon-btn"
                  title={'Add ' + icon + ' · ' + words.join(', ')}
                  tabIndex={focusable}
                  onClick={() => place(icon)}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="hint">
          Each sticker is added to the centre as its own layer. Place several,
          then drag, scale and rotate them with the Move tool.
        </p>
      </div>
    </aside>
  )
}
