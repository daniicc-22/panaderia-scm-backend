import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { autorizarRoles } from '../middleware/autenticacion';
import { alcanceProveedores } from '../utils/alcance';
import { UUID } from '../utils/materiaPrima';
import { elegirPrecio, ofertaCuenta } from '../utils/precios';
import {
  validarOfertaCrear,
  validarOfertaEditar,
  validarPresentacionCrear,
  validarPresentacionEditar,
} from '../utils/precioValidacion';

const ROLES_GESTION = ['administrador', 'superadministrador'];

export function crearRouterPrecios(prisma: PrismaClient) {
  const router = Router();
  // Los precios son datos de costo: solo gestión
  router.use(autorizarRoles(...ROLES_GESTION));

  // Presentaciones y ofertas de una materia prima, con el precio que hoy cuenta para los costos
  router.get('/materias-primas/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    try {
      const materia = await prisma.materia_prima.findFirst({
        where: { id, panaderia_id: req.panaderiaId! },
        include: {
          unidad_medida: true,
          presentacion: {
            include: { presentacion_proveedor: { include: { proveedor: { select: { nombre: true, activo: true } } } } },
          },
        },
      });
      if (!materia) return res.status(404).json({ error: 'Materia prima no encontrada.' });

      const presentaciones = materia.presentacion.map((p) => ({
        id: p.id,
        contenido: Number(p.contenido),
        activa: p.activa,
        ofertas: p.presentacion_proveedor.map((o) => ({
          id: o.id,
          precio: Number(o.precio_referencia),
          vigente: o.vigente,
          proveedor_activo: o.proveedor.activo,
        })),
      }));
      const elegido = elegirPrecio(presentaciones);

      res.json({
        materia: { id: materia.id, codigo: materia.codigo, nombre: materia.nombre, unidad: materia.unidad_medida.codigo },
        precio_aplicado: elegido
          ? {
              presentacion_id: elegido.presentacion_id,
              oferta_id: elegido.oferta_id,
              precio: elegido.precio,
              costo_por_unidad_base: elegido.costo_por_unidad_base,
            }
          : null,
        presentaciones: [...materia.presentacion]
          .sort((a, b) => Number(b.contenido) - Number(a.contenido))
          .map((p) => ({
            id: p.id,
            nombre: p.nombre,
            contenido: Number(p.contenido),
            activa: p.activa,
            ofertas: p.presentacion_proveedor
              .map((o) => {
                const precio = Number(o.precio_referencia);
                const contenido = Number(p.contenido);
                return {
                  id: o.id,
                  proveedor_id: o.proveedor_id,
                  proveedor: o.proveedor.nombre,
                  proveedor_activo: o.proveedor.activo,
                  precio,
                  tiempo_entrega_dias: o.tiempo_entrega_dias === null ? null : Number(o.tiempo_entrega_dias),
                  vigente: o.vigente,
                  cuenta: ofertaCuenta({ id: o.id, precio, vigente: o.vigente, proveedor_activo: o.proveedor.activo }),
                  costo_por_unidad_base: contenido > 0 ? precio / contenido : null,
                };
              })
              .sort((a, b) => a.precio - b.precio),
          })),
      });
    } catch (error) {
      console.error('Error al consultar los precios:', error);
      res.status(500).json({ error: 'Error al consultar los precios' });
    }
  });

  // Nueva presentación: la unidad del contenido es siempre la unidad base de la materia prima
  router.post('/materias-primas/:id/presentaciones', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const validado = validarPresentacionCrear(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const d = validado.datos;
    const panaderiaId = req.panaderiaId!;

    try {
      const materia = await prisma.materia_prima.findFirst({ where: { id, panaderia_id: panaderiaId } });
      if (!materia) return res.status(404).json({ error: 'Materia prima no encontrada.' });

      const repetida = await prisma.presentacion.findFirst({
        where: { materia_prima_id: id, panaderia_id: panaderiaId, nombre: { equals: d.nombre, mode: 'insensitive' } },
        select: { id: true },
      });
      if (repetida) return res.status(409).json({ error: 'Esta materia prima ya tiene una presentación con ese nombre.' });

      const creada = await prisma.presentacion.create({
        data: {
          panaderia_id: panaderiaId,
          materia_prima_id: id,
          nombre: d.nombre,
          contenido: d.contenido,
          unidad_contenido_id: materia.unidad_base_id,
        },
      });
      res.status(201).json({ id: creada.id, nombre: creada.nombre });
    } catch (error) {
      console.error('Error al crear la presentación:', error);
      res.status(500).json({ error: 'Error al crear la presentación' });
    }
  });

  router.patch('/presentaciones/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const validado = validarPresentacionEditar(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const cambios = validado.datos;
    const panaderiaId = req.panaderiaId!;

    try {
      const actual = await prisma.presentacion.findFirst({ where: { id, panaderia_id: panaderiaId } });
      if (!actual) return res.status(404).json({ error: 'Presentación no encontrada.' });

      if (cambios.nombre !== undefined) {
        const repetida = await prisma.presentacion.findFirst({
          where: {
            materia_prima_id: actual.materia_prima_id,
            panaderia_id: panaderiaId,
            id: { not: id },
            nombre: { equals: cambios.nombre, mode: 'insensitive' },
          },
          select: { id: true },
        });
        if (repetida) return res.status(409).json({ error: 'Esta materia prima ya tiene una presentación con ese nombre.' });
      }

      const actualizada = await prisma.presentacion.update({ where: { id }, data: cambios });
      res.json({ id: actualizada.id, nombre: actualizada.nombre, activa: actualizada.activa });
    } catch (error) {
      console.error('Error al editar la presentación:', error);
      res.status(500).json({ error: 'Error al editar la presentación' });
    }
  });

  // Precio de un proveedor para una presentación
  router.post('/presentaciones/:id/ofertas', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const validado = validarOfertaCrear(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const d = validado.datos;
    const panaderiaId = req.panaderiaId!;

    try {
      const presentacion = await prisma.presentacion.findFirst({ where: { id, panaderia_id: panaderiaId } });
      if (!presentacion) return res.status(404).json({ error: 'Presentación no encontrada.' });

      const proveedor = await prisma.proveedor.findFirst({
        where: { id: d.proveedor_id, activo: true, OR: await alcanceProveedores(prisma, panaderiaId) },
        select: { id: true },
      });
      if (!proveedor) return res.status(400).json({ error: 'El proveedor no existe o está desactivado.' });

      const existente = await prisma.presentacion_proveedor.findFirst({
        where: { presentacion_id: id, proveedor_id: d.proveedor_id, panaderia_id: panaderiaId },
        select: { id: true },
      });
      if (existente) {
        return res.status(409).json({ error: 'Este proveedor ya tiene un precio para esta presentación. Edita ese precio.' });
      }

      const creada = await prisma.presentacion_proveedor.create({
        data: {
          panaderia_id: panaderiaId,
          presentacion_id: id,
          proveedor_id: d.proveedor_id,
          precio_referencia: d.precio_referencia,
          tiempo_entrega_dias: d.tiempo_entrega_dias,
        },
      });
      res.status(201).json({ id: creada.id });
    } catch (error) {
      console.error('Error al registrar el precio:', error);
      res.status(500).json({ error: 'Error al registrar el precio' });
    }
  });

  router.patch('/ofertas/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const validado = validarOfertaEditar(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const panaderiaId = req.panaderiaId!;

    try {
      const actual = await prisma.presentacion_proveedor.findFirst({ where: { id, panaderia_id: panaderiaId } });
      if (!actual) return res.status(404).json({ error: 'Precio no encontrado.' });

      const actualizada = await prisma.presentacion_proveedor.update({ where: { id }, data: validado.datos });
      res.json({
        id: actualizada.id,
        precio_referencia: Number(actualizada.precio_referencia),
        vigente: actualizada.vigente,
      });
    } catch (error) {
      console.error('Error al editar el precio:', error);
      res.status(500).json({ error: 'Error al editar el precio' });
    }
  });

  return router;
}
