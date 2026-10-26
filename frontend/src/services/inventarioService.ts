import { httpClient } from './httpClient';
import type {
  AlertasVencimiento,
  CorreccionLote,
  VencimientoCorregido,
  DatosEntrada,
  EntradaRegistrada,
  Inventario,
  LotesMateria,
  OpcionesEntrada,
} from '../types/inventario.types';

export async function getInventario(): Promise<Inventario> {
  const { data } = await httpClient.get<Inventario>('/inventario');
  return data;
}

export async function getLotesMateria(materiaId: string): Promise<LotesMateria> {
  const { data } = await httpClient.get<LotesMateria>(`/inventario/materias-primas/${materiaId}/lotes`);
  return data;
}

export async function getOpcionesEntrada(): Promise<OpcionesEntrada> {
  const { data } = await httpClient.get<OpcionesEntrada>('/inventario/opciones-entrada');
  return data;
}

export async function registrarEntrada(datos: DatosEntrada): Promise<EntradaRegistrada> {
  const { data } = await httpClient.post<EntradaRegistrada>('/inventario/entradas', datos);
  return data;
}

export async function getAlertasVencimiento(): Promise<AlertasVencimiento> {
  const { data } = await httpClient.get<AlertasVencimiento>('/inventario/alertas');
  return data;
}

export interface DatosCorreccion {
  cantidad_nueva: number;
  motivo: string;
  observaciones?: string;
}

// Solo administradores: deja un ajuste con su motivo en el historial del lote
export async function corregirLote(loteId: string, datos: DatosCorreccion): Promise<CorreccionLote> {
  const { data } = await httpClient.post<CorreccionLote>(`/inventario/lotes/${loteId}/correccion`, datos);
  return data;
}

// Solo administradores. null quita la fecha (no se permite en insumos que se manejan por vencimiento)
export async function corregirVencimiento(loteId: string, fecha: string | null): Promise<VencimientoCorregido> {
  const { data } = await httpClient.patch<VencimientoCorregido>(`/inventario/lotes/${loteId}/vencimiento`, { fecha_vencimiento: fecha });
  return data;
}
