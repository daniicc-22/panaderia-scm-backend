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
  const { data } = await httpClient.post<SesionIniciada>('/login', credenciales);
  return data;
}