import { Router, type Request } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { autorizarRoles } from '../middleware/autenticacion';
import { UUID } from '../utils/materiaPrima';
import { calcularAbc } from './abc';
import {
  ETIQUETA_MOTIVO,
  META_ERI,
  diferencia,
  rangoClaseAbc,
  resumirConteo,
  revisarMotivo,
  validarLinea,
  validarNuevoConteo,
  type Motivo,
} from '../utils/conteo';

type Db = Prisma.TransactionClient;

const ROLES_GESTION = ['administrador', 'superadministrador'];
const LIMITE_LISTA = 50;

const esErrorUnico = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
const redondear2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const fechaTexto = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

interface Fallo {
  estado: number;
  error: string;
  // Respuesta de "falta el motivo": el panadero cuenta sin ver el sistema y recién aquí se le muestra
  extra?: Record<string, unknown>;
}

// Detalle de un conteo con sus líneas, resumen y ERI. El dinero solo se incluye para gestión.
interface Quien {
  usuarioId: string;
  esGestion: boolean;
}

// Un conteo aplicado no se elimina (dejó ajustes en el inventario). El operario solo elimina los suyos que no están en revisión.
const puedeEliminar = (estado: string, creadoPor: string, q: Quien) =>
  estado !== 'aplicado' && (q.esGestion || (creadoPor === q.usuarioId && estado !== 'enviado'));

async function cargarDetalle(db: Db, panaderiaId: string, id: string, quien: Quien) {
  const verCostos = quien.esGestion;
  const c = await db.conteo_fisico.findFirst({
    where: { id, panaderia_id: panaderiaId },
    include: {
      creador: { include: { usuario: { select: { nombre: true } } } },
      resolutor: { include: { usuario: { select: { nombre: true } } } },
      detalle_conteo: { include: { lote: true, usuario: { include: { usuario: { select: { nombre: true } } } } } },
    },
  });
  if (!c) return null;

  const materiaIds = [...new Set(c.detalle_conteo.map((d) => d.lote.materia_prima_id).filter((x): x is string => !!x))];
  const materias = await db.materia_prima.findMany({
    where: { id: { in: materiaIds }, panaderia_id: panaderiaId },
    include: { unidad_medida: true },
  });
  const porId = new Map(materias.map((m) => [m.id, m]));

  const lineas = c.detalle_conteo
    .map((d) => {
      const m = d.lote.materia_prima_id ? porId.get(d.lote.materia_prima_id) : undefined;
      const sistema = Number(d.cantidad_sistema);
      const contada = Number(d.cantidad_contada);
      const dif = diferencia(sistema, contada);
      return {
        lote_id: d.lote_id,
        codigo_lote: d.lote.codigo_lote ?? null,
        fecha_vencimiento: fechaTexto(d.lote.fecha_vencimiento),
        materia_prima_id: d.lote.materia_prima_id,
        codigo: m?.codigo ?? '',
        nombre: m?.nombre ?? 'Insumo desconocido',
        unidad: m?.unidad_medida.codigo ?? '',
        cantidad_sistema: sistema,
        cantidad_contada: contada,
        diferencia: dif,
        motivo: d.motivo as Motivo | null,
        observaciones: d.observaciones ?? null,
        contado_por: d.usuario.usuario.nombre,
        contado_at: d.contado_at.toISOString(),
        ajustada: d.movimiento_id !== null,
        costo: Number(d.lote.costo_unitario),
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || (a.codigo_lote ?? '').localeCompare(b.codigo_lote ?? '', 'es'));

  const resumen = {
    ...resumirConteo(lineas),
    meta_eri: META_ERI,
    ...(verCostos
      ? {
          valor_faltantes: redondear2(lineas.filter((l) => l.diferencia < 0).reduce((s, l) => s - l.diferencia * l.costo, 0)),
          valor_sobrantes: redondear2(lineas.filter((l) => l.diferencia > 0).reduce((s, l) => s + l.diferencia * l.costo, 0)),
        }
      : {}),
  };

  return {
    id: c.id,
    numero: c.numero,
    estado: c.estado,
    puede_eliminar: puedeEliminar(c.estado, c.creado_por, quien),
    observaciones: c.observaciones ?? null,
    creado_por: c.creador.usuario.nombre,
    creado_at: c.created_at.toISOString(),
    enviado_at: iso(c.enviado_at),
    resuelto_por: c.resolutor?.usuario.nombre ?? null,
    resuelto_at: iso(c.resuelto_at),
    resumen,
    lineas: lineas.map(({ costo, ...l }) => ({
      ...l,
      ...(verCostos ? { valor_diferencia: redondear2(l.diferencia * costo) } : {}),
    })),
  };
}

// Serializa los cambios sobre un mismo conteo: dos personas no pueden enviarlo y editarlo a la vez
const bloquear = (tx: Db, id: string) => tx.$queryRaw`SELECT id FROM conteo_fisico WHERE id = ${id}::uuid FOR UPDATE`;

export function crearRouterConteos(prisma: PrismaClient) {
  const router = Router();
  const quien = (req: Request): Quien => ({ usuarioId: req.usuario!.id, esGestion: ROLES_GESTION.includes(req.usuario!.rol) });
  const soloGestion = autorizarRoles(...ROLES_GESTION);

  // Quien cuenta o resuelve debe estar asignado a la panadería (la base lo exige)
  const estaAsignado = async (db: Db, usuarioId: string, panaderiaId: string) =>
    (await db.usuario_panaderia.findFirst({ where: { usuario_id: usuarioId, panaderia_id: panaderiaId, activo: true } })) !== null;

  // Historial de conteos con su exactitud
  router.get('/', async (req, res) => {
    const panaderiaId = req.panaderiaId!;
    try {
      const conteos = await prisma.conteo_fisico.findMany({
        where: { panaderia_id: panaderiaId },
        orderBy: { numero: 'desc' },
        take: LIMITE_LISTA,
        include: {
          creador: { include: { usuario: { select: { nombre: true } } } },
          detalle_conteo: { select: { cantidad_sistema: true, cantidad_contada: true } },
        },
      });
      const items = conteos.map((c) => {
        const r = resumirConteo(c.detalle_conteo.map((d) => ({ cantidad_sistema: Number(d.cantidad_sistema), cantidad_contada: Number(d.cantidad_contada) })));
        return {
          id: c.id,
          numero: c.numero,
          estado: c.estado,
          puede_eliminar: puedeEliminar(c.estado, c.creado_por, quien(req)),
          observaciones: c.observaciones ?? null,
          creado_por: c.creador.usuario.nombre,
          creado_at: c.created_at.toISOString(),
          resumen: r,
        };
      });
      // El ERI solo cuenta conteos terminados de contar y válidos: uno en curso está incompleto y uno descartado
      // se dio por no válido (se contó mal o se repitió)
      const medidos = items.filter((i) => (i.estado === 'enviado' || i.estado === 'aplicado') && i.resumen.eri !== null);
      res.json({
        meta_eri: META_ERI,
        ultimo_eri: medidos[0]?.resumen.eri ?? null,
        promedio_eri: medidos.length === 0 ? null : redondear2(medidos.reduce((s, i) => s + (i.resumen.eri ?? 0), 0) / medidos.length),
        items,
      });
    } catch (error) {
      console.error('Error al consultar los conteos:', error);
      res.status(500).json({ error: 'Error al consultar los conteos' });
    }
  });

  // Abrir un conteo (solo uno en curso a la vez)
  router.post('/', async (req, res) => {
    const validado = validarNuevoConteo(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const panaderiaId = req.panaderiaId!;
    const usuarioId = req.usuario!.id;
    try {
      if (!(await estaAsignado(prisma, usuarioId, panaderiaId))) {
        return res.status(403).json({ error: 'Tu usuario no está asignado a esta panadería.' });
      }
      const abierto = await prisma.conteo_fisico.findFirst({ where: { panaderia_id: panaderiaId, estado: 'en_curso' } });
      if (abierto) return res.status(409).json({ error: `Ya hay un conteo en curso (n.º ${abierto.numero}). Termínalo o descártalo antes de abrir otro.`, id: abierto.id });

      const ultimo = await prisma.conteo_fisico.aggregate({ where: { panaderia_id: panaderiaId }, _max: { numero: true } });
      const creado = await prisma.conteo_fisico.create({
        data: {
          panaderia_id: panaderiaId,
          numero: (ultimo._max.numero ?? 0) + 1,
          creado_por: usuarioId,
          observaciones: validado.datos.observaciones,
        },
      });
      res.status(201).json({ id: creado.id, numero: creado.numero, estado: creado.estado });
    } catch (error) {
      if (esErrorUnico(error)) {
        return res.status(409).json({ error: 'Otra persona abrió un conteo al mismo tiempo. Actualiza la pantalla e inténtalo de nuevo.' });
      }
      console.error('Error al abrir el conteo:', error);
      res.status(500).json({ error: 'Error al abrir el conteo' });
    }
  });

  router.get('/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    try {
      const detalle = await cargarDetalle(prisma, req.panaderiaId!, id, quien(req));
      if (!detalle) return res.status(404).json({ error: 'Conteo no encontrado.' });
      res.json(detalle);
    } catch (error) {
      console.error('Error al consultar el conteo:', error);
      res.status(500).json({ error: 'Error al consultar el conteo' });
    }
  });

  // Lotes que se pueden contar (con existencias, de insumos activos que se controlan). No trae lo que dice el sistema:
  // se cuenta "a ciegas" para no inducir la cifra.
  router.get('/:id/lotes', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const panaderiaId = req.panaderiaId!;
    try {
      const conteo = await prisma.conteo_fisico.findFirst({ where: { id, panaderia_id: panaderiaId } });
      if (!conteo) return res.status(404).json({ error: 'Conteo no encontrado.' });
      const [materias, lotes, contados] = await Promise.all([
        prisma.materia_prima.findMany({
          where: { panaderia_id: panaderiaId, activa: true, controla_inventario: true },
          include: { unidad_medida: true },
        }),
        prisma.lote.findMany({ where: { panaderia_id: panaderiaId, cantidad_disponible: { gt: 0 }, materia_prima_id: { not: null } } }),
        prisma.detalle_conteo.findMany({ where: { conteo_id: id, panaderia_id: panaderiaId } }),
      ]);
      // Clase ABC de cada insumo, para contar primero los que más pesan (conteo cíclico). Si no se puede calcular, se cuenta sin clase.
      let claseDe = new Map<string, string>();
      try {
        const { cuerpo } = await calcularAbc(prisma, panaderiaId);
        claseDe = new Map(cuerpo.items.map((i) => [i.codigo, i.clase]));
      } catch {
        // sin clasificación: el orden vuelve a ser alfabético
      }
      const porMateria = new Map(materias.map((m) => [m.id, m]));
      const yaContados = new Set(contados.map((c) => c.lote_id));
      const items = lotes
        .filter((l) => l.materia_prima_id !== null && porMateria.has(l.materia_prima_id))
        .map((l) => {
          const m = porMateria.get(l.materia_prima_id as string)!;
          return {
            lote_id: l.id,
            codigo_lote: l.codigo_lote ?? null,
            fecha_vencimiento: fechaTexto(l.fecha_vencimiento),
            materia_prima_id: m.id,
            codigo: m.codigo,
            nombre: m.nombre,
            unidad: m.unidad_medida.codigo,
            clase_abc: claseDe.get(m.codigo) ?? null,
            contado: yaContados.has(l.id),
          };
        })
        .sort(
          (a, b) =>
            rangoClaseAbc(a.clase_abc) - rangoClaseAbc(b.clase_abc) ||
            a.nombre.localeCompare(b.nombre, 'es') ||
            (a.fecha_vencimiento ?? '9999').localeCompare(b.fecha_vencimiento ?? '9999') ||
            (a.codigo_lote ?? '').localeCompare(b.codigo_lote ?? '', 'es'),
        );
      res.json({ conteo_id: id, items });
    } catch (error) {
      console.error('Error al consultar los lotes por contar:', error);
      res.status(500).json({ error: 'Error al consultar los lotes por contar' });
    }
  });

  // Registrar (o corregir) lo contado de un lote. Guarda lo que decía el sistema en ese momento.
  router.put('/:id/lineas', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const validado = validarLinea(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const d = validado.datos;
    const panaderiaId = req.panaderiaId!;
    const usuarioId = req.usuario!.id;
    try {
      const fallo: Fallo | null = await prisma.$transaction(async (tx) => {
        if (!(await estaAsignado(tx, usuarioId, panaderiaId))) return { estado: 403, error: 'Tu usuario no está asignado a esta panadería.' };
        await bloquear(tx, id);
        const conteo = await tx.conteo_fisico.findFirst({ where: { id, panaderia_id: panaderiaId } });
        if (!conteo) return { estado: 404, error: 'Conteo no encontrado.' };
        if (conteo.estado !== 'en_curso') return { estado: 409, error: 'Este conteo ya no admite cambios.' };

        const lote = await tx.lote.findFirst({ where: { id: d.lote_id, panaderia_id: panaderiaId, materia_prima_id: { not: null } } });
        if (!lote || !lote.materia_prima_id) return { estado: 404, error: 'Lote no encontrado.' };
        const materia = await tx.materia_prima.findFirst({ where: { id: lote.materia_prima_id, panaderia_id: panaderiaId } });
        if (!materia || !materia.activa || materia.controla_inventario === false) {
          return { estado: 409, error: 'Ese insumo está desactivado o no se controla en inventario.' };
        }

        const sistema = Number(lote.cantidad_disponible);
        const revisado = revisarMotivo(diferencia(sistema, d.cantidad_contada), d.motivo, d.observaciones);
        if (!revisado.ok) {
          return {
            estado: 400,
            error: revisado.errores.join(' '),
            extra: { requiere_motivo: true, cantidad_sistema: sistema, diferencia: diferencia(sistema, d.cantidad_contada) },
          };
        }

        await tx.detalle_conteo.upsert({
          where: { conteo_id_lote_id: { conteo_id: id, lote_id: d.lote_id } },
          create: {
            panaderia_id: panaderiaId,
            conteo_id: id,
            lote_id: d.lote_id,
            cantidad_sistema: sistema,
            cantidad_contada: d.cantidad_contada,
            motivo: revisado.datos.motivo,
            observaciones: revisado.datos.observaciones,
            contado_por: usuarioId,
          },
          update: {
            cantidad_sistema: sistema,
            cantidad_contada: d.cantidad_contada,
            motivo: revisado.datos.motivo,
            observaciones: revisado.datos.observaciones,
            contado_por: usuarioId,
            contado_at: new Date(),
          },
        });
        return null;
      });
      if (fallo) return res.status(fallo.estado).json({ error: fallo.error, ...fallo.extra });
      res.json(await cargarDetalle(prisma, panaderiaId, id, quien(req)));
    } catch (error) {
      console.error('Error al registrar la línea del conteo:', error);
      res.status(500).json({ error: 'Error al registrar lo contado' });
    }
  });

  router.delete('/:id/lineas/:loteId', async (req, res) => {
    const id = String(req.params.id);
    const loteId = String(req.params.loteId);
    if (!UUID.test(id) || !UUID.test(loteId)) return res.status(400).json({ error: 'Identificador no válido.' });
    const panaderiaId = req.panaderiaId!;
    try {
      const fallo: Fallo | null = await prisma.$transaction(async (tx) => {
        await bloquear(tx, id);
        const conteo = await tx.conteo_fisico.findFirst({ where: { id, panaderia_id: panaderiaId } });
        if (!conteo) return { estado: 404, error: 'Conteo no encontrado.' };
        if (conteo.estado !== 'en_curso') return { estado: 409, error: 'Este conteo ya no admite cambios.' };
        const borradas = await tx.detalle_conteo.deleteMany({ where: { conteo_id: id, lote_id: loteId, panaderia_id: panaderiaId } });
        if (borradas.count === 0) return { estado: 404, error: 'Ese lote no está en el conteo.' };
        return null;
      });
      if (fallo) return res.status(fallo.estado).json({ error: fallo.error });
      res.json(await cargarDetalle(prisma, panaderiaId, id, quien(req)));
    } catch (error) {
      console.error('Error al quitar la línea del conteo:', error);
      res.status(500).json({ error: 'Error al quitar el lote del conteo' });
    }
  });

  // Terminar de contar: queda a la espera de la revisión de un administrador
  router.post('/:id/enviar', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const panaderiaId = req.panaderiaId!;
    try {
      const fallo: Fallo | null = await prisma.$transaction(async (tx) => {
        await bloquear(tx, id);
        const conteo = await tx.conteo_fisico.findFirst({ where: { id, panaderia_id: panaderiaId } });
        if (!conteo) return { estado: 404, error: 'Conteo no encontrado.' };
        if (conteo.estado !== 'en_curso') return { estado: 409, error: 'Este conteo ya fue enviado o cerrado.' };
        const n = await tx.detalle_conteo.count({ where: { conteo_id: id, panaderia_id: panaderiaId } });
        if (n === 0) return { estado: 409, error: 'Cuenta al menos un lote antes de enviar.' };
        await tx.conteo_fisico.update({ where: { id }, data: { estado: 'enviado', enviado_at: new Date() } });
        return null;
      });
      if (fallo) return res.status(fallo.estado).json({ error: fallo.error });
      res.json(await cargarDetalle(prisma, panaderiaId, id, quien(req)));
    } catch (error) {
      console.error('Error al enviar el conteo:', error);
      res.status(500).json({ error: 'Error al enviar el conteo' });
    }
  });

  // Eliminar un conteo que salió mal. Uno aplicado no se borra: ya ajustó el inventario y debe quedar el rastro.
  // El operario solo elimina los suyos que siguen en curso o descartados; revisar uno enviado es de administración.
  router.delete('/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const panaderiaId = req.panaderiaId!;
    const usuarioId = req.usuario!.id;
    const esGestion = ROLES_GESTION.includes(req.usuario!.rol);
    try {
      const fallo: Fallo | null = await prisma.$transaction(async (tx) => {
        await bloquear(tx, id);
        const conteo = await tx.conteo_fisico.findFirst({ where: { id, panaderia_id: panaderiaId } });
        if (!conteo) return { estado: 404, error: 'Conteo no encontrado.' };
        if (conteo.estado === 'aplicado') {
          return { estado: 409, error: 'Un conteo aplicado no se puede eliminar: ya ajustó el inventario y debe quedar registrado.' };
        }
        if (!puedeEliminar(conteo.estado, conteo.creado_por, { usuarioId, esGestion })) {
          return {
            estado: 403,
            error:
              conteo.creado_por !== usuarioId
                ? 'Solo puedes eliminar los conteos que abriste tú.'
                : 'Este conteo ya está en revisión: lo elimina o lo devuelve un administrador.',
          };
        }
        await tx.detalle_conteo.deleteMany({ where: { conteo_id: id, panaderia_id: panaderiaId } });
        await tx.conteo_fisico.deleteMany({ where: { id, panaderia_id: panaderiaId } });
        return null;
      });
      if (fallo) return res.status(fallo.estado).json({ error: fallo.error });
      res.json({ eliminado: true, id });
    } catch (error) {
      console.error('Error al eliminar el conteo:', error);
      res.status(500).json({ error: 'Error al eliminar el conteo' });
    }
  });

  // Un administrador devuelve el conteo para que se vuelva a contar
  router.post('/:id/devolver', soloGestion, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const panaderiaId = req.panaderiaId!;
    try {
      const fallo: Fallo | null = await prisma.$transaction(async (tx) => {
        await bloquear(tx, id);
        const conteo = await tx.conteo_fisico.findFirst({ where: { id, panaderia_id: panaderiaId } });
        if (!conteo) return { estado: 404, error: 'Conteo no encontrado.' };
        if (conteo.estado !== 'enviado') return { estado: 409, error: 'Solo se puede devolver un conteo enviado.' };
        await tx.conteo_fisico.update({ where: { id }, data: { estado: 'en_curso', enviado_at: null } });
        return null;
      });
      if (fallo) return res.status(fallo.estado).json({ error: fallo.error });
      res.json(await cargarDetalle(prisma, panaderiaId, id, quien(req)));
    } catch (error) {
      if (esErrorUnico(error)) {
        return res.status(409).json({ error: 'Hay otro conteo en curso. Termínalo o descártalo antes de devolver este.' });
      }
      console.error('Error al devolver el conteo:', error);
      res.status(500).json({ error: 'Error al devolver el conteo' });
    }
  });

  // Un administrador cierra el conteo sin ajustar el inventario (la exactitud medida se conserva)
  router.post('/:id/descartar', soloGestion, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const panaderiaId = req.panaderiaId!;
    const usuarioId = req.usuario!.id;
    try {
      const fallo: Fallo | null = await prisma.$transaction(async (tx) => {
        if (!(await estaAsignado(tx, usuarioId, panaderiaId))) return { estado: 403, error: 'Tu usuario no está asignado a esta panadería.' };
        await bloquear(tx, id);
        const conteo = await tx.conteo_fisico.findFirst({ where: { id, panaderia_id: panaderiaId } });
        if (!conteo) return { estado: 404, error: 'Conteo no encontrado.' };
        if (conteo.estado !== 'en_curso' && conteo.estado !== 'enviado') return { estado: 409, error: 'Este conteo ya está cerrado.' };
        await tx.conteo_fisico.update({ where: { id }, data: { estado: 'descartado', resuelto_por: usuarioId, resuelto_at: new Date() } });
        return null;
      });
      if (fallo) return res.status(fallo.estado).json({ error: fallo.error });
      res.json(await cargarDetalle(prisma, panaderiaId, id, quien(req)));
    } catch (error) {
      console.error('Error al descartar el conteo:', error);
      res.status(500).json({ error: 'Error al descartar el conteo' });
    }
  });

  // Un administrador aprueba: cada diferencia se aplica como un ajuste del lote, con su motivo. Todo o nada.
  router.post('/:id/aplicar', soloGestion, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const panaderiaId = req.panaderiaId!;
    const usuarioId = req.usuario!.id;
    try {
      const salida: { fallo: Fallo } | { ajustes: number } = await prisma.$transaction(async (tx) => {
        if (!(await estaAsignado(tx, usuarioId, panaderiaId))) return { fallo: { estado: 403, error: 'Tu usuario no está asignado a esta panadería.' } };
        await bloquear(tx, id);
        const conteo = await tx.conteo_fisico.findFirst({ where: { id, panaderia_id: panaderiaId } });
        if (!conteo) return { fallo: { estado: 404, error: 'Conteo no encontrado.' } };
        if (conteo.estado !== 'enviado') return { fallo: { estado: 409, error: 'Solo se puede aprobar un conteo enviado.' } };

        const tipos = await tx.tipo_movimiento_inventario.findMany({ where: { codigo: { in: ['ajuste_entrada', 'ajuste_salida'] } } });
        const tipoEntrada = tipos.find((t) => t.codigo === 'ajuste_entrada');
        const tipoSalida = tipos.find((t) => t.codigo === 'ajuste_salida');
        if (!tipoEntrada || !tipoSalida) throw new Error('Faltan los tipos de movimiento de ajuste en el catálogo');

        const lineas = (await tx.detalle_conteo.findMany({ where: { conteo_id: id, panaderia_id: panaderiaId } })).sort((a, b) =>
          a.lote_id < b.lote_id ? -1 : a.lote_id > b.lote_id ? 1 : 0,
        );
        if (lineas.length > 0) {
          // Bloquea los lotes en un orden fijo para no cruzarse con una producción que los esté descontando
          const ids = lineas.map((l) => l.lote_id);
          await tx.$queryRaw`SELECT id FROM lote WHERE panaderia_id = ${panaderiaId}::uuid AND id = ANY(${ids}::uuid[]) FOR UPDATE`;
        }

        // Primero se revisa todo y después se escribe: un "return" dentro de la transacción la confirmaría a medias
        const plan = lineas
          .map((l) => ({ l, dif: diferencia(Number(l.cantidad_sistema), Number(l.cantidad_contada)) }))
          .filter((x) => x.dif !== 0);
        if (plan.some((x) => !x.l.motivo)) {
          return { fallo: { estado: 409, error: 'Hay diferencias sin motivo. Devuelve el conteo para completarlas.' } };
        }

        for (const { l, dif } of plan) {
          const motivo = l.motivo as Motivo;
          const nota = `Conteo n.º ${conteo.numero}: ${ETIQUETA_MOTIVO[motivo]}${l.observaciones ? ` (${l.observaciones})` : ''}`;
          const mov = await tx.movimiento_inventario.create({
            data: {
              panaderia_id: panaderiaId,
              lote_id: l.lote_id,
              tipo_movimiento_id: dif > 0 ? tipoEntrada.id : tipoSalida.id,
              cantidad: Math.abs(dif),
              usuario_id: usuarioId,
              observaciones: nota,
            },
          });
          await tx.detalle_conteo.update({ where: { id: l.id }, data: { movimiento_id: mov.id } });
        }
        const ajustes = plan.length;
        await tx.conteo_fisico.update({ where: { id }, data: { estado: 'aplicado', resuelto_por: usuarioId, resuelto_at: new Date() } });
        return { ajustes };
      });

      if ('fallo' in salida) return res.status(salida.fallo.estado).json({ error: salida.fallo.error });
      const detalle = await cargarDetalle(prisma, panaderiaId, id, quien(req));
      res.json({ ...detalle, ajustes: salida.ajustes });
    } catch (error) {
      // La base impide dejar un lote en negativo: si se gastó producto después de contar, hay que volver a contar
      if (error instanceof Error && error.message.includes('negativa')) {
        return res.status(409).json({
          error: 'Un ajuste dejaría un lote en negativo porque sus existencias cambiaron después de contar. Devuelve el conteo y vuelve a contar ese lote.',
        });
      }
      console.error('Error al aplicar el conteo:', error);
      res.status(500).json({ error: 'Error al aplicar el conteo' });
    }
  });

  return router;
}
