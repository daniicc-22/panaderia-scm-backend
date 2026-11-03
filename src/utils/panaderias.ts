// Reglas para crear una panadería nueva con sus primeros usuarios. Funciones puras: no tocan la base de datos.
import { ROL_ADMIN, ROL_OPERARIO, ROL_SUPERADMIN, validarCrearUsuario, type DatosNuevoUsuario } from './usuarios';

// Catálogo inicial de causas de merma de toda panadería nueva (el mismo acordado con el piloto el 25/10/2026,
// que el script prisma/sql/2026-10-26_mermas.sql carga en las panaderías que ya existían)
export const CAUSAS_INICIALES = [
  { codigo: 'vencimiento', nombre: 'Vencimiento', descripcion: 'El insumo o producto superó su fecha de vencimiento' },
  { codigo: 'derrame', nombre: 'Derrame o caída', descripcion: 'Se derramó, se cayó o se ensució durante el manejo' },
  { codigo: 'quemado', nombre: 'Quemado o sobrehorneado', descripcion: 'Se pasó de cocción o de temperatura en el horno' },
  { codigo: 'error_dosificacion', nombre: 'Error de dosificación', descripcion: 'Se pesó o se agregó mal un insumo y la masa no sirvió' },
  { codigo: 'masa_pasada', nombre: 'Masa pasada', descripcion: 'La masa fermentó de más o se dejó reposar demasiado' },
  { codigo: 'devolucion', nombre: 'Devolución', descripcion: 'Producto o insumo devuelto que no se puede reutilizar' },
  { codigo: 'otra', nombre: 'Otra', descripcion: 'Causa distinta a las anteriores' },
] as const;

export interface DatosNuevaPanaderia {
  nombre: string;
  ciudad: string | null;
  direccion: string | null;
  telefono: string | null;
  administrador: DatosNuevoUsuario;
  operario: DatosNuevoUsuario | null;
}

function textoOpcional(valor: unknown, maximo: number, etiqueta: string): { error: string } | { valor: string | null } {
  if (valor === undefined || valor === null) return { valor: null };
  if (typeof valor !== 'string') return { error: `${etiqueta} no es válido.` };
  const limpio = valor.trim();
  if (limpio.length > maximo) return { error: `${etiqueta} no puede tener más de ${maximo} caracteres.` };
  return { valor: limpio === '' ? null : limpio };
}

// Valida el cuerpo de «crear panadería». Solo el superadministrador llega aquí, por eso los usuarios se validan con su rol.
export function validarCrearPanaderia(cuerpo: any): { error: string } | { datos: DatosNuevaPanaderia } {
  const nombre = typeof cuerpo?.nombre === 'string' ? cuerpo.nombre.trim() : '';
  if (!nombre) return { error: 'El nombre de la panadería es obligatorio.' };
  if (nombre.length > 100) return { error: 'El nombre de la panadería no puede tener más de 100 caracteres.' };

  const ciudad = textoOpcional(cuerpo?.ciudad, 60, 'La ciudad');
  if ('error' in ciudad) return ciudad;
  const direccion = textoOpcional(cuerpo?.direccion, 150, 'La dirección');
  if ('error' in direccion) return direccion;
  const telefono = textoOpcional(cuerpo?.telefono, 30, 'El teléfono');
  if ('error' in telefono) return telefono;

  if (!cuerpo?.administrador || typeof cuerpo.administrador !== 'object') {
    return { error: 'Indica el administrador de la panadería.' };
  }
  const admin = validarCrearUsuario({ ...cuerpo.administrador, rol: ROL_ADMIN }, ROL_SUPERADMIN);
  if ('error' in admin) return { error: `Administrador: ${admin.error}` };

  let operario: DatosNuevoUsuario | null = null;
  if (cuerpo.operario !== undefined && cuerpo.operario !== null) {
    if (typeof cuerpo.operario !== 'object') return { error: 'Los datos del operario no son válidos.' };
    const oper = validarCrearUsuario({ ...cuerpo.operario, rol: ROL_OPERARIO }, ROL_SUPERADMIN);
    if ('error' in oper) return { error: `Operario: ${oper.error}` };
    operario = oper.datos;
  }

  if (operario && operario.nombre_usuario === admin.datos.nombre_usuario) {
    return { error: 'El administrador y el operario deben tener usuarios distintos.' };
  }
  if (operario && operario.email && operario.email === admin.datos.email) {
    return { error: 'El administrador y el operario deben tener correos distintos.' };
  }

  return {
    datos: {
      nombre,
      ciudad: ciudad.valor,
      direccion: direccion.valor,
      telefono: telefono.valor,
      administrador: admin.datos,
      operario,
    },
  };
}
