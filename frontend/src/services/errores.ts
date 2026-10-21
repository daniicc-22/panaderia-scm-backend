import axios from 'axios';

// Texto de error para mostrar al usuario: el mensaje del servidor si lo hay
export function mensajeDeError(error: unknown, porDefecto: string): string {
  if (axios.isAxiosError(error)) {
    const mensaje = (error.response?.data as { error?: unknown } | undefined)?.error;
    if (typeof mensaje === 'string' && mensaje.trim()) return mensaje;
    if (!error.response) return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  }
  return porDefecto;
}
