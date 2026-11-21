import { httpClient } from './httpClient';
import type {
  CambiosParametros,
  ResultadoGuardarCorte,
  ResumenCorte,
  RespuestaExistenciasBajas,
  RespuestaParametros,
  RespuestaQueProducir,
  RespuestaRecomendaciones,
} from '../types/reposicion.types';

// Solo gestión (administrador): incluye dinero
export async function getRecomendaciones(): Promise<RespuestaRecomendaciones> {
  const { data } = await httpClient.get<RespuestaRecomendaciones>('/reposicion/recomendaciones');
  return data;
}

// EOQ clásico (cada insumo con el costo de pedir completo), para comparar en Análisis EOQ
export async function getRecomendacionesPorInsumo(): Promise<RespuestaRecomendaciones> {
  const { data } = await httpClient.get<RespuestaRecomendaciones>('/reposicion/recomendaciones', { params: { costo_pedido: 'por_insumo' } });
  return data;
}

export async function getParametrosReposicion(): Promise<RespuestaParametros> {
  const { data } = await httpClient.get<RespuestaParametros>('/reposicion/parametros');
  return data;
}

// Cambia solo los campos enviados; null borra el valor
export async function guardarParametros(materiaPrimaId: string, cambios: CambiosParametros) {
  const { data } = await httpClient.put(`/reposicion/parametros/${materiaPrimaId}`, cambios);
  return data;
}

// Sin dinero: lo ven todos los roles
export async function getExistenciasBajas(): Promise<RespuestaExistenciasBajas> {
  const { data } = await httpClient.get<RespuestaExistenciasBajas>('/produccion/existencias-bajas');
  return data;
}

export async function getQueProducir(): Promise<RespuestaQueProducir> {
  const { data } = await httpClient.get<RespuestaQueProducir>('/produccion/que-producir');
  return data;
}

// Guarda el corte del día en analisis_eoq (si ya había uno de hoy, lo reemplaza)
export async function guardarCorteEoq(): Promise<ResultadoGuardarCorte> {
  const { data } = await httpClient.post<ResultadoGuardarCorte>('/reposicion/calcular');
  return data;
}

export async function getCortesEoq(): Promise<ResumenCorte[]> {
  const { data } = await httpClient.get<{ cortes: ResumenCorte[] }>('/reposicion/cortes');
  return data.cortes;
}
