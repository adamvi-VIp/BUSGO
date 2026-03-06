import { createRoot } from 'react-dom/client'
import { StrictMode, useEffect, useRef } from 'react'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <HapticManager />
  </StrictMode>,
)

// ─── Haptic Manager ──────────────────────────────────────────────────────────
// Android: navigator.vibrate()  (Chrome/Firefox on Android)
// iOS:     clicking a hidden <input type="checkbox" switch> triggers UIFeedbackGenerator
//          but ONLY when the click comes from a real trusted user-gesture on that element.
//          We accomplish this by re-dispatching a synthetic PointerEvent that originates
//          at the same screen coordinates as the original touch — browsers accept this as
//          sufficiently trusted when it happens synchronously inside a pointerdown handler.

function HapticManager() {
  const labelRef = useRef(null);

  useEffect(() => {
    // Build the hidden iOS haptic element once
    const label = document.createElement('label');
    label.style.cssText =
      'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;overflow:hidden;top:0;left:0;';
    label.setAttribute('aria-hidden', 'true');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.style.cssText = 'all:initial;appearance:auto;';
    label.appendChild(input);
    document.body.appendChild(label);
    labelRef.current = label;

    const isAndroid = /Android/i.test(navigator.userAgent);
    const canVibrate = typeof navigator.vibrate === 'function';
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    // Reusable haptic trigger
    const fireHaptic = () => {
      if (canVibrate && isAndroid) {
        navigator.vibrate([30, 60, 40]);
        console.log('%c🫨 Haptic (Android vibrate)', 'color:#06b6d4;font-weight:bold;');
      } else if (isIOS) {
        label.style.pointerEvents = 'auto';
        label.click();
        label.style.pointerEvents = 'none';
        console.log('%c🫨 Haptic (iOS checkbox-switch)', 'color:#06b6d4;font-weight:bold;');
      }
    };

    // Global click handler — matches buttons, links, and elements with data-haptic
    const handleClick = (e) => {
      const target = e.target.closest('button, [role="button"], a, [data-haptic]');
      if (!target) return;
      fireHaptic();
    };

    // Custom event from MapGL canvas clicks (map markers aren't DOM elements)
    const handleCustomHaptic = () => fireHaptic();

    document.addEventListener('click', handleClick, true);
    document.addEventListener('haptic', handleCustomHaptic);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('haptic', handleCustomHaptic);
      label.remove();
    };
  }, []);

  return null;
}

// Globally prevent copy operations
document.addEventListener('copy', (e) => {
  e.preventDefault();
});

// Fade out and remove the HTML splash after React is ready
setTimeout(() => {
  const splash = document.getElementById('html-splash');
  const fill = document.getElementById('html-splash-fill');
  if (fill) fill.style.clipPath = 'inset(0 0 0 0)';
  setTimeout(() => {
    if (splash) splash.style.opacity = '0';
    setTimeout(() => {
      if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
    }, 600);
  }, 600);
}, 100);
