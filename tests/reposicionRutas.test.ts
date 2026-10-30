import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterReposicion } from '../src/routes/reposicion';
import { crearRouterAbc } from '../src/routes/abc';
import { sinErroresEnConsola } from './helpers';

const PAN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HARINA = '33333333-3333-4333-8333-333333333331';
const SAL = '33333333-3333-4333-8333-333333333332';
const AJENA = '33333333-3333-4333-8333-333333333399';
const PROV = '55555555-5555-4555-8555-555555555551';

// Lunes 2026-10-26, 9:00 de la mañana en Colombia
const AHORA = new Date('2026-10-26T14:00:00Z');

type Fila = Record<string, any>;
let materias: Fila[];
let lotes: Fila[];
let parametros: Fila[];
let proveedores: Fila[];
let consumos: Fila[];
let primeraProduccion: Date | null;
let fallar: boolean;

const decimal = (n: number | null) => (n === null ? null : (n as any));

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
        .map((m) => ({ ...m, unidad_medida: { codigo: 'g' } })),
    findFirst: async ({ where }: any) => materias.find((m) => m.id === where.id && m.panaderia_id === where.panaderia_id) ?? null,
  },
  lote: {
    findMany: async ({ where }: any) =>
      lotes.filter((l) => l.panaderia_id === where.panaderia_id && l.materia_prima_id !== null && l.cantidad_disponible > 0),
  },
  parametro_inventario: {
    findMany: async ({ where }: any) => parametros.filter((p) => p.panaderia_id === where.panaderia_id && p.activo === where.activo),
    findFirst: async ({ where }: any) =>
      parametros.find((p) => p.panaderia_id === where.panaderia_id && p.materia_prima_id === where.materia_prima_id && p.activo === where.activo) ?? null,
    update: async ({ where, data }: any) => {
      const fila = parametros.find((p) => p.id === where.id)!;
      Object.assign(fila, data);
      return fila;
    },
    create: async ({ data }: any) => {
      const fila = { id: `param-${parametros.length + 1}`, activo: true, ...data };
      parametros.push(fila);
      return fila;
    },
  },
  proveedor: { findMany: async () => proveedores },
  formulacion: { findMany: async () => [] },
  produccion: { findFirst: async () => (primeraProduccion ? { fecha: primeraProduccion } : null) },
  consumo_produccion: {
    findMany: async ({ where }: any) => consumos.filter((c) => c.produccion.fecha >= where.produccion.fecha.gte),
  },
};

const presentacionHarina = (precio = 2000) => [
  {
    id: 'pres-harina',
    contenido: 1000,
    nombre: 'Bulto 1 kg',
    activa: true,
    presentacion_proveedor: [{ id: 'of-1', proveedor_id: PROV, precio_referencia: precio, vigente: true, tiempo_entrega_dias: 1, proveedor: { activo: true } }],
  },
];

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
  app.use('/reposicion', crearRouterReposicion(prismaFalso, () => AHORA));
  app.use('/abc', crearRouterAbc(prismaFalso, () => AHORA));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => {
  servidor.close();
});

beforeEach(() => {
  fallar = false;
  materias = [
    { id: HARINA, panaderia_id: PAN_A, codigo: 'MP-001', nombre: 'Harina', activa: true, controla_inventario: true, lead_time_dias: null, presentacion: presentacionHarina() },
    { id: SAL, panaderia_id: PAN_A, codigo: 'MP-007', nombre: 'Sal', activa: true, controla_inventario: true, lead_time_dias: null, presentacion: [] },
    { id: AJENA, panaderia_id: PAN_B, codigo: 'MP-001', nombre: 'Harina ajena', activa: true, controla_inventario: true, lead_time_dias: null, presentacion: [] },
  ];
  lotes = [
    { panaderia_id: PAN_A, materia_prima_id: HARINA, cantidad_disponible: 5000, fecha_vencimiento: new Date('2026-12-01') },
    { panaderia_id: PAN_A, materia_prima_id: HARINA, cantidad_disponible: 800, fecha_vencimiento: new Date('2026-10-01') },
    { panaderia_id: PAN_A, materia_prima_id: SAL, cantidad_disponible: 300, fecha_vencimiento: null },
  ];
  parametros = [
    {
      id: 'param-harina', panaderia_id: PAN_A, materia_prima_id: HARINA, activo: true,
      costo_ordenar_s: decimal(1000), costo_mantener_h: decimal(2), tasa_mantenimiento_anual: null,
      dias_seguridad: decimal(2), stock_minimo: null, stock_maximo: null, vida_util_dias: null,
      consumo_semanal_declarado: decimal(7000), lead_time_dias: null, porcentaje_perdida_tolerable: null,
    },
  ];
  proveedores = [{ id: PROV, nombre: 'Distribuidora Central', dias_entrega: [3], hora_limite_pedido: '16:00', pedido_minimo: decimal(750000) }];
  consumos = [];
  primeraProduccion = null;
});

async function llamar(metodo: string, ruta: string, rol = 'administrador', cuerpo?: unknown) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-rol': rol },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as any };
}

describe('GET /reposicion/recomendaciones', () => {
  test('el operario no tiene acceso (compras y costos son de gestión)', async () => {
    expect((await llamar('GET', '/reposicion/recomendaciones', 'operario')).status).toBe(403);
    expect((await llamar('GET', '/reposicion/parametros', 'operario')).status).toBe(403);
    expect((await llamar('PUT', `/reposicion/parametros/${HARINA}`, 'operario', { dias_seguridad: 2 })).status).toBe(403);
  });

  test('calcula la recomendación completa de la harina con los datos de la base', async () => {
    const r = await llamar('GET', '/reposicion/recomendaciones');
    expect(r.status).toBe(200);
    expect(r.cuerpo.fecha).toBe('2026-10-26');
    const h = r.cuerpo.items.find((i: any) => i.materia_prima_id === HARINA);
    expect(h.estado).toBe('pedir');
    expect(h.existencia).toBe(5000); // los 800 vencidos no cuentan
    expect(h.existencia_vencida).toBe(800);
    expect(h.advertencias).toContain('existencia_vencida_excluida');
    expect(h.demanda_origen).toBe('declarada');
    expect(h.demanda_semanal).toBe(7000);
    expect(h.proxima_entrega).toBe('2026-10-28');
    expect(h.fecha_limite_pedido).toBe('2026-10-27');
    expect(h.ciclos_elegidos).toBe(3);
    expect(h.cantidad_recomendada).toBe(20000);
    expect(h.presentaciones_a_pedir).toBe(20);
    expect(h.costos.valor_pedido).toBe(40000);
    expect(h.proveedor).toEqual({ id: PROV, nombre: 'Distribuidora Central' });
  });

  test('un insumo sin parámetros ni oferta no se calcula y dice qué falta', async () => {
    const r = await llamar('GET', '/reposicion/recomendaciones');
    const sal = r.cuerpo.items.find((i: any) => i.materia_prima_id === SAL);
    expect(sal.estado).toBe('datos_insuficientes');
    expect(sal.faltantes).toEqual(['demanda', 'proveedor', 'plazo_entrega', 'stock_seguridad']);
    expect(sal.cantidad_recomendada).toBe(0);
  });

  test('no incluye insumos de otra panadería ni los que no se controlan', async () => {
    materias.push({ id: 'agua', panaderia_id: PAN_A, codigo: 'MP-099', nombre: 'Agua', activa: true, controla_inventario: false, lead_time_dias: null, presentacion: [] });
    const r = await llamar('GET', '/reposicion/recomendaciones');
    const ids = r.cuerpo.items.map((i: any) => i.materia_prima_id);
    expect(ids).not.toContain(AJENA);
    expect(ids).not.toContain('agua');
  });

  test('agrupa lo que hay que pedir por proveedor con el pedido mínimo', async () => {
    const r = await llamar('GET', '/reposicion/recomendaciones');
    expect(r.cuerpo.pedidos).toHaveLength(1);
    const p = r.cuerpo.pedidos[0];
    expect(p.proveedor.id).toBe(PROV);
    expect(p.costos.total).toBe(40000);
    expect(p.costos.pedido_minimo).toMatchObject({ cumple: false, faltante: 710000 });
  });

  test('usa el consumo real cuando ya hay 4 semanas', async () => {
    primeraProduccion = new Date('2026-09-28T15:00:00Z');
    consumos = [{ cantidad_consumida: 29000, lote: { materia_prima_id: HARINA }, produccion: { fecha: new Date('2026-10-10T15:00:00Z') } }];
    const r = await llamar('GET', '/reposicion/recomendaciones');
    const h = r.cuerpo.items.find((i: any) => i.materia_prima_id === HARINA);
    expect(h.demanda_origen).toBe('real');
    expect(h.demanda_semanal).toBe(7000);
  });

  test('con menos de 4 semanas sigue con el consumo declarado', async () => {
    primeraProduccion = new Date('2026-10-12T15:00:00Z');
    consumos = [{ cantidad_consumida: 20000, lote: { materia_prima_id: HARINA }, produccion: { fecha: new Date('2026-10-15T15:00:00Z') } }];
    const r = await llamar('GET', '/reposicion/recomendaciones');
    expect(r.cuerpo.items.find((i: any) => i.materia_prima_id === HARINA).demanda_origen).toBe('declarada');
  });

  test('un error de base de datos da 500 sin exponer detalles', async () => {
    const original = prismaFalso.lote.findMany;
    prismaFalso.lote.findMany = async () => {
      throw new Error('conexión caída');
    };
    try {
      const r = await sinErroresEnConsola(() => llamar('GET', '/reposicion/recomendaciones'));
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.cuerpo)).not.toContain('conexión');
    } finally {
      prismaFalso.lote.findMany = original;
    }
  });
});

describe('GET /reposicion/parametros', () => {
  test('muestra los parámetros y las tres fuentes de consumo lado a lado', async () => {
    primeraProduccion = new Date('2026-09-28T15:00:00Z');
    consumos = [{ cantidad_consumida: 14500, lote: { materia_prima_id: HARINA }, produccion: { fecha: new Date('2026-10-10T15:00:00Z') } }];
    const r = await llamar('GET', '/reposicion/parametros');
    expect(r.status).toBe(200);
    const h = r.cuerpo.items.find((i: any) => i.materia_prima_id === HARINA);
    expect(h.parametros).toMatchObject({ costo_pedido: 1000, costo_mantener_h: 2, dias_seguridad: 2 });
    expect(h.consumo_semanal.declarado).toBe(7000);
    expect(h.consumo_semanal.estimado_recetas).toBeNull();
    expect(h.consumo_semanal.real).toEqual({ semanal: 3500, semanas_observadas: 4 });
    expect(h.oferta.proveedor.nombre).toBe('Distribuidora Central');
    const sal = r.cuerpo.items.find((i: any) => i.materia_prima_id === SAL);
    expect(sal.parametros).toBeNull();
    expect(sal.oferta).toBeNull();
  });
});

describe('PUT /reposicion/parametros/:materiaPrimaId', () => {
  test('crea los parámetros de un insumo que no tenía', async () => {
    const r = await llamar('PUT', `/reposicion/parametros/${SAL}`, 'administrador', { costo_ordenar_s: 20000, dias_seguridad: 3 });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ materia_prima_id: SAL, costo_ordenar_s: 20000, dias_seguridad: 3, stock_minimo: null });
    const fila = parametros.find((p) => p.materia_prima_id === SAL)!;
    expect(fila.panaderia_id).toBe(PAN_A);
    expect(fila.activo).toBe(true);
  });

  test('cambia solo lo enviado y deja el resto como estaba', async () => {
    const r = await llamar('PUT', `/reposicion/parametros/${HARINA}`, 'administrador', { vida_util_dias: 14 });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ vida_util_dias: 14, costo_ordenar_s: 1000, dias_seguridad: 2 });
    expect(parametros).toHaveLength(1);
  });

  test('null borra un valor', async () => {
    const r = await llamar('PUT', `/reposicion/parametros/${HARINA}`, 'administrador', { dias_seguridad: null });
    expect(r.cuerpo.dias_seguridad).toBeNull();
  });

  test('datos inválidos dan 400 y no guardan nada', async () => {
    const r = await llamar('PUT', `/reposicion/parametros/${HARINA}`, 'administrador', { dias_seguridad: -1, panaderia_id: PAN_B });
    expect(r.status).toBe(400);
    expect(r.cuerpo.errores).toHaveLength(2);
    expect(parametros[0].dias_seguridad).toBe(2);
  });

  test('el stock mínimo no puede superar al máximo, contando lo ya guardado', async () => {
    await llamar('PUT', `/reposicion/parametros/${HARINA}`, 'administrador', { stock_maximo: 50000 });
    const r = await llamar('PUT', `/reposicion/parametros/${HARINA}`, 'administrador', { stock_minimo: 60000 });
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toContain('stock mínimo');
    expect(parametros[0].stock_minimo).toBeNull();
  });

  test('identificador mal formado da 400; insumo inexistente o de otra panadería da 404', async () => {
    expect((await llamar('PUT', '/reposicion/parametros/abc', 'administrador', { dias_seguridad: 2 })).status).toBe(400);
    expect((await llamar('PUT', `/reposicion/parametros/${AJENA}`, 'administrador', { dias_seguridad: 2 })).status).toBe(404);
    expect(parametros).toHaveLength(1);
  });

  test('lo que se guarda cambia la recomendación', async () => {
    await llamar('PUT', `/reposicion/parametros/${HARINA}`, 'administrador', { vida_util_dias: 14 });
    const r = await llamar('GET', '/reposicion/recomendaciones');
    const h = r.cuerpo.items.find((i: any) => i.materia_prima_id === HARINA);
    expect(h.ciclos_elegidos).toBe(2); // la vida útil limita a 14 días de cobertura
    expect(h.cantidad_recomendada).toBe(13000);
  });
});

describe('GET /abc?fuente=', () => {
  test('rechaza una fuente desconocida', async () => {
    expect((await llamar('GET', '/abc?fuente=otra')).status).toBe(400);
  });

  test('por defecto usa las recetas y lo dice', async () => {
    const r = await llamar('GET', '/abc');
    expect(r.status).toBe(200);
    expect(r.cuerpo.fuente).toBe('estimada');
  });

  test('con fuente real clasifica con el consumo registrado y avisa de los insumos sin datos', async () => {
    primeraProduccion = new Date('2026-09-28T15:00:00Z');
    consumos = [{ cantidad_consumida: 29000, lote: { materia_prima_id: HARINA }, produccion: { fecha: new Date('2026-10-10T15:00:00Z') } }];
    const r = await llamar('GET', '/abc?fuente=real');
    expect(r.status).toBe(200);
    expect(r.cuerpo.fuente).toBe('real');
    expect(r.cuerpo.datos_insuficientes).toBe(false);
    const harina = r.cuerpo.items.find((i: any) => i.codigo === 'MP-001');
    expect(harina.demanda_anual_kg).toBe(364); // 7.000 g por semana × 52
    expect(harina.clase).toBe('A');
    expect(r.cuerpo.insumos_sin_consumo_real.map((i: any) => i.codigo)).toEqual(['MP-007']);
    expect(r.cuerpo.supuestos.semanas_minimas_consumo_real).toBe(4);
  });

  test('sin consumo suficiente no inventa una clasificación', async () => {
    const r = await llamar('GET', '/abc?fuente=real');
    expect(r.cuerpo.datos_insuficientes).toBe(true);
    expect(r.cuerpo.items).toEqual([]);
    expect(r.cuerpo.insumos_sin_consumo_real).toHaveLength(2);
  });
});
