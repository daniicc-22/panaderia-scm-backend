import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fuentes empaquetadas con la app: funcionan sin internet (PWA)
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import App from './App';
import { iniciarCapturaInstalacion } from './components/pwa/eventoInstalacion';
import './index.css';

// Se escucha desde el arranque: el aviso de instalación del navegador llega una sola vez
iniciarCapturaInstalacion();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
