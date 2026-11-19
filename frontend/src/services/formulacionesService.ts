import { httpClient } from './httpClient';
import type {
  CambiosProducto,
  CostoHistorico,
  DatosProductoNuevo,
  DatosVersion,
  FormulacionDetalle,
  FormulacionResumen,
  HistorialVersiones,
  UsadoEn,
} from '../types/formulacion.types';

// Sin parámetros a propósito: TanStack Query le pasa un objeto de contexto a la función de consulta
export async function getFormulaciones(): Promise<FormulacionResumen[]> {
  const { data } = await httpClient.get<FormulacionResumen[]>('/formulaciones');
  return data;
}

// Para la gestión: también los productos dados de baja (el servidor solo lo permite al administrador)
export async function getFormulacionesConInactivos(): Promise<FormulacionResumen[]> {
  const { data } = await httpClient.get<FormulacionResumen[]>('/formulaciones', {
    params: { incluir_inactivos: true },
  });
  return data;
}

export async function getFormulacion(id: string): Promise<FormulacionDetalle> {
  const { data } = await httpClient.get<FormulacionDetalle>(`/formulaciones/${id}`);
  return data;
}

export async function getVersiones(id: string): Promise<HistorialVersiones> {
  const { data } = await httpClient.get<HistorialVersiones>(`/formulaciones/${id}/versiones`);
  return data;
}

export async function crearVersion(id: string, datos: DatosVersion) {
  const { data } = await httpClient.post<{ id: string; version: number }>(`/formulaciones/${id}/versiones`, datos);
  return data;
}

export async function crearProducto(datos: DatosProductoNuevo) {
  const { data } = await httpClient.post<{ id: string; producto_id: string; version: number }>('/formulaciones', datos);
  return data;
}

// Dar de baja, reactivar, renombrar o fijar el precio de venta del producto de una formulación
export async function cambiarProducto(id: string, cambios: CambiosProducto) {
  const { data } = await httpClient.patch<{ id: string; producto_id: string; producto: string; activo: boolean; precio_venta: number | null }>(
    `/formulaciones/${id}/producto`,
    cambios,
  );
  return data;
}

export const cambiarEstadoProducto = (id: string, activo: boolean) => cambiarProducto(id, { activo });

export async function getUsadoEn(id: string): Promise<UsadoEn> {
  const { data } = await httpClient.get<UsadoEn>(`/formulaciones/${id}/usado-en`);
  return data;
}

export async function getCostoHistorico(id: string, meses = 12): Promise<CostoHistorico> {
  const { data } = await httpClient.get<CostoHistorico>(`/formulaciones/${id}/costo-historico`, { params: { meses } });
  return data;
}
