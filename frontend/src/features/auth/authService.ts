import axios from 'axios';
import { env } from '../../app/config/env';
import { httpClient } from '../../services/httpClient';
import { loginMock } from '../../mocks/auth.mock';
import type { Credenciales, SesionIniciada } from '../../types/auth.types';

/**
 * Capa de servicio de autenticación.
 * LoginPage y AuthContext NUNCA saben si estamos en modo mock o real:
 * esa decisión vive exclusivamente aquí, controlada por VITE_API_MODE.
 */
export async function login(credenciales: Credenciales): Promise<SesionIniciada> {
  if (env.apiMode === 'mock') {
    return loginMock(credenciales);
  }

  // Preparado para cuando exista POST /login en el backend real.
  // No implementado todavía: ese endpoint no existe (regla del proyecto:
  // no inventar endpoints que no están construidos).
  try {
    const { data } = await httpClient.post<SesionIniciada>('/login', credenciales);
    return data;
  } catch (err) {
    // Se muestra el mensaje claro del servidor en lugar del técnico de axios.
    if (axios.isAxiosError(err)) {
      if (!err.response) {
        throw new Error('No se pudo conectar con el servidor. Intenta de nuevo en un momento.');
      }
      const mensaje = (err.response.data as { error?: string } | undefined)?.error;
      if (err.response.status === 429) {
        throw new Error('Demasiados intentos. Espera unos minutos e intenta de nuevo.');
      }
      throw new Error(mensaje ?? 'No se pudo iniciar sesión.');
    }
    throw err;
  }
}