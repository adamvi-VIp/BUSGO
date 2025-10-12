import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.jsx'
import { useEffect } from 'react';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

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
