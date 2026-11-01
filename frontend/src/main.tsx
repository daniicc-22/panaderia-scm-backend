import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fuentes empaquetadas con la app: funcionan sin internet (PWA)
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
