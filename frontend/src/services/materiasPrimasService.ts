import { httpClient } from './httpClient';
import type { MateriaPrima } from '../types/materiaPrima.types';

export async function getMateriasPrimas(): Promise<MateriaPrima[]> {
  const { data } = await httpClient.get<MateriaPrima[]>('/materias-primas');
  return data;
}