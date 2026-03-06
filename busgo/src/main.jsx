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

function HapticManager() {
  const checkboxRef = useRef(null);

  useEffect(() => {
    const handleGlobalClick = (e) => {
      const button = e.target.closest('button');
      if (button) {
        // 1. Standard Vibration API (Android/Chrome)
        if ('vibrate' in navigator) {
          navigator.vibrate([30, 60, 40]);
        }

        // 2. iOS Safari "Checkbox Trick"
        // iOS Safari triggers a haptic feedback when toggling native form elements.
        // We simulate this by clicking a hidden checkbox twice (double-pulse).
        if (checkboxRef.current) {
          // Pulse 1
          checkboxRef.current.click();
          // Pulse 2 (with delay matching the success pattern)
          setTimeout(() => {
            if (checkboxRef.current) checkboxRef.current.click();
          }, 90);
        }

        console.log('%c🫨 Haptic Triggered', 'color: #06b6d4; font-weight: bold;');
      }
    };

    // Use capture phase (true) to bypass stopPropagation() in components
    document.addEventListener('pointerdown', handleGlobalClick, true);
    return () => document.removeEventListener('pointerdown', handleGlobalClick, true);
  }, []);

  return (
    <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0, width: 0, overflow: 'hidden' }} aria-hidden="true">
      <input type="checkbox" ref={checkboxRef} tabIndex="-1" />
    </div>
  );
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
