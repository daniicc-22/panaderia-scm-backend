import { httpClient } from './httpClient';
import type { Rol } from '../types/roles.types';

export async function getRoles(): Promise<Rol[]> {
  const { data } = await httpClient.get<Rol[]>('/roles');
  return data;
}