import { httpClient } from './httpClient';
import type { CambiosProveedor, DatosProveedor, EntregaProveedor, OfertasProveedor, Proveedor } from '../types/proveedor.types';

export async function getProveedores(): Promise<Proveedor[]> {
  const { data } = await httpClient.get<Proveedor[]>('/proveedores');
  return data;
}

export async function crearProveedor(datos: DatosProveedor) {
  const { data } = await httpClient.post<{ id: string; nombre: string }>('/proveedores', datos);
  return data;
}

export async function editarProveedor(id: string, cambios: CambiosProveedor) {
  const { data } = await httpClient.patch<{ id: string; nombre: string; activo: boolean; ofertas_afectadas?: number }>(
    `/proveedores/${id}`,
    cambios,
  );
  return data;
}

export async function getOfertasProveedor(id: string): Promise<OfertasProveedor> {
  const { data } = await httpClient.get<OfertasProveedor>(`/proveedores/${id}/ofertas`);
  return data;
}

// Reemplaza el calendario completo del proveedor (todos los campos; [] / null = sin definir)
export async function guardarEntregaProveedor(id: string, entrega: EntregaProveedor) {
  const { data } = await httpClient.put<EntregaProveedor & { id: string }>(`/proveedores/${id}/entrega`, entrega);
  return data;
}
