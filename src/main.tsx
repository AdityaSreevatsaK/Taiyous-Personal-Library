import React from 'react';

// The design lab exists only in the cloud-disabled visual preview build.
const LayoutLab = React.lazy(() => import('./design/layouts/LayoutLab'));
const showLab = import.meta.env.VITE_DESIGN_PREVIEW === 'true' &&
  window.location.pathname.startsWith('/layouts');
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
// Deliberately after legacy layout rules: visual-only design tokens and skins.
import './design/foundation.css';
import { registerOfflineApp } from './lib/offline';

registerOfflineApp();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {showLab
      ? <React.Suspense fallback={<p style={{padding:24}}>Opening design gallery…</p>}><LayoutLab /></React.Suspense>
      : <App />}
  </React.StrictMode>,
);
