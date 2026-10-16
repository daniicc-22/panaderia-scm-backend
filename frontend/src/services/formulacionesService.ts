import { httpClient } from './httpClient';
import type { FormulacionDetalle, FormulacionResumen } from '../types/formulacion.types';

export async function getFormulaciones(): Promise<FormulacionResumen[]> {
  const { data } = await httpClient.get<FormulacionResumen[]>('/formulaciones');
  return data;
}

export async function getFormulacion(id: string): Promise<FormulacionDetalle> {
  const { data } = await httpClient.get<FormulacionDetalle>(`/formulaciones/${id}`);
  return data;
}