import { httpClient } from './httpClient';
import type { CausaMerma, DatosMerma, EtapaMerma, MermaRegistrada, MermaResumen } from '../types/merma.types';

export async function getCausasMerma(): Promise<CausaMerma[]> {
  const { data } = await httpClient.get<CausaMerma[]>('/mermas/causas');
  return data;
}

export async function getMermas(etapa?: EtapaMerma): Promise<MermaResumen[]> {
  const { data } = await httpClient.get<MermaResumen[]>('/mermas', { params: etapa ? { etapa } : undefined });
  return data;
}

export async function registrarMerma(datos: DatosMerma): Promise<MermaRegistrada> {
  const { data } = await httpClient.post<MermaRegistrada>('/mermas', datos);
  return data;
}
