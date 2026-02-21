import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

function setFallbackContent(message: string, isError = false) {
  const fallback = document.getElementById('startup-fallback');
  if (!fallback) {
    return;
  }

  if (!isError) {
    fallback.textContent = message;
    fallback.style.display = 'flex';
    return;
  }

  fallback.innerHTML = `
    <div style="max-width: 640px; margin: 0 auto; border: 1px solid #fecaca; background: #ffffff; border-radius: 12px; padding: 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.08)">
      <h1 style="margin: 0 0 8px; color: #b91c1c; font-size: 20px; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;">Dashboard failed to start</h1>
      <p style="margin: 0 0 8px; color: #334155; font-size: 14px; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;">Open browser DevTools → Console and share the error below.</p>
      <pre style="margin: 0; white-space: pre-wrap; color: #991b1b; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${message}</pre>
    </div>
  `;
  fallback.style.display = 'flex';
}

function hideFallback() {
  const fallback = document.getElementById('startup-fallback');
  if (fallback) {
    fallback.style.display = 'none';
  }
}

window.addEventListener('error', (event) => {
  const message = event.error instanceof Error ? event.error.message : String(event.message);
  setFallbackContent(message, true);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  setFallbackContent(reason, true);
});

const startupTimeoutMs = 5000;
const timeoutId = window.setTimeout(() => {
  setFallbackContent(
    'Still loading… this usually means a startup script failed. Check DevTools Console for errors.',
    true
  );
}, startupTimeoutMs);

async function bootstrap() {
  try {
    const [{ default: App }, { default: ErrorBoundary }] = await Promise.all([
      import('./App.tsx'),
      import('./components/ErrorBoundary'),
    ]);

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    );

    window.clearTimeout(timeoutId);
    hideFallback();
  } catch (error) {
    window.clearTimeout(timeoutId);
    const message = error instanceof Error ? error.message : String(error);
    setFallbackContent(message, true);
  }
}

bootstrap();
