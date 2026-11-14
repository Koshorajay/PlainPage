import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/lexend/400.css';
import '@fontsource/lexend/600.css';
import '@fontsource/opendyslexic/400.css';
import '@fontsource/opendyslexic/700.css';
import './styles.css';
import { DEV_MOCK, IS_EXTENSION } from './platform';

async function boot() {
  // Development-only: stand-in for Chrome's on-device model (see src/dev/mockLanguageModel.ts).
  if (import.meta.env.DEV && DEV_MOCK) {
    const { installMockLanguageModel } = await import('./dev/mockLanguageModel');
    installMockLanguageModel();
  }

  const { default: App } = await import('./App');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  // Offline app shell for the hosted web app: with the on-device model,
  // PlainPage keeps working with no connection at all.
  if (!IS_EXTENSION && import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}

void boot();
