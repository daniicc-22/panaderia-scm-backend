import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { autorizarRoles } from '../middleware/autenticacion';
import { alcanceProveedores } from '../utils/alcance';
import { UUID } from '../utils/materiaPrima';
import { validarProveedorCrear, validarProveedorEditar } from '../utils/proveedor';

const ROLES_GESTION = ['administrador', 'superadministrador'];

export function crearRouterProveedores(prisma: PrismaClient) {
  const router = Router();
  // Los datos de contacto de proveedores son de gestión: el operario no los ve
  router.use(autorizarRoles(...ROLES_GESTION));

  const alcanceVisible = (panaderiaId: string) => alcanceProveedores(prisma, panaderiaId);

  router.get('/', async (req, res) => {
    try {
      const panaderiaId = req.panaderiaId!;
      const proveedores = await prisma.proveedor.findMany({
        where: { OR: await alcanceVisible(panaderiaId) },
        include: { _count: { select: { presentacion_proveedor: { where: { vigente: true } } } } },
        orderBy: { nombre: 'asc' },
      });
      res.json(
        proveedores.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          contacto: p.contacto,
          telefono: p.telefono,
          direccion: p.direccion,
          activo: p.activo,
          alcance: p.panaderia_id ? 'panaderia' : 'grupo',
          ofertas_vigentes: p._count.presentacion_proveedor,
        })),
      );
    } catch (error) {
      console.error('Error al consultar proveedores:', error);
      res.status(500).json({ error: 'Error al consultar los proveedores' });
    }
  });

  router.post('/', async (req, res) => {
    const validado = validarProveedorCrear(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const d = validado.datos;
    const panaderiaId = req.panaderiaId!;

    try {
      const repetido = await prisma.proveedor.findFirst({
        where: { OR: await alcanceVisible(panaderiaId), nombre: { equals: d.nombre, mode: 'insensitive' } },
        select: { id: true },
      });
      if (repetido) return res.status(409).json({ error: 'Ya existe un proveedor con ese nombre.' });

      // Siempre de la panadería del token (el grupo y la panadería nunca vienen del cuerpo)
      const creado = await prisma.proveedor.create({ data: { ...d, panaderia_id: panaderiaId } });
      res.status(201).json({ id: creado.id, nombre: creado.nombre });
    } catch (error) {
      console.error('Error al crear el proveedor:', error);
      res.status(500).json({ error: 'Error al crear el proveedor' });
    }
  });

  router.patch('/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const validado = validarProveedorEditar(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const cambios = validado.datos;
    const panaderiaId = req.panaderiaId!;

    try {
      const alcance = await alcanceVisible(panaderiaId);
      const actual = await prisma.proveedor.findFirst({ where: { id, OR: alcance } });
      if (!actual) return res.status(404).json({ error: 'Proveedor no encontrado.' });
      if (actual.panaderia_id !== panaderiaId) {
        return res.status(403).json({ error: 'Este proveedor es compartido del grupo y no se puede modificar desde aquí.' });
      }

      if (cambios.nombre !== undefined) {
        const repetido = await prisma.proveedor.findFirst({
          where: { OR: alcance, id: { not: id }, nombre: { equals: cambios.nombre, mode: 'insensitive' } },
          select: { id: true },
        });
        if (repetido) return res.status(409).json({ error: 'Ya existe un proveedor con ese nombre.' });
      }

      const estabaActivo = actual.activo;
      const actualizado = await prisma.proveedor.update({ where: { id }, data: { ...cambios, updated_at: new Date() } });

      // Al dar de baja se avisa cuántas ofertas dejan de contar en los costos
      let ofertasAfectadas: number | undefined;
      if (cambios.activo === false && estabaActivo) {
        ofertasAfectadas = await prisma.presentacion_proveedor.count({ where: { proveedor_id: id, vigente: true } });
      }
      res.json({
        id: actualizado.id,
        nombre: actualizado.nombre,
        activo: actualizado.activo,
        ...(ofertasAfectadas === undefined ? {} : { ofertas_afectadas: ofertasAfectadas }),
      });
    } catch (error) {
      console.error('Error al editar el proveedor:', error);
      res.status(500).json({ error: 'Error al editar el proveedor' });
    }
  });

  return router;
}
