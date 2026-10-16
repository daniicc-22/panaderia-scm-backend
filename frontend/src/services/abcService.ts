import { httpClient } from './httpClient';
import type { RespuestaAbc } from '../types/abc.types';

export async function getClasificacionAbc(): Promise<RespuestaAbc> {
  const { data } = await httpClient.get<RespuestaAbc>('/abc');
  return data;
}