import '@fontsource/rock-salt/latin-400.css';
import './account.js';
import './p2p.js';
import './game.js';

// Installable app: register the service worker on the real website only (not in dev, not in the desktop build).
if ('serviceWorker' in navigator && location.protocol === 'https:' && import.meta.env.PROD) {
  addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
