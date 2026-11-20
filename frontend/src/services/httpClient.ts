import axios from 'axios';
import { env } from '../app/config/env';

// Aviso a la sesión de la pantalla: el servidor dejó de aceptar el token (venció o el usuario se desactivó)
export const EVENTO_SESION_EXPIRADA = 'panaderia:sesion-expirada';

export const httpClient = axios.create({
  baseURL: env.apiUrl,
  // 30 s: el servidor gratuito de Render tarda en despertar tras un rato sin uso
  timeout: 30000,
});

// Interceptor de requests: preparado para adjuntar el token de sesión.
// Hoy no existe un JWT real (el backend no tiene /login todavía), así que
// solo se adjunta si hay un token guardado en localStorage.
httpClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('panaderia_token');
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

// Interceptor de responses: manejo centralizado de errores de sesión.
// Preparado para cuando el backend implemente autenticación real.
httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // /login y /cuenta responden 401 por una contraseña equivocada, no por una sesión vencida
      const url = String(error.config?.url ?? '');
      const esCredencial = url.startsWith('/login') || url.startsWith('/cuenta');
      if (!esCredencial && localStorage.getItem('panaderia_token')) {
        // Sesión inválida o vencida: se limpia y se avisa para que la pantalla vuelva al inicio de sesión
        localStorage.removeItem('panaderia_token');
        window.dispatchEvent(new Event(EVENTO_SESION_EXPIRADA));
      }
    }
    return Promise.reject(error);
  },
);