import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/800.css';
import './styles/modernist.css';
import './styles/app.css';
import { App } from './App.tsx';
import { boot, setTab, setUi } from './store.ts';
import { resyncPush } from './push.ts';
import { LOCAL } from './config.ts';

registerSW({ immediate: true });

// Messages from the service worker: a reminder arrived, or a notification was tapped.
navigator.serviceWorker?.addEventListener('message', e => {
  if (e.data?.type === 'reminder') setUi({ notif: true });
  if (e.data?.type === 'open') setTab('morning', { notif: false, learnMsg: '' });
});

createRoot(document.getElementById('root')!).render(<App />);
boot().then(() => { if (!LOCAL) resyncPush(); });
