import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { autorizarRoles } from '../middleware/autenticacion';
import { puedeVerCostos } from '../utils/permisos';
import { UUID, siguienteCodigo, validarCrear, validarEditar } from '../utils/materiaPrima';

const ROLES_GESTION = ['administrador', 'superadministrador'];
// Mensaje corto: los primeros nombres y cuántos faltan (la lista completa va en el campo productos)
const MAX_NOMBRES_EN_MENSAJE = 5;
const resumirProductos = (productos: string[]) =>
  productos.length <= MAX_NOMBRES_EN_MENSAJE
    ? productos.join(', ')
    : `${productos.slice(0, MAX_NOMBRES_EN_MENSAJE).join(', ')} y ${productos.length - MAX_NOMBRES_EN_MENSAJE} más`;

const esErrorUnico = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';

export function crearRouterMateriasPrimas(prisma: PrismaClient) {
  const router = Router();
  const soloGestion = autorizarRoles(...ROLES_GESTION);

  // Listado. Con ?incluir_inactivas=true (solo gestión) también devuelve las dadas de baja.
  router.get('/', async (req, res) => {
    try {
      const verCostos = puedeVerCostos(req.usuario?.rol);
      const incluirInactivas = req.query.incluir_inactivas === 'true' && ROLES_GESTION.includes(req.usuario?.rol ?? '');

      const materias = await prisma.materia_prima.findMany({
        where: { panaderia_id: req.panaderiaId, ...(incluirInactivas ? {} : { activa: true }) },
        include: {
          categoria_materia_prima: true,
          unidad_medida: true,
          presentacion: {
            where: { activa: true },
            include: { presentacion_proveedor: { where: { vigente: true } } },
          },
        },
        orderBy: { codigo: 'asc' },
      });

      res.json(
        materias.map((m) => ({
          id: m.id,
          codigo: m.codigo,
          nombre: m.nombre,
          activa: m.activa,
          categoria_id: m.categoria_id,
          categoria: m.categoria_materia_prima?.nombre ?? null,
          unidad_base_id: m.unidad_base_id,
          unidad: m.unidad_medida.codigo,
          criterio_rotacion: m.criterio_rotacion,
          lead_time_dias: m.lead_time_dias === null ? null : Number(m.lead_time_dias),
          variabilidad_peso_unitario: m.variabilidad_peso_unitario,
          presentaciones: m.presentacion.map((p) => {
            const contenido = Number(p.contenido);
            const precio = Number(p.presentacion_proveedor[0]?.precio_referencia ?? 0);
            return {
              id: p.id,
              nombre: p.nombre,
              contenido,
              precio: verCostos ? precio : null,
              costo_por_unidad_base: verCostos && contenido > 0 ? precio / contenido : null,
            };
          }),
        })),
      );
    } catch (error) {
      console.error('Error al consultar materias primas:', error);
      res.status(500).json({ error: 'Error al consultar las materias primas' });
    }
  });

  // Unidades y categorías para el formulario
  router.get('/catalogos', soloGestion, async (_req, res) => {
    try {
      const [unidades, categorias] = await Promise.all([
        prisma.unidad_medida.findMany({ orderBy: { codigo: 'asc' } }),
        prisma.categoria_materia_prima.findMany({ orderBy: { nombre: 'asc' } }),
      ]);
      res.json({
        unidades: unidades.map((u) => ({ id: u.id, codigo: u.codigo, nombre: u.nombre, tipo: u.tipo })),
        categorias: categorias.map((c) => ({ id: c.id, nombre: c.nombre })),
      });
    } catch (error) {
      console.error('Error al consultar catálogos:', error);
      res.status(500).json({ error: 'Error al consultar los catálogos' });
    }
  });

  // Crear: el código MP-0xx lo genera el sistema
  router.post('/', soloGestion, async (req, res) => {
    const validado = validarCrear(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const d = validado.datos;
    const panaderiaId = req.panaderiaId!;

    try {
      const [unidad, categoria, repetida] = await Promise.all([
        prisma.unidad_medida.findUnique({ where: { id: d.unidad_base_id } }),
        d.categoria_id ? prisma.categoria_materia_prima.findUnique({ where: { id: d.categoria_id } }) : Promise.resolve(true),
        prisma.materia_prima.findFirst({
          where: { panaderia_id: panaderiaId, nombre: { equals: d.nombre, mode: 'insensitive' } },
          select: { id: true },
        }),
      ]);
      if (!unidad) return res.status(400).json({ error: 'La unidad base no existe.' });
      if (!categoria) return res.status(400).json({ error: 'La categoría no existe.' });
      if (repetida) return res.status(409).json({ error: 'Ya existe una materia prima con ese nombre.' });

      const existentes = await prisma.materia_prima.findMany({
        where: { panaderia_id: panaderiaId },
        select: { codigo: true },
      });

      const creada = await prisma.materia_prima.create({
        data: {
          panaderia_id: panaderiaId,
          codigo: siguienteCodigo(existentes.map((e) => e.codigo)),
          nombre: d.nombre,
          categoria_id: d.categoria_id,
          unidad_base_id: d.unidad_base_id,
          criterio_rotacion: d.criterio_rotacion,
          lead_time_dias: d.lead_time_dias,
          variabilidad_peso_unitario: d.variabilidad_peso_unitario,
        },
      });
      res.status(201).json({ id: creada.id, codigo: creada.codigo, nombre: creada.nombre });
    } catch (error) {
      if (esErrorUnico(error)) {
        return res.status(409).json({ error: 'Otro usuario creó una materia prima al mismo tiempo. Intenta de nuevo.' });
      }
      console.error('Error al crear la materia prima:', error);
      res.status(500).json({ error: 'Error al crear la materia prima' });
    }
  });

  // Editar y activar/desactivar. Código y unidad base no se modifican.
  router.patch('/:id', soloGestion, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const validado = validarEditar(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const cambios = validado.datos;
    const panaderiaId = req.panaderiaId!;

    try {
      const actual = await prisma.materia_prima.findFirst({ where: { id, panaderia_id: panaderiaId } });
      if (!actual) return res.status(404).json({ error: 'Materia prima no encontrada.' });

      if (cambios.nombre !== undefined) {
        const repetida = await prisma.materia_prima.findFirst({
          where: {
            panaderia_id: panaderiaId,
            id: { not: id },
            nombre: { equals: cambios.nombre, mode: 'insensitive' },
          },
          select: { id: true },
        });
        if (repetida) return res.status(409).json({ error: 'Ya existe una materia prima con ese nombre.' });
      }

      if (cambios.categoria_id) {
        const categoria = await prisma.categoria_materia_prima.findUnique({ where: { id: cambios.categoria_id } });
        if (!categoria) return res.status(400).json({ error: 'La categoría no existe.' });
      }

      // No se da de baja un insumo que usan formulaciones activas
      if (cambios.activa === false && actual.activa) {
        const usos = await prisma.detalle_formulacion.findMany({
          where: { materia_prima_id: id, formulacion: { panaderia_id: panaderiaId, activa: true } },
          select: { formulacion: { select: { producto: { select: { nombre: true } } } } },
        });
        if (usos.length > 0) {
          const productos = [...new Set(usos.map((u) => u.formulacion.producto.nombre))];
          return res.status(409).json({
            error: `No se puede desactivar: la usan las formulaciones activas de ${resumirProductos(productos)}.`,
            productos,
          });
        }
      }

      const actualizada = await prisma.materia_prima.update({
        where: { id },
        data: { ...cambios, updated_at: new Date() },
      });
      res.json({ id: actualizada.id, codigo: actualizada.codigo, nombre: actualizada.nombre, activa: actualizada.activa });
    } catch (error) {
      console.error('Error al editar la materia prima:', error);
      res.status(500).json({ error: 'Error al editar la materia prima' });
    }
  });

  return router;
}
