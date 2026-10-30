import { httpClient } from './httpClient';
import type { FuenteAbc, RespuestaAbc } from '../types/abc.types';

export async function getClasificacionAbc(fuente: FuenteAbc = 'estimada'): Promise<RespuestaAbc> {
  const { data } = await httpClient.get<RespuestaAbc>('/abc', { params: { fuente } });
  return data;
}