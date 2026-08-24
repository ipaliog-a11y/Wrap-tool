// Dependency-free inline SVG icons. 16x16 viewBox, stroke uses currentColor
// so they inherit the button's text colour. Rendered at 14px via .tool svg.

import type { ReactNode } from 'react'

export type IconName =
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'text'
  | 'move'
  | 'pan'
  | 'undo'
  | 'redo'
  | 'mirror'
  | 'image'
  | 'template'
  | 'trash'
  | 'save'
  | 'new'
  | 'zoomIn'
  | 'zoomOut'
  | 'download'
  | 'eye'
  | 'eyeOff'
  | 'up'
  | 'down'
  | 'plus'
  | 'shield'
  | 'fileSearch'
  | 'smiley'
  | 'cube'
  | 'close'

const PATHS: Record<IconName, ReactNode> = {
  brush: (
    <>
      <path d="M13.5 1.5 9 6c.9.5 1.5 1.2 1.9 2.1L15.5 3.4c.3-.3.1-.9-.3-.7L13.5 1.5Z" />
      <path d="M8.6 7.7C7.5 8 6.7 9 6.4 10.2c-.3 1.2-.9 2.2-2.4 2.8-.5.2-.8.8-.5 1.3.3.6 1 1.2 2.3 1.2 2.8 0 5-2.2 5-5.5 0-.7-.4-1.3-.2-2.3" />
    </>
  ),
  eraser: (
    <>
      <path d="m10.8 3.2 3.3 3.3-6.9 6.9H4.6L2.8 11.6 10.8 3.2Z" />
      <path d="m8 6 4.5 4.5" />
      <path d="M11 13.4H14.5" />
    </>
  ),
  fill: (
    <>
      <path d="M6.2 2.5 12 8.3a1 1 0 0 1 0 1.4L9.7 12a1 1 0 0 1-1.4 0L2.5 6.2 5.8 2.9a1 1 0 0 1 1.4 0" />
      <path d="m9.5 5.8 4 4" />
      <path d="M12.5 12.2s1.6 1.8 1.6 2.8a1.6 1.6 0 0 1-3.2 0c0-1 1.6-2.8 1.6-2.8Z" />
    </>
  ),
  text: (
    <>
      <path d="M3.5 4V2.5h9V4" />
      <path d="M8 2.5v11" />
      <path d="M6 13.5h4" />
    </>
  ),
  move: (
    <>
      <path d="M8 1.8v12.4" />
      <path d="M1.8 8h12.4" />
      <path d="m5.6 4.2 2.4-2.4 2.4 2.4" />
      <path d="m5.6 11.8 2.4 2.4 2.4-2.4" />
      <path d="m4.2 5.6-2.4 2.4 2.4 2.4" />
      <path d="m11.8 5.6 2.4 2.4-2.4 2.4" />
    </>
  ),
  pan: (
    <>
      <path d="M8 1.8v12.4" />
      <path d="m4.2 5.6 3.8-3.8 3.8 3.8" />
      <path d="m4.2 10.4 3.8 3.8 3.8-3.8" />
    </>
  ),
  undo: (
    <>
      <path d="M6.2 3 2.8 6.3l3.4 3.4" />
      <path d="M3.4 6.3H10a4 4 0 0 1 0 8H7.5" />
    </>
  ),
  redo: (
    <>
      <path d="m9.8 3 3.4 3.3-3.4 3.4" />
      <path d="M12.6 6.3H6a4 4 0 0 0 0 8h2.5" />
    </>
  ),
  mirror: (
    <>
      <path d="M8.5 2v12" strokeDasharray="2.4 1.9" />
      <path d="M6.2 4.5 2.5 8l3.7 3.5Z" />
      <path d="M9.8 4.5 13.5 8l-3.7 3.5Z" />
    </>
  ),
  image: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="1.2" />
      <circle cx="5.6" cy="6.4" r="1" />
      <path d="m2.5 11.5 3.6-3.4 2.9 2.7 2.7-2.4 3.4 3.1" />
    </>
  ),
  template: (
    <>
      <rect x="1.8" y="4.2" width="9.4" height="7.4" rx="1" />
      <rect x="4.8" y="1.8" width="9.4" height="7.4" rx="1" />
      <path d="M9.5 5.5v3M8 7h3" />
    </>
  ),
  trash: (
    <>
      <path d="M3 4.2h10" />
      <path d="M6.3 4V2.6h3.4V4" />
      <path d="m4.3 4.4.7 8.6h6l.7-8.6" />
      <path d="M6.6 6.8v4M9.4 6.8v4" />
    </>
  ),
  save: (
    <>
      <path d="M3 2.8h8.2l1.8 1.8v8.6H3Z" />
      <path d="M5.2 2.8v3.4h4.6V2.8" />
      <path d="M5 13V8.8h6V13" />
    </>
  ),
  new: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.4" />
      <path d="M8 5.6v4.8M5.6 8h4.8" />
    </>
  ),
  zoomIn: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.4 10.4 3.6 3.6" />
      <path d="M7 5v4M5 7h4" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.4 10.4 3.6 3.6" />
      <path d="M5 7h4" />
    </>
  ),
  download: (
    <>
      <path d="M8 2.5v6.6" />
      <path d="m5.2 6.3 2.8 2.9 2.8-2.9" />
      <path d="M2.5 11.2v1.6a1.4 1.4 0 0 0 1.4 1.4h8.2a1.4 1.4 0 0 0 1.4-1.4v-1.6" />
    </>
  ),
  eye: (
    <>
      <path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8Z" />
      <circle cx="8" cy="8" r="1.9" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3.6 4.6C1.9 6 1.8 8 1.8 8s2.2 4.2 6.2 4.2c1.4 0 2.6-.5 3.6-1.2" />
      <path d="M7 4c.3-.03.6-.05 1-.05 4 0 6.2 4.05 6.2 4.05s-.7 1.5-2 2.7" />
      <path d="M5.9 5.9A1.9 1.9 0 0 0 8 9.9a1.9 1.9 0 0 0 1.5-.7" />
      <path d="m2.6 2.6 10.8 10.8" />
    </>
  ),
  up: <path d="m4 10 4-4 4 4" />,
  down: <path d="m4 6 4 4 4-4" />,
  plus: <path d="M8 3.2v9.6M3.2 8h9.6" />,
  shield: (
    <>
      <path d="M8 1.8 3.2 3.6v3.9c0 3 2 4.8 4.8 5.7 2.8-.9 4.8-2.7 4.8-5.7V3.6Z" />
      <path d="m5.9 7.8 1.5 1.6 2.7-2.9" />
    </>
  ),
  fileSearch: (
    <>
      <path d="M4 1.8h4.6L12 5.2v9H4Z" />
      <path d="M8.6 1.8v3.4H12" />
      <circle cx="7.4" cy="9" r="2" />
      <path d="m9 10.6 1.8 1.8" />
    </>
  ),
  smiley: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M6 6.2v1.4M10 6.2v1.4" />
      <path d="M5.4 10c.7.85 1.6 1.3 2.6 1.3s1.9-.45 2.6-1.3" />
    </>
  ),
  cube: (
    <>
      <path d="M8 1.8 14 5v6l-6 3.2L2 11V5Z" />
      <path d="m2 5 6 3 6-3" />
      <path d="M8 8v6.2" />
    </>
  ),
  close: <path d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6" />,
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="tool-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
