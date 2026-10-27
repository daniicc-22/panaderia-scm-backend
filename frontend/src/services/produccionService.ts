import { httpClient } from './httpClient';
import type { PlanConsumo, ProduccionRegistrada } from '../types/inventario.types';
import type {
  BalanceMasas,
  DesviacionesPesaje,
  EstadoProduccion,
  PesoRealEnvio,
  ProduccionDetalle,
  ProduccionFinalizada,
  ProduccionResumen,
  TableroProduccion,
} from '../types/produccion.types';

export interface DatosProduccion {
  formulacion_id: string;
  lotes: number;
  // Insumos que se pesaron; el resto se toma «al ojo» con el peso de la receta
  pesos_reales?: PesoRealEnvio[];
}

export async function simularProduccion(datos: DatosProduccion): Promise<PlanConsumo> {
  const { data } = await httpClient.post<PlanConsumo>('/produccion/simular', datos);
  return data;
}

export async function registrarProduccion(datos: DatosProduccion): Promise<ProduccionRegistrada> {
  const { data } = await httpClient.post<ProduccionRegistrada>('/produccion', datos);
  return data;
}

export async function getProducciones(estado?: EstadoProduccion): Promise<ProduccionResumen[]> {
  const { data } = await httpClient.get<ProduccionResumen[]>('/produccion', { params: estado ? { estado } : undefined });
  return data;
}

export async function getProduccion(id: string): Promise<ProduccionDetalle> {
  const { data } = await httpClient.get<ProduccionDetalle>(`/produccion/${id}`);
  return data;
}

export async function finalizarProduccion(id: string, cantidad_producida: number): Promise<ProduccionFinalizada> {
  const { data } = await httpClient.post<ProduccionFinalizada>(`/produccion/${id}/finalizar`, { cantidad_producida });
  return data;
}

export async function getBalanceMasas(id: string): Promise<BalanceMasas> {
  const { data } = await httpClient.get<BalanceMasas>(`/produccion/${id}/balance`);
  return data;
}

export async function getDesviacionesPesaje(desde?: string, hasta?: string): Promise<DesviacionesPesaje> {
  const params: Record<string, string> = {};
  if (desde) params.desde = desde;
  if (hasta) params.hasta = hasta;
  const { data } = await httpClient.get<DesviacionesPesaje>('/produccion/desviaciones', { params });
  return data;
}

export async function getTableroProduccion(): Promise<TableroProduccion> {
  const { data } = await httpClient.get<TableroProduccion>('/produccion/tablero');
  return data;
}
