import React from 'react';
import { createRoot } from 'react-dom/client';
import { CadencePanel } from './CadencePanel';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <CadencePanel />
    </React.StrictMode>
  );
}
