import axios from 'axios';
import { env } from '../app/config/env';
import { borrarPanaderiaActiva, leerPanaderiaActiva } from './panaderiaActiva';

export const httpClient = axios.create({
  baseURL: env.apiUrl,
  timeout: 10000,
});

// Interceptor de requests: preparado para adjuntar el token de sesión.
// Hoy no existe un JWT real (el backend no tiene /login todavía), así que
// solo se adjunta si hay un token guardado en localStorage.
httpClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('panaderia_token');
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  // Panadería elegida por el superadministrador. El backend solo la usa para ese rol.
  const panaderiaId = leerPanaderiaActiva();
  if (panaderiaId) {
    config.params = { panaderiaId, ...config.params };
  }
  return config;
});

// Interceptor de responses: manejo centralizado de errores de sesión.
// Preparado para cuando el backend implemente autenticación real.
httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Sesión inválida o expirada: se limpia localmente.
      // La redirección a /login la hace ProtectedRoute al detectar que ya no hay sesión.
      localStorage.removeItem('panaderia_token');
    }
    // La panadería elegida ya no existe o se desactivó: se vuelve a la predeterminada
    if (error.response?.status === 404 && error.response?.data?.error === 'No hay panadería disponible' && leerPanaderiaActiva()) {
      borrarPanaderiaActiva();
      window.location.reload();
    }
    return Promise.reject(error);
  },
);