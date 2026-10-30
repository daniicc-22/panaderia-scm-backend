import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterProduccion } from '../src/routes/produccion';

const PAN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U_G = 'uuuuuuuu-0000-4000-8000-000000000001';
const U_UN = 'uuuuuuuu-0000-4000-8000-000000000002';
const HARINA = '33333333-3333-4333-8333-333333333331';
const LEVADURA = '33333333-3333-4333-8333-333333333332';
const AGUA = '33333333-3333-4333-8333-333333333333';
const SAL = '33333333-3333-4333-8333-333333333334';
const AZUCAR = '33333333-3333-4333-8333-333333333335';
const PROV = '55555555-5555-4555-8555-555555555551';

// Lunes 2026-10-26, 9:00 en Colombia
const AHORA = new Date('2026-10-26T14:00:00Z');

type Fila = Record<string, any>;
let materias: Fila[];
let lotes: Fila[];
let parametros: Fila[];
let formulaciones: Fila[];

const detalle = (materia: string, cantidad: number, unidad = U_G) => ({
  materia_prima_id: materia,
  producto_intermedio_id: null,
  cantidad_estandar: cantidad,
  unidad_id: unidad,
});
const form = (id: string, nombre: string, lineas: Fila[], extra: Fila = {}, producto: Fila = {}) => ({
  id: `f-${id}`,
  panaderia_id: PAN_A,
  producto_id: id,
  version: 1,
  activa: true,
  rendimiento_esperado: 30,
  producto: { id, nombre, activo: true, es_intermedio: false, ...producto },
  detalle_formulacion: lineas,
  ...extra,
});

const prismaFalso: any = {
  panaderia: { findUnique: async () => ({ grupo_id: null }) },
  materia_prima: {
    findMany: async ({ where }: any) =>
      materias
        .filter(
          (m) =>
            m.panaderia_id === where.panaderia_id &&
            (where.activa === undefined || m.activa === where.activa) &&
            (where.controla_inventario === undefined || m.controla_inventario === where.controla_inventario),
        )
        .map((m) => ({ ...m, unidad_medida: { codigo: 'g' }, presentacion: m.presentacion ?? [] })),
  },
  lote: {
    findMany: async ({ where }: any) =>
      lotes.filter((l) => l.panaderia_id === where.panaderia_id && l.materia_prima_id !== null && l.cantidad_disponible > 0),
  },
  parametro_inventario: { findMany: async () => parametros.filter((p) => p.activo) },
  proveedor: { findMany: async () => [{ id: PROV, nombre: 'Distribuidora Central', dias_entrega: [3], hora_limite_pedido: null, pedido_minimo: null }] },
  formulacion: {
    findMany: async ({ where }: any) =>
      formulaciones.filter(
        (f) =>
          f.panaderia_id === where.panaderia_id &&
          f.activa === where.activa &&
          (where.producto?.activo === undefined || f.producto.activo === where.producto.activo),
      ),
  },
  produccion: { findFirst: async () => null },
  consumo_produccion: { findMany: async () => [] },
};

let servidor: ReturnType<express.Application['listen']>;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).usuario = { id: 'u1', email: 'x@x.com', rol: String(req.headers['x-rol']) };
    (req as any).panaderiaId = PAN_A;
    next();
  });
  app.use('/produccion', crearRouterProduccion(prismaFalso, () => AHORA));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => {
  servidor.close();
});

const conOferta = [
  {
    id: 'pres', contenido: 1000, nombre: 'Bulto 1 kg', activa: true,
    presentacion_proveedor: [{ id: 'of', proveedor_id: PROV, precio_referencia: 2000, vigente: true, tiempo_entrega_dias: 1, proveedor: { activo: true } }],
  },
];
const materia = (id: string, codigo: string, nombre: string, extra: Fila = {}) => ({
  id, panaderia_id: PAN_A, codigo, nombre, activa: true, controla_inventario: true, unidad_base_id: U_G, lead_time_dias: null, ...extra,
});
const lote = (materiaId: string, cantidad: number, vence: string | null = '2026-12-01') => ({
  panaderia_id: PAN_A, materia_prima_id: materiaId, cantidad_disponible: cantidad, fecha_vencimiento: vence ? new Date(vence) : null,
});

beforeEach(() => {
  materias = [
    materia(HARINA, 'MP-001', 'Harina', { presentacion: conOferta }),
    materia(LEVADURA, 'MP-002', 'Levadura'),
    materia(AGUA, 'MP-003', 'Agua', { controla_inventario: false }),
    materia(SAL, 'MP-004', 'Sal'),
    materia(AZUCAR, 'MP-005', 'Azúcar', { presentacion: conOferta }),
  ];
  lotes = [
    lote(HARINA, 1200),
    lote(HARINA, 900, '2026-10-01'), // vencido: no cuenta
    lote(LEVADURA, 300),
    lote(AZUCAR, 40000),
  ];
  parametros = [HARINA, AZUCAR].map((id) => ({
    id: `p-${id}`, panaderia_id: PAN_A, materia_prima_id: id, activo: true,
    costo_ordenar_s: 1000, costo_mantener_h: 2, tasa_mantenimiento_anual: null, dias_seguridad: 2,
    stock_minimo: null, stock_maximo: null, vida_util_dias: null, consumo_semanal_declarado: 7000,
    lead_time_dias: 1, porcentaje_perdida_tolerable: null,
  }));
  formulaciones = [
    form('p-pan', 'Pan de maíz', [detalle(HARINA, 500), detalle(LEVADURA, 200), detalle(AGUA, 300)]),
    form('p-almo', 'Almojábana', [detalle(HARINA, 5000)]),
    form('p-roto', 'Pan roto', [detalle(HARINA, 100, U_UN)]),
    form('p-baja', 'Pan de baja', [detalle(HARINA, 100)], {}, { activo: false }),
    form('p-masa', 'Masa base', [detalle(HARINA, 100)], {}, { es_intermedio: true }),
  ];
});

async function llamar(ruta: string, rol = 'operario') {
  const r = await fetch(base + ruta, { headers: { 'x-rol': rol } });
  return { status: r.status, cuerpo: (await r.json()) as any };
}

describe('GET /produccion/que-producir', () => {
  test('lo ve el operario y cuenta solo existencias vigentes', async () => {
    const r = await llamar('/produccion/que-producir', 'operario');
    expect(r.status).toBe(200);
    expect(r.cuerpo.fecha).toBe('2026-10-26');
    const pan = r.cuerpo.items.find((i: any) => i.producto_id === 'p-pan');
    expect(pan.estado).toBe('puede');
    expect(pan.lotes_posibles).toBe(1); // harina 1.200 / 500 = 2,4 · levadura 300 / 200 = 1,5 (los 900 vencidos no cuentan)
    expect(pan.lotes_exactos).toBe(1.5);
    expect(pan.cantidad_posible).toBe(30);
    expect(pan.limitante).toMatchObject({ nombre: 'Levadura', disponible: 300, por_lote: 200 });
  });

  test('el agua (sin inventario) no limita ni se pide', async () => {
    const r = await llamar('/produccion/que-producir');
    const pan = r.cuerpo.items.find((i: any) => i.producto_id === 'p-pan');
    expect(pan.faltantes).toEqual([]);
    expect(pan.limitante.nombre).not.toBe('Agua');
  });

  test('dice qué falta cuando no alcanza para un lote', async () => {
    const r = await llamar('/produccion/que-producir');
    const almo = r.cuerpo.items.find((i: any) => i.producto_id === 'p-almo');
    expect(almo.estado).toBe('no_alcanza');
    expect(almo.lotes_posibles).toBe(0);
    expect(almo.faltantes).toEqual([{ materia_prima_id: HARINA, nombre: 'Harina', unidad: 'g', falta: 3800 }]);
  });

  test('no promete lo que la producción rechazaría (unidad distinta a la del inventario)', async () => {
    const r = await llamar('/produccion/que-producir');
    const roto = r.cuerpo.items.find((i: any) => i.producto_id === 'p-roto');
    expect(roto.estado).toBe('no_calculable');
    expect(roto.motivo).toContain('unidad');
  });

  test('excluye productos dados de baja e intermedios, y ordena lo que sí se puede primero', async () => {
    const r = await llamar('/produccion/que-producir');
    const ids = r.cuerpo.items.map((i: any) => i.producto_id);
    expect(ids).toEqual(['p-pan', 'p-almo', 'p-roto']);
    expect(r.cuerpo.resumen).toEqual({ pueden: 1, no_alcanzan: 1, no_calculables: 1 });
  });

  test('un insumo desactivado en la receta la deja sin calcular', async () => {
    materias.find((m) => m.id === LEVADURA)!.activa = false;
    const r = await llamar('/produccion/que-producir');
    expect(r.cuerpo.items.find((i: any) => i.producto_id === 'p-pan').estado).toBe('no_calculable');
  });

  test('no muestra dinero', async () => {
    const r = await llamar('/produccion/que-producir');
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/precio|costo|valor/);
  });
});

describe('GET /produccion/existencias-bajas', () => {
  test('lo ve el operario: agotados, críticos y bajos, sin dinero ni proveedores', async () => {
    const r = await llamar('/produccion/existencias-bajas', 'operario');
    expect(r.status).toBe(200);
    expect(r.cuerpo.fecha).toBe('2026-10-26');
    // Harina: 1.200 con consumo de 1.000 por día → no llega a la entrega del miércoles
    const harina = r.cuerpo.items.find((i: any) => i.materia_prima_id === HARINA);
    expect(harina.nivel).toBe('critico');
    expect(harina.existencia).toBe(1200);
    expect(harina.stock_seguridad).toBe(2000);
    expect(harina.fecha_agotamiento).toBe('2026-10-27');
    // Sal: sin existencias → agotada aunque falten datos para calcular el resto
    const sal = r.cuerpo.items.find((i: any) => i.materia_prima_id === SAL);
    expect(sal.nivel).toBe('agotado');
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/precio|costo|valor|proveedor/);
  });

  test('no lista lo que está bien ni lo que no se puede evaluar con existencias', async () => {
    const r = await llamar('/produccion/existencias-bajas');
    const ids = r.cuerpo.items.map((i: any) => i.materia_prima_id);
    expect(ids).not.toContain(AZUCAR); // 40.000 de sobra
    expect(ids).not.toContain(LEVADURA); // hay 300 pero sin parámetros no se puede decir que sea poco
    expect(ids).not.toContain(AGUA); // no se controla
  });

  test('sin datos para proyectar, estar por debajo del stock mínimo declarado cuenta como bajo', async () => {
    parametros.push({
      id: 'p-lev', panaderia_id: PAN_A, materia_prima_id: LEVADURA, activo: true, costo_ordenar_s: null, costo_mantener_h: null,
      tasa_mantenimiento_anual: null, dias_seguridad: null, stock_minimo: 500, stock_maximo: null, vida_util_dias: null,
      consumo_semanal_declarado: null, lead_time_dias: null, porcentaje_perdida_tolerable: null,
    });
    const r = await llamar('/produccion/existencias-bajas');
    const lev = r.cuerpo.items.find((i: any) => i.materia_prima_id === LEVADURA);
    expect(lev.nivel).toBe('bajo');
    expect(lev.stock_seguridad).toBe(500);
  });

  test('ordena primero lo agotado y luego lo crítico, y resume', async () => {
    const r = await llamar('/produccion/existencias-bajas');
    expect(r.cuerpo.items.map((i: any) => i.nivel)).toEqual(['agotado', 'critico']);
    expect(r.cuerpo.resumen).toEqual({ agotados: 1, criticos: 1, bajos: 0 });
  });

  test('un error de base de datos da 500 sin exponer detalles', async () => {
    const original = prismaFalso.lote.findMany;
    prismaFalso.lote.findMany = async () => {
      throw new Error('conexión caída');
    };
    const consola = console.error;
    console.error = () => {};
    try {
      const r = await llamar('/produccion/existencias-bajas');
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.cuerpo)).not.toContain('conexión');
    } finally {
      console.error = consola;
      prismaFalso.lote.findMany = original;
    }
  });
});

describe('insumos en modo al_uso (queso cuajada)', () => {
  const QUESO = '33333333-3333-4333-8333-333333333399';
  const paramQueso = (modo: string) => ({
    id: 'p-queso', panaderia_id: PAN_A, materia_prima_id: QUESO, activo: true, modo_reposicion: modo,
    costo_ordenar_s: null, costo_mantener_h: null, tasa_mantenimiento_anual: null, dias_seguridad: null,
    stock_minimo: null, stock_maximo: null, vida_util_dias: null, consumo_semanal_declarado: null,
    lead_time_dias: null, porcentaje_perdida_tolerable: null,
  });
  const prepararQueso = (modo: string | null) => {
    materias.push(materia(QUESO, 'MP-099', 'Queso cuajada'));
    formulaciones.push(form('p-queso', 'Pan de queso', [detalle(HARINA, 500), detalle(QUESO, 300)]));
    if (modo !== null) parametros.push(paramQueso(modo));
  };

  test('sin el modo, un insumo en cero aparece como agotado y bloquea la producción', async () => {
    prepararQueso(null);
    const bajas = await llamar('/produccion/existencias-bajas');
    expect(bajas.cuerpo.items.some((i: any) => i.nombre === 'Queso cuajada' && i.nivel === 'agotado')).toBe(true);
    const q = (await llamar('/produccion/que-producir')).cuerpo.items.find((i: any) => i.producto_id === 'p-queso');
    expect(q.estado).toBe('no_alcanza');
    expect(q.faltantes).toEqual([{ materia_prima_id: QUESO, nombre: 'Queso cuajada', unidad: 'g', falta: 300 }]);
    expect(q.compra_al_uso).toEqual([]);
  });

  test('en modo al_uso no sale en existencias bajas', async () => {
    prepararQueso('al_uso');
    const bajas = await llamar('/produccion/existencias-bajas');
    expect(bajas.cuerpo.items.some((i: any) => i.nombre === 'Queso cuajada')).toBe(false);
  });

  test('en modo al_uso no limita qué producir y se avisa que se compra según la producción', async () => {
    prepararQueso('al_uso');
    const q = (await llamar('/produccion/que-producir')).cuerpo.items.find((i: any) => i.producto_id === 'p-queso');
    expect(q.estado).toBe('puede');
    expect(q.faltantes).toEqual([]);
    expect(q.compra_al_uso).toEqual([{ materia_prima_id: QUESO, nombre: 'Queso cuajada', unidad: 'g', por_lote: 300 }]);
  });

  test('con modo periodica explícito se comporta como cualquier insumo', async () => {
    prepararQueso('periodica');
    const q = (await llamar('/produccion/que-producir')).cuerpo.items.find((i: any) => i.producto_id === 'p-queso');
    expect(q.estado).toBe('no_alcanza');
  });
});
