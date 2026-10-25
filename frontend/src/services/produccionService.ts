import { httpClient } from './httpClient';
import type { PlanConsumo, ProduccionRegistrada } from '../types/inventario.types';

export interface DatosProduccion {
  formulacion_id: string;
  lotes: number;
}

export async function simularProduccion(datos: DatosProduccion): Promise<PlanConsumo> {
  const { data } = await httpClient.post<PlanConsumo>('/produccion/simular', datos);
  return data;
}

export async function registrarProduccion(datos: DatosProduccion): Promise<ProduccionRegistrada> {
  const { data } = await httpClient.post<ProduccionRegistrada>('/produccion', datos);
  return data;
}
