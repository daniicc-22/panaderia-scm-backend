import { httpClient } from './httpClient';

export interface MiPanaderia {
  id: string;
  nombre: string;
}

export async function getMiPanaderia(): Promise<MiPanaderia> {
  const { data } = await httpClient.get<MiPanaderia>('/mi-panaderia');
  return data;
}