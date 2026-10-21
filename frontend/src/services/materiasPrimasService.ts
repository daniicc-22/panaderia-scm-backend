import { httpClient } from './httpClient';
import type {
  CambiosMateriaPrima,
  CatalogosMateriaPrima,
  DatosNuevaMateriaPrima,
  MateriaPrima,
} from '../types/materiaPrima.types';

// Sin parámetros a propósito: TanStack Query le pasa un objeto de contexto a la función de consulta
export async function getMateriasPrimas(): Promise<MateriaPrima[]> {
  const { data } = await httpClient.get<MateriaPrima[]>('/materias-primas');
  return data;
}

// Para la pantalla de gestión: también las dadas de baja (el servidor solo lo permite al administrador)
export async function getMateriasPrimasConInactivas(): Promise<MateriaPrima[]> {
  const { data } = await httpClient.get<MateriaPrima[]>('/materias-primas', {
    params: { incluir_inactivas: true },
  });
  return data;
}

export async function getCatalogosMateriaPrima(): Promise<CatalogosMateriaPrima> {
  const { data } = await httpClient.get<CatalogosMateriaPrima>('/materias-primas/catalogos');
  return data;
}

export async function crearMateriaPrima(datos: DatosNuevaMateriaPrima) {
  const { data } = await httpClient.post<{ id: string; codigo: string; nombre: string }>('/materias-primas', datos);
  return data;
}

export async function editarMateriaPrima(id: string, cambios: CambiosMateriaPrima) {
  const { data } = await httpClient.patch<{ id: string; codigo: string; nombre: string; activa: boolean }>(
    `/materias-primas/${id}`,
    cambios,
  );
  return data;
}
