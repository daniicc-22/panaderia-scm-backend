import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { UUID } from '../utils/materiaPrima';
import { ROL_SUPERADMIN, puedeAdministrar, validarContrasena, validarCrearUsuario } from '../utils/usuarios';

// Costo de bcrypt: el mismo orden que el de los usuarios ya creados
const COSTO_BCRYPT = 10;

function esErrorDeUnicidad(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

function aRespuesta(u: any) {
  return {
    id: u.id,
    nombre: u.nombre,
    nombre_usuario: u.nombre_usuario ?? null,
    email: u.email ?? null,
    rol: u.rol?.codigo ?? null,
    activo: u.activo,
    debe_cambiar_password: u.debe_cambiar_password,
  };
}

const SELECCION = {
  id: true,
  nombre: true,
  nombre_usuario: true,
  email: true,
  activo: true,
  debe_cambiar_password: true,
  rol: { select: { codigo: true } },
} as const;

// Administración de usuarios de una panadería. Se monta con verificarToken, resolverPanaderia y
// autorizarRoles('administrador', 'superadministrador'): el operario nunca llega aquí.
//  - El administrador crea y administra operarios de SU panadería.
//  - El superadministrador crea y administra administradores y operarios de la panadería que indique (?panaderiaId=).
export function crearRouterUsuarios(prisma: PrismaClient) {
  const router = Router();

  // Panaderías disponibles (para que el superadministrador elija a cuál asignar)
  router.get('/panaderias', async (req, res) => {
    if (req.usuario!.rol !== ROL_SUPERADMIN) {
      return res.status(403).json({ error: 'No tienes permiso para realizar esta acción' });
    }
    try {
      const panaderias = await prisma.panaderia.findMany({
        where: { activa: true },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      });
      res.json(panaderias);
    } catch (error) {
      console.error('Error al consultar panaderías:', error);
      res.status(500).json({ error: 'Error al consultar las panaderías' });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const filas = await prisma.usuario.findMany({
        where: { usuario_panaderia: { some: { panaderia_id: req.panaderiaId!, activo: true } } },
        select: SELECCION,
        orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
      });
      res.json(filas.map(aRespuesta));
    } catch (error) {
      console.error('Error al consultar usuarios:', error);
      res.status(500).json({ error: 'Error al consultar los usuarios' });
    }
  });

  router.post('/', async (req, res) => {
    const resultado = validarCrearUsuario(req.body, req.usuario!.rol);
    if ('error' in resultado) return res.status(400).json({ error: resultado.error });
    const { datos } = resultado;

    try {
      const rol = await prisma.rol.findFirst({ where: { codigo: datos.rol as 'administrador' | 'operario' } });
      if (!rol) return res.status(400).json({ error: 'El rol indicado no existe.' });

      if (await prisma.usuario.findFirst({ where: { nombre_usuario: datos.nombre_usuario }, select: { id: true } })) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese nombre de usuario.' });
      }
      if (datos.email && (await prisma.usuario.findFirst({ where: { email: datos.email }, select: { id: true } }))) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
      }

      const password_hash = await bcrypt.hash(datos.password, COSTO_BCRYPT);
      // Una sola escritura anidada: el usuario y su asignación a la panadería se crean juntos o no se crean
      const creado = await prisma.usuario.create({
        data: {
          nombre: datos.nombre,
          nombre_usuario: datos.nombre_usuario,
          email: datos.email,
          password_hash,
          rol_id: rol.id,
          activo: true,
          debe_cambiar_password: true,
          usuario_panaderia: { create: { panaderia_id: req.panaderiaId! } },
        },
        select: SELECCION,
      });
      res.status(201).json(aRespuesta(creado));
    } catch (error) {
      if (esErrorDeUnicidad(error)) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese nombre de usuario o correo.' });
      }
      console.error('Error al crear usuario:', error);
      res.status(500).json({ error: 'Error al crear el usuario' });
    }
  });

  // Carga al usuario objetivo solo si pertenece a la panadería actual y su rol es administrable por quien pide
  async function cargarObjetivo(req: any, res: any) {
    const id = String(req.params.id);
    if (!UUID.test(id)) {
      res.status(400).json({ error: 'Identificador no válido.' });
      return null;
    }
    const objetivo: any = await prisma.usuario.findFirst({
      where: { id, usuario_panaderia: { some: { panaderia_id: req.panaderiaId } } },
      select: SELECCION,
    });
    if (!objetivo) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return null;
    }
    if (!puedeAdministrar(req.usuario.rol, objetivo.rol.codigo)) {
      res.status(403).json({ error: 'No tienes permiso para administrar a este usuario.' });
      return null;
    }
    return objetivo;
  }

  // Activar o desactivar y corregir el nombre
  router.patch('/:id', async (req, res) => {
    try {
      const objetivo = await cargarObjetivo(req, res);
      if (!objetivo) return;

      const data: Record<string, unknown> = {};
      if (req.body?.activo !== undefined) {
        if (typeof req.body.activo !== 'boolean') return res.status(400).json({ error: 'El estado no es válido.' });
        data.activo = req.body.activo;
      }
      if (req.body?.nombre !== undefined) {
        const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
        if (!nombre || nombre.length > 100) return res.status(400).json({ error: 'El nombre no es válido.' });
        data.nombre = nombre;
      }
      if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No hay cambios para guardar.' });

      const actualizado = await prisma.usuario.update({ where: { id: objetivo.id }, data, select: SELECCION });
      res.json(aRespuesta(actualizado));
    } catch (error) {
      console.error('Error al actualizar usuario:', error);
      res.status(500).json({ error: 'Error al actualizar el usuario' });
    }
  });

  // Restablecer la contraseña: quien administra pone una nueva y el usuario debe cambiarla al entrar
  router.post('/:id/contrasena', async (req, res) => {
    try {
      const objetivo = await cargarObjetivo(req, res);
      if (!objetivo) return;

      const errorClave = validarContrasena(req.body?.password, { nombreUsuario: objetivo.nombre_usuario });
      if (errorClave) return res.status(400).json({ error: errorClave });

      const password_hash = await bcrypt.hash(req.body.password, COSTO_BCRYPT);
      await prisma.usuario.update({
        where: { id: objetivo.id },
        data: { password_hash, debe_cambiar_password: true },
      });
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al restablecer la contraseña:', error);
      res.status(500).json({ error: 'Error al restablecer la contraseña' });
    }
  });

  return router;
}
