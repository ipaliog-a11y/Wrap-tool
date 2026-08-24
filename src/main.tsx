import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Set once the app has rendered. Before that, an error means the app never
// started and replacing #root is the only way to say so. After that, wiping
// #root would throw away a working editor and the user's artwork over
// something they may not even care about - so we show a dismissible banner
// and leave the app running.
let mounted = false

function showStartupFailure(message: string) {
  const root = document.getElementById('root')
  if (!root) return
  const esc = message.replace(/&/g, '\u0026amp;').replace(/</g, '\u0026lt;')
  root.innerHTML =
    '<div style="min-height:100vh;background:#0e0f11;color:#f4f4f5;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:24px;"><div style="max-width:720px;"><h1 style="color:#e82127;font-size:20px;margin:0 0 12px;">Wrap Studio failed to start</h1><pre style="white-space:pre-wrap;background:#1d1f24;border:1px solid #2b2e35;border-radius:8px;padding:16px;font-size:13px;">' +
    esc +
    '</pre></div></div>'
}

function showRuntimeError(message: string) {
  console.error(message)
  const id = 'runtime-error-banner'
  let banner = document.getElementById(id)
  if (!banner) {
    banner = document.createElement('div')
    banner.id = id
    banner.className = 'error-banner'
    document.body.appendChild(banner)
  }
  banner.textContent = ''
  const text = document.createElement('span')
  text.textContent = 'Something went wrong: ' + message
  const dismiss = document.createElement('button')
  dismiss.textContent = 'Dismiss'
  dismiss.onclick = () => banner!.remove()
  banner.append(text, dismiss)
}

function report(message: string) {
  if (mounted) showRuntimeError(message)
  else showStartupFailure(message)
}

window.onerror = (msg, src, line, col) => {
  report(String(msg) + '\n' + String(src) + ':' + line + ':' + col)
}
window.addEventListener('unhandledrejection', (e) => {
  report('Unhandled promise rejection:\n' + String(e.reason))
})

createRoot(document.getElementById('root')!).render(<App />)
mounted = true

if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined)
  })
}
