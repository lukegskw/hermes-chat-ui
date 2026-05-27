import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { logger } from './utils/logger'

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register PWA Service Worker in production
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => logger.info({ scope: reg.scope }, 'Service Worker registered'))
      .catch((err) => logger.error({ error: err }, 'Service Worker registration failed'));
  });
}
