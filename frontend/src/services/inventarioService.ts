import { httpClient } from './httpClient';
import type {
  DatosEntrada,
  EntradaRegistrada,
  Inventario,
  LotesMateria,
  OpcionesEntrada,
} from '../types/inventario.types';

export async function getInventario(): Promise<Inventario> {
  const { data } = await httpClient.get<Inventario>('/inventario');
  return data;
}

export async function getLotesMateria(materiaId: string): Promise<LotesMateria> {
  const { data } = await httpClient.get<LotesMateria>(`/inventario/materias-primas/${materiaId}/lotes`);
  return data;
}

export async function getOpcionesEntrada(): Promise<OpcionesEntrada> {
  const { data } = await httpClient.get<OpcionesEntrada>('/inventario/opciones-entrada');
  return data;
}

export async function registrarEntrada(datos: DatosEntrada): Promise<EntradaRegistrada> {
  const { data } = await httpClient.post<EntradaRegistrada>('/inventario/entradas', datos);
  return data;
}
