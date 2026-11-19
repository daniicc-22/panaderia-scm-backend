import { httpClient } from './httpClient';
import type { PreciosMateria } from '../types/precios.types';

export async function getPreciosMateria(materiaId: string): Promise<PreciosMateria> {
  const { data } = await httpClient.get<PreciosMateria>(`/precios/materias-primas/${materiaId}`);
  return data;
}

export async function crearPresentacion(materiaId: string, datos: { nombre: string; contenido: number }) {
  const { data } = await httpClient.post(`/precios/materias-primas/${materiaId}/presentaciones`, datos);
  return data;
}

export async function editarPresentacion(
  id: string,
  cambios: { nombre?: string; contenido?: number; activa?: boolean },
) {
  const { data } = await httpClient.patch(`/precios/presentaciones/${id}`, cambios);
  return data;
}

export async function crearOferta(
  presentacionId: string,
  datos: { proveedor_id: string; precio_referencia: number; tiempo_entrega_dias?: number | null },
) {
  const { data } = await httpClient.post(`/precios/presentaciones/${presentacionId}/ofertas`, datos);
  return data;
}

export async function editarOferta(
  id: string,
  cambios: { precio_referencia?: number; tiempo_entrega_dias?: number | null; vigente?: boolean },
) {
  const { data } = await httpClient.patch(`/precios/ofertas/${id}`, cambios);
  return data;
}

export async function getHistorialCostos(meses = 12): Promise<import('../types/precios.types').HistorialCostos> {
  const { data } = await httpClient.get('/precios/historial', { params: { meses } });
  return data;
}
