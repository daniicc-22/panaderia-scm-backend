import { httpClient } from './httpClient';

export interface HealthStatus {
  status: string;
  mensaje: string;
}

export async function getHealth(): Promise<HealthStatus> {
  const { data } = await httpClient.get<HealthStatus>('/health');
  return data;
}