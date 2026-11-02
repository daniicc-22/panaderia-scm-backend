import { httpClient } from './httpClient';
import type { NuevaPanaderia, PanaderiaCreada, PanaderiaResumen } from '../types/panaderia.types';

export async function getPanaderias(): Promise<PanaderiaResumen[]> {
  const { data } = await httpClient.get<PanaderiaResumen[]>('/panaderias');
  return data;
}

export async function crearPanaderia(datos: NuevaPanaderia): Promise<PanaderiaCreada> {
  const { data } = await httpClient.post<PanaderiaCreada>('/panaderias', datos);
  return data;
}

export async function cambiarEstadoPanaderia(id: string, activa: boolean): Promise<{ id: string; nombre: string; activa: boolean }> {
  const { data } = await httpClient.patch<{ id: string; nombre: string; activa: boolean }>(`/panaderias/${id}`, { activa });
  return data;
}

export async function eliminarPanaderia(id: string): Promise<{ eliminada: string }> {
  const { data } = await httpClient.delete<{ eliminada: string }>(`/panaderias/${id}`);
  return data;
}
