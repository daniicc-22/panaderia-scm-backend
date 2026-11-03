import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { UUID } from '../utils/materiaPrima';
import { CAUSAS_INICIALES, validarCrearPanaderia } from '../utils/panaderias';
import { ROL_SUPERADMIN, type DatosNuevoUsuario } from '../utils/usuarios';

const COSTO_BCRYPT = 10;

function esErrorDeUnicidad(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

// P2003: la base se negó a borrar porque otra tabla todavía apunta a la fila
function esErrorDeReferencia(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2003';
}

// Administración de panaderías. Se monta con verificarToken y autorizarRoles('superadministrador'):
// solo el superadministrador crea panaderías, y cada usuario que crea queda ligado únicamente a ella.
export function crearRouterPanaderias(prisma: PrismaClient) {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const filas = await prisma.panaderia.findMany({
        select: {
          id: true,
          nombre: true,
          ciudad: true,
          direccion: true,
          telefono: true,
          activa: true,
          usuario_panaderia: { where: { activo: true, usuario: { activo: true } }, select: { usuario_id: true } },
        },
        orderBy: [{ activa: 'desc' }, { nombre: 'asc' }],
      });
      res.json(
        filas.map((p: any) => ({
          id: p.id,
          nombre: p.nombre,
          ciudad: p.ciudad,
          direccion: p.direccion ?? null,
          telefono: p.telefono ?? null,
          activa: p.activa,
          usuarios_activos: p.usuario_panaderia.length,
        })),
      );
    } catch (error) {
      console.error('Error al consultar panaderías:', error);
      res.status(500).json({ error: 'Error al consultar las panaderías' });
    }
  });

  router.post('/', async (req, res) => {
    const resultado = validarCrearPanaderia(req.body);
    if ('error' in resultado) return res.status(400).json({ error: resultado.error });
    const { datos } = resultado;
    const nuevos: DatosNuevoUsuario[] = [datos.administrador, ...(datos.operario ? [datos.operario] : [])];

    try {
      if (await prisma.panaderia.findFirst({ where: { nombre: { equals: datos.nombre, mode: 'insensitive' } }, select: { id: true } })) {
        return res.status(409).json({ error: 'Ya existe una panadería con ese nombre.' });
      }
      for (const u of nuevos) {
        if (await prisma.usuario.findFirst({ where: { nombre_usuario: u.nombre_usuario }, select: { id: true } })) {
          return res.status(409).json({ error: `El usuario «${u.nombre_usuario}» ya existe. Elige otro.` });
        }
        if (u.email && (await prisma.usuario.findFirst({ where: { email: u.email }, select: { id: true } }))) {
          return res.status(409).json({ error: `El correo «${u.email}» ya está en uso.` });
        }
      }

      const [rolAdmin, rolOperario] = await Promise.all([
        prisma.rol.findFirst({ where: { codigo: 'administrador' } }),
        prisma.rol.findFirst({ where: { codigo: 'operario' } }),
      ]);
      if (!rolAdmin || (datos.operario && !rolOperario)) {
        return res.status(500).json({ error: 'Faltan los roles en el catálogo de la base de datos.' });
      }

      // El cifrado va antes de abrir la transacción para no mantenerla abierta mientras se calcula
      const hashes = await Promise.all(nuevos.map((u) => bcrypt.hash(u.password, COSTO_BCRYPT)));

      // Todo o nada: la panadería, su catálogo de causas y sus usuarios se crean juntos o no se crea nada
      const creada = await prisma.$transaction(async (tx) => {
        const panaderia = await tx.panaderia.create({
          data: { nombre: datos.nombre, ciudad: datos.ciudad ?? 'Pasto', direccion: datos.direccion, telefono: datos.telefono },
          select: { id: true, nombre: true, ciudad: true },
        });
        await tx.causa_desperdicio.createMany({
          data: CAUSAS_INICIALES.map((c) => ({ panaderia_id: panaderia.id, codigo: c.codigo, nombre: c.nombre, descripcion: c.descripcion })),
        });
        const usuarios: { nombre: string; nombre_usuario: string; rol: string }[] = [];
        for (let i = 0; i < nuevos.length; i++) {
          const u = nuevos[i];
          const rolId = u.rol === 'administrador' ? rolAdmin.id : rolOperario!.id;
          await tx.usuario.create({
            data: {
              nombre: u.nombre,
              nombre_usuario: u.nombre_usuario,
              email: u.email,
              password_hash: hashes[i],
              rol_id: rolId,
              activo: true,
              debe_cambiar_password: true,
              usuario_panaderia: { create: { panaderia_id: panaderia.id } },
            },
            select: { id: true },
          });
          usuarios.push({ nombre: u.nombre, nombre_usuario: u.nombre_usuario, rol: u.rol });
        }
        return { ...panaderia, usuarios };
      });

      res.status(201).json(creada);
    } catch (error) {
      if (esErrorDeUnicidad(error)) {
        return res.status(409).json({ error: 'Ya existe una panadería o un usuario con esos datos.' });
      }
      console.error('Error al crear panadería:', error);
      res.status(500).json({ error: 'Error al crear la panadería' });
    }
  });


  // Cuántas panaderías activas quedarían si esta dejara de estarlo. El superadministrador necesita al menos una.
  async function otrasActivas(id: string): Promise<number> {
    return prisma.panaderia.count({ where: { activa: true, id: { not: id } } });
  }

  // Activar o desactivar. Una panadería inactiva desaparece de la lista de elegir y sus usuarios no pueden entrar,
  // pero conserva todos sus datos. Es la salida para las panaderías que ya tienen movimientos y no se pueden borrar.
  router.patch('/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    if (typeof req.body?.activa !== 'boolean') return res.status(400).json({ error: 'El estado no es válido.' });
    try {
      const panaderia = await prisma.panaderia.findUnique({ where: { id }, select: { id: true, nombre: true, activa: true } });
      if (!panaderia) return res.status(404).json({ error: 'Panadería no encontrada.' });
      if (!req.body.activa && panaderia.activa && (await otrasActivas(id)) === 0) {
        return res.status(409).json({ error: 'No puedes desactivar la única panadería activa.' });
      }
      const actualizada = await prisma.panaderia.update({ where: { id }, data: { activa: req.body.activa }, select: { id: true, nombre: true, activa: true } });
      res.json(actualizada);
    } catch (error) {
      console.error('Error al cambiar el estado de la panadería:', error);
      res.status(500).json({ error: 'Error al cambiar el estado de la panadería' });
    }
  });

  // Eliminar de verdad. Solo se puede si la panadería no tiene datos de trabajo (materias primas, inventario,
  // producción, etc.): la base de datos lo impide y todo se deshace. Se borran sus usuarios que no pertenecen a
  // ninguna otra panadería y su catálogo de causas; nunca a un superadministrador.
  router.delete('/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    try {
      const panaderia = await prisma.panaderia.findUnique({ where: { id }, select: { id: true, nombre: true, activa: true } });
      if (!panaderia) return res.status(404).json({ error: 'Panadería no encontrada.' });
      if (panaderia.activa && (await otrasActivas(id)) === 0) {
        return res.status(409).json({ error: 'No puedes eliminar la única panadería activa.' });
      }

      await prisma.$transaction(async (tx) => {
        const asignados = await tx.usuario_panaderia.findMany({
          where: { panaderia_id: id },
          select: { usuario_id: true, usuario: { select: { rol: { select: { codigo: true } }, usuario_panaderia: { select: { panaderia_id: true } } } } },
        });
        const aBorrar = asignados
          .filter((a: any) => a.usuario.rol?.codigo !== ROL_SUPERADMIN && a.usuario.usuario_panaderia.every((x: any) => x.panaderia_id === id))
          .map((a: any) => a.usuario_id as string);

        await tx.usuario_panaderia.deleteMany({ where: { panaderia_id: id } });
        if (aBorrar.length > 0) await tx.usuario.deleteMany({ where: { id: { in: aBorrar } } });
        await tx.causa_desperdicio.deleteMany({ where: { panaderia_id: id } });
        await tx.panaderia.delete({ where: { id } });
      });

      res.json({ eliminada: panaderia.nombre });
    } catch (error) {
      if (esErrorDeReferencia(error)) {
        return res.status(409).json({
          error: 'Esta panadería ya tiene datos registrados (inventario, producción, proveedores u otros) y no se puede eliminar. Puedes desactivarla.',
        });
      }
      console.error('Error al eliminar la panadería:', error);
      res.status(500).json({ error: 'Error al eliminar la panadería' });
    }
  });

  return router;
}
