import axios from 'axios';
import { httpClient } from './httpClient';
import type {
  DatosLineaConteo,
  DetalleConteo,
  ListaConteos,
  LotesContables,
  PideMotivo,
} from '../types/conteo.types';

export async function getConteos(): Promise<ListaConteos> {
  const { data } = await httpClient.get<ListaConteos>('/conteos');
  return data;
}

export async function getConteo(id: string): Promise<DetalleConteo> {
  const { data } = await httpClient.get<DetalleConteo>(`/conteos/${id}`);
  return data;
}

export async function getLotesPorContar(id: string): Promise<LotesContables> {
  const { data } = await httpClient.get<LotesContables>(`/conteos/${id}/lotes`);
  return data;
}

export async function abrirConteo(observaciones?: string): Promise<{ id: string; numero: number }> {
  const { data } = await httpClient.post<{ id: string; numero: number }>('/conteos', { observaciones });
  return data;
}

export async function guardarLinea(id: string, datos: DatosLineaConteo): Promise<DetalleConteo> {
  const { data } = await httpClient.put<DetalleConteo>(`/conteos/${id}/lineas`, datos);
  return data;
}

export async function quitarLinea(id: string, loteId: string): Promise<DetalleConteo> {
  const { data } = await httpClient.delete<DetalleConteo>(`/conteos/${id}/lineas/${loteId}`);
  return data;
}

export async function eliminarConteo(id: string): Promise<void> {
  await httpClient.delete(`/conteos/${id}`);
}

type Accion = 'enviar' | 'devolver' | 'descartar' | 'aplicar';

export async function accionConteo(id: string, accion: Accion): Promise<DetalleConteo> {
  const { data } = await httpClient.post<DetalleConteo>(`/conteos/${id}/${accion}`);
  return data;
}

// Si el servidor responde que falta el motivo de una diferencia, devuelve los datos para mostrarlo
export function comoPideMotivo(error: unknown): PideMotivo | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 400) return null;
  const d = error.response.data as Partial<PideMotivo> | undefined;
  if (d?.requiere_motivo === true && typeof d.cantidad_sistema === 'number' && typeof d.diferencia === 'number') {
    return { requiere_motivo: true, cantidad_sistema: d.cantidad_sistema, diferencia: d.diferencia, error: String(d.error ?? '') };
  }
  return null;
}
