import { httpClient } from './httpClient';

export interface CambioContrasena {
  actual: string;
  nueva: string;
}

// Cambia la contraseña del usuario que tiene la sesión abierta
export async function cambiarContrasena(datos: CambioContrasena): Promise<void> {
  await httpClient.post('/cuenta/contrasena', datos);
}
