import { httpClient } from './httpClient';
import type { NuevoUsuario, PanaderiaOpcion, UsuarioPanaderia } from '../types/usuario.types';

// El superadministrador indica a qué panadería se refiere con ?panaderiaId=; el administrador siempre usa la suya
const conPanaderia = (panaderiaId?: string) => (panaderiaId ? { params: { panaderiaId } } : undefined);

export async function getUsuarios(panaderiaId?: string): Promise<UsuarioPanaderia[]> {
  const { data } = await httpClient.get<UsuarioPanaderia[]>('/usuarios', conPanaderia(panaderiaId));
  return data;
}

export async function getPanaderiasDisponibles(): Promise<PanaderiaOpcion[]> {
  const { data } = await httpClient.get<PanaderiaOpcion[]>('/usuarios/panaderias');
  return data;
}

export async function crearUsuario(datos: NuevoUsuario, panaderiaId?: string): Promise<UsuarioPanaderia> {
  const { data } = await httpClient.post<UsuarioPanaderia>('/usuarios', datos, conPanaderia(panaderiaId));
  return data;
}

export async function cambiarEstadoUsuario(id: string, activo: boolean, panaderiaId?: string): Promise<UsuarioPanaderia> {
  const { data } = await httpClient.patch<UsuarioPanaderia>(`/usuarios/${id}`, { activo }, conPanaderia(panaderiaId));
  return data;
}

export async function restablecerContrasena(id: string, password: string, panaderiaId?: string): Promise<void> {
  await httpClient.post(`/usuarios/${id}/contrasena`, { password }, conPanaderia(panaderiaId));
}
