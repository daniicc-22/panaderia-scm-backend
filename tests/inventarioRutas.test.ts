import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterInventario } from '../src/routes/inventario';
import { hoyColombia } from '../src/utils/entradas';

const PAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USU = '99999999-9999-4999-8999-999999999999';
const MP_HARINA = '22222222-2222-4222-8222-222222222221';
const MP_LEVADURA = '22222222-2222-4222-8222-222222222222';
const MP_AJENA = '22222222-2222-4222-8222-222222222299';
const MP_AGUA = '22222222-2222-4222-8222-222222222298';
const PRES = '33333333-3333-4333-8333-333333333331';
const PRES_LEV = '33333333-3333-4333-8333-333333333332';
const PROV_1 = '44444444-4444-4444-8444-444444444441';
const PROV_2 = '44444444-4444-4444-8444-444444444442';
const PROV_OFF = '44444444-4444-4444-8444-444444444443';

const NOMBRES: Record<string, string> = { [PROV_1]: 'Zeta Ltda', [PROV_2]: 'Alfa SAS', [PROV_OFF]: 'Inactivo' };

type Fila = Record<string, any>;
let materias: Fila[], presentaciones: Fila[], ofertas: Fila[], lotes: Fila[];
let compras: Fila[], detalles: Fila[], recepciones: Fila[];
let asignado: boolean;
let fallarEnLote: boolean;
let contador = 0;
let rol = 'administrador';
let movimientos: Fila[] = [];
let conteoAbierto: { numero: number } | null = null;

const OPERADORES = ['not', 'equals', 'gt', 'startsWith'];
function coincide(fila: Fila, where: any): boolean {
  return Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      if ('not' in v) return fila[k] !== v.not;
      if ('equals' in v) return String(fila[k]).toLowerCase() === String(v.equals).toLowerCase();
      if ('gt' in v) return Number(fila[k]) > v.gt;
      if ('startsWith' in v) return String(fila[k] ?? '').startsWith(v.startsWith);
      if (!Object.keys(v).some((x) => OPERADORES.includes(x))) return coincide(fila[k] ?? {}, v);
    }
    return fila[k] === v;
  });
}

const hoy = () => hoyColombia();
const fechaMas = (dias: number) => new Date(Date.parse(`${hoy()}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

const prismaFalso: any = {
  materia_prima: {
    findFirst: async ({ where }: any) => {
      const m = materias.find((x) => coincide(x, where));
      return m ? { ...m, unidad_medida: { codigo: 'g' } } : null;
    },
    findMany: async ({ where, include }: any) =>
      materias
        .filter((x) => coincide(x, where))
        .map((m) => ({
          ...m,
          unidad_medida: { codigo: 'g' },
          ...(include?.presentacion
            ? {
                presentacion: presentaciones
                  .filter((p) => p.materia_prima_id === m.id)
                  .map((p) => ({
                    ...p,
                    presentacion_proveedor: ofertas
                      .filter((o) => o.presentacion_id === p.id)
                      .map((o) => ({ ...o, proveedor: { id: o.proveedor_id, nombre: NOMBRES[o.proveedor_id], activo: o.proveedor_activo } })),
                  })),
              }
            : {}),
        })),
  },
  presentacion: { findFirst: async ({ where }: any) => presentaciones.find((p) => coincide(p, where)) ?? null },
  usuario_panaderia: { findFirst: async () => (asignado ? { usuario_id: USU } : null) },
  presentacion_proveedor: {
    findMany: async ({ where }: any) =>
      ofertas.filter((o) => coincide({ ...o, proveedor: { activo: o.proveedor_activo } }, where)),
  },
  lote: {
    findFirst: async ({ where }: any) => lotes.find((l) => coincide(l, where)) ?? null,
    findMany: async ({ where }: any) => lotes.filter((l) => coincide(l, where)),
    updateMany: async ({ where, data }: any) => {
      const hallados = lotes.filter((l) => coincide(l, where));
      hallados.forEach((l) => Object.assign(l, data));
      return { count: hallados.length };
    },
    count: async ({ where }: any) => lotes.filter((l) => coincide(l, where)).length,
    create: async ({ data }: any) => {
      if (fallarEnLote) throw new Error('falla simulada');
      const fila = { id: `lote-${++contador}`, created_at: new Date(), ...data };
      lotes.push(fila);
      return fila;
    },
  },
  $queryRaw: async () => [],
  tipo_movimiento_inventario: { findFirst: async ({ where }: any) => ({ id: `tipo-${where.codigo}`, codigo: where.codigo }) },
  movimiento_inventario: {
    // Imita el trigger de la base: aplica el efecto sobre el lote
    create: async ({ data }: any) => {
      const lote = lotes.find((l) => l.id === data.lote_id)!;
      lote.cantidad_disponible += data.tipo_movimiento_id === 'tipo-ajuste_entrada' ? data.cantidad : -data.cantidad;
      movimientos.push(data);
      return data;
    },
  },
  detalle_conteo: { findFirst: async () => (conteoAbierto ? { conteo: conteoAbierto } : null) },
  compra: {
    create: async ({ data }: any) => {
      const f = { id: `compra-${++contador}`, ...data };
      compras.push(f);
      return f;
    },
  },
  detalle_compra: {
    create: async ({ data }: any) => {
      const f = { id: `det-${++contador}`, ...data };
      detalles.push(f);
      return f;
    },
  },
  detalle_recepcion: {
    create: async ({ data }: any) => {
      const f = { id: `rec-${++contador}`, ...data };
      recepciones.push(f);
      return f;
    },
  },
  // Transacción simulada: si algo falla se deshace todo lo escrito
  $transaction: async (fn: any) => {
    const copia = [compras.length, detalles.length, recepciones.length, lotes.length];
    try {
      return await fn(prismaFalso);
    } catch (e) {
      compras.length = copia[0];
      detalles.length = copia[1];
      recepciones.length = copia[2];
      lotes.length = copia[3];
      throw e;
    }
  },
};

let servidor: ReturnType<express.Express['listen']>;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.usuario = { id: USU, email: 'x@x.co', rol };
    req.panaderiaId = PAN;
    next();
  });
  app.use('/inventario', crearRouterInventario(prismaFalso));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

beforeEach(() => {
  rol = 'administrador';
  movimientos = [];
  conteoAbierto = null;
  asignado = true;
  fallarEnLote = false;
  materias = [
    { id: MP_HARINA, panaderia_id: PAN, codigo: 'MP-001', nombre: 'Harina', activa: true, controla_inventario: true, criterio_rotacion: null, unidad_base_id: 'u' },
    { id: MP_LEVADURA, panaderia_id: PAN, codigo: 'MP-002', nombre: 'Levadura', activa: true, controla_inventario: true, criterio_rotacion: 'FEFO', unidad_base_id: 'u' },
    { id: MP_AJENA, panaderia_id: OTRA, codigo: 'MP-001', nombre: 'Ajena', activa: true, controla_inventario: true, criterio_rotacion: null, unidad_base_id: 'u' },
  ];
  presentaciones = [
    { id: PRES, panaderia_id: PAN, materia_prima_id: MP_HARINA, nombre: 'Bulto 50 kg', contenido: 50000, activa: true },
    { id: PRES_LEV, panaderia_id: PAN, materia_prima_id: MP_LEVADURA, nombre: 'Paquete 500 g', contenido: 500, activa: true },
  ];
  ofertas = [
    { id: 'o1', panaderia_id: PAN, presentacion_id: PRES, proveedor_id: PROV_1, precio_referencia: 87150, vigente: true, proveedor_activo: true },
    { id: 'o2', panaderia_id: PAN, presentacion_id: PRES, proveedor_id: PROV_2, precio_referencia: 90000, vigente: true, proveedor_activo: true },
    { id: 'o3', panaderia_id: PAN, presentacion_id: PRES, proveedor_id: PROV_OFF, precio_referencia: 50000, vigente: true, proveedor_activo: false },
    { id: 'o4', panaderia_id: PAN, presentacion_id: PRES_LEV, proveedor_id: PROV_1, precio_referencia: 12000, vigente: true, proveedor_activo: true },
  ];
  lotes = [];
  compras = [];
  detalles = [];
  recepciones = [];
});

const post = async (cuerpo: unknown) => {
  const r = await fetch(`${base}/inventario/entradas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, body: (await r.json()) as any };
};
const get = async (ruta: string) => {
  const r = await fetch(`${base}/inventario${ruta}`);
  return { status: r.status, body: (await r.json()) as any };
};
const entrada = (extra: Record<string, unknown> = {}) => ({ materia_prima_id: MP_HARINA, presentacion_id: PRES, cantidad: 2, ...extra });

describe('POST /entradas', () => {
  test('crea compra, detalle, recepción y lote con la cantidad en unidad base y el costo por gramo', async () => {
    const r = await post(entrada());
    expect(r.status).toBe(201);
    expect(compras).toHaveLength(1);
    expect(compras[0]).toMatchObject({ panaderia_id: PAN, proveedor_id: PROV_1, usuario_id: USU, estado: 'completa' });
    expect(detalles[0]).toMatchObject({ compra_id: compras[0].id, presentacion_proveedor_id: 'o1', cantidad_pedida: 2, precio_unitario_pactado: 87150 });
    expect(recepciones[0]).toMatchObject({ detalle_compra_id: detalles[0].id, usuario_id: USU, cantidad_recibida: 2 });
    expect(lotes).toHaveLength(1);
    expect(lotes[0]).toMatchObject({
      panaderia_id: PAN,
      materia_prima_id: MP_HARINA,
      detalle_recepcion_id: recepciones[0].id,
      cantidad_inicial: 100000,
      cantidad_disponible: 100000,
      costo_unitario: 1.743,
    });
    expect(r.body.lote).toMatchObject({ materia_prima_id: MP_HARINA, cantidad: 100000, unidad: 'g', costo_unitario: 1.743 });
  });

  test('el operario registra la entrada pero no recibe costos', async () => {
    rol = 'operario';
    const r = await post(entrada());
    expect(r.status).toBe(201);
    expect(r.body.lote).not.toHaveProperty('costo_unitario');
    expect(JSON.stringify(r.body)).not.toContain('1.743');
  });

  test('sin proveedor elige la mejor oferta vigente de un proveedor activo', async () => {
    await post(entrada());
    expect(detalles[0].presentacion_proveedor_id).toBe('o1');
  });

  test('con proveedor indicado usa su oferta aunque sea más cara', async () => {
    const r = await post(entrada({ proveedor_id: PROV_2 }));
    expect(r.status).toBe(201);
    expect(compras[0].proveedor_id).toBe(PROV_2);
    expect(lotes[0].costo_unitario).toBe(1.8);
  });

  test('409 si el proveedor indicado no tiene oferta vigente o está desactivado', async () => {
    expect((await post(entrada({ proveedor_id: PROV_OFF }))).status).toBe(409);
    ofertas.find((o) => o.id === 'o2')!.vigente = false;
    expect((await post(entrada({ proveedor_id: PROV_2 }))).status).toBe(409);
    expect(lotes).toHaveLength(0);
  });

  test('409 si la presentación no tiene ninguna oferta que cuente', async () => {
    ofertas = ofertas.filter((o) => o.presentacion_id !== PRES);
    const r = await post(entrada());
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('administrador');
    expect(compras).toHaveLength(0);
  });

  test('400 con cuerpo inválido y sin escribir nada', async () => {
    const r = await post({ materia_prima_id: 'x', cantidad: -1 });
    expect(r.status).toBe(400);
    expect(r.body.errores.length).toBeGreaterThan(1);
    expect(compras).toHaveLength(0);
  });

  test('404 si el insumo es de otra panadería, está inactivo o la presentación es de otro insumo', async () => {
    expect((await post(entrada({ materia_prima_id: MP_AJENA }))).status).toBe(404);
    materias[0].activa = false;
    expect((await post(entrada())).status).toBe(404);
    materias[0].activa = true;
    expect((await post(entrada({ presentacion_id: PRES_LEV }))).status).toBe(404);
    presentaciones[0].activa = false;
    expect((await post(entrada())).status).toBe(404);
    expect(lotes).toHaveLength(0);
  });

  test('FEFO exige vencimiento; vencido se rechaza; hoy y futuro se aceptan', async () => {
    const lev = { materia_prima_id: MP_LEVADURA, presentacion_id: PRES_LEV, cantidad: 1 };
    expect((await post(lev)).status).toBe(400);
    expect((await post({ ...lev, fecha_vencimiento: fechaMas(-1) })).status).toBe(400);
    expect((await post({ ...lev, fecha_vencimiento: hoy() })).status).toBe(201);
    const ok = await post({ ...lev, fecha_vencimiento: fechaMas(90) });
    expect(ok.status).toBe(201);
    expect(ok.body.lote.fecha_vencimiento).toBe(fechaMas(90));
    expect(lotes[1].fecha_vencimiento.toISOString()).toBe(`${fechaMas(90)}T00:00:00.000Z`);
  });

  test('403 si el usuario no está asignado a la panadería', async () => {
    asignado = false;
    const r = await post(entrada());
    expect(r.status).toBe(403);
    expect(compras).toHaveLength(0);
  });

  test('409 si el código de lote ya existe para ese insumo (sin distinguir mayúsculas)', async () => {
    expect((await post(entrada({ codigo_lote: 'ABC-1' }))).status).toBe(201);
    expect((await post(entrada({ codigo_lote: 'abc-1' }))).status).toBe(409);
    expect(lotes).toHaveLength(1);
  });

  test('el mismo código en otro insumo sí se permite', async () => {
    await post(entrada({ codigo_lote: 'ABC-1' }));
    const r = await post({ materia_prima_id: MP_LEVADURA, presentacion_id: PRES_LEV, cantidad: 1, fecha_vencimiento: fechaMas(30), codigo_lote: 'ABC-1' });
    expect(r.status).toBe(201);
  });

  test('sin código genera uno por día y consecutivo', async () => {
    const a = await post(entrada());
    const b = await post(entrada());
    const dia = hoy().replace(/-/g, '');
    expect(a.body.lote.codigo_lote).toBe(`L-${dia}-001`);
    expect(b.body.lote.codigo_lote).toBe(`L-${dia}-002`);
    expect(lotes[1].codigo_lote).toBe(`L-${dia}-002`);
  });

  test('si falla al crear el lote se deshace todo y responde 500 sin detalles internos', async () => {
    fallarEnLote = true;
    const original = console.error;
    console.error = () => {};
    try {
      const r = await post(entrada());
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toContain('falla simulada');
    } finally {
      console.error = original;
    }
    expect(compras).toHaveLength(0);
    expect(detalles).toHaveLength(0);
    expect(recepciones).toHaveLength(0);
    expect(lotes).toHaveLength(0);
  });
});

describe('GET /inventario', () => {
  const sembrar = () => {
    lotes.push(
      { id: 'l1', panaderia_id: PAN, materia_prima_id: MP_HARINA, cantidad_inicial: 100000, cantidad_disponible: 60000, costo_unitario: 1.743, fecha_vencimiento: null, codigo_lote: 'H1', created_at: new Date('2026-10-01T10:00:00Z') },
      { id: 'l2', panaderia_id: PAN, materia_prima_id: MP_HARINA, cantidad_inicial: 50000, cantidad_disponible: 0, costo_unitario: 1.8, fecha_vencimiento: null, codigo_lote: 'H0', created_at: new Date('2026-09-01T10:00:00Z') },
      { id: 'l3', panaderia_id: PAN, materia_prima_id: MP_LEVADURA, cantidad_inicial: 500, cantidad_disponible: 500, costo_unitario: 24, fecha_vencimiento: new Date(`${fechaMas(3)}T00:00:00Z`), codigo_lote: 'L1', created_at: new Date('2026-10-02T10:00:00Z') },
      { id: 'l4', panaderia_id: OTRA, materia_prima_id: MP_AJENA, cantidad_inicial: 9, cantidad_disponible: 9, costo_unitario: 1, fecha_vencimiento: null, codigo_lote: 'X', created_at: new Date('2026-10-02T10:00:00Z') },
    );
  };

  test('resume existencias por insumo con estado y valor para gestión; ignora otra panadería', async () => {
    sembrar();
    const r = await get('/');
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(2);
    const [harina, lev] = r.body.items;
    expect(harina).toMatchObject({ nombre: 'Harina', unidad: 'g', stock: 60000, lotes_activos: 1, estado: 'ok', proximo_vencimiento: null, valor: 104580 });
    expect(lev).toMatchObject({ nombre: 'Levadura', stock: 500, estado: 'por_vencer', proximo_vencimiento: fechaMas(3), criterio_rotacion: 'FEFO', valor: 12000 });
  });

  test('el operario ve las existencias pero ningún valor', async () => {
    sembrar();
    rol = 'operario';
    const r = await get('/');
    expect(r.status).toBe(200);
    for (const it of r.body.items) expect(it).not.toHaveProperty('valor');
    expect(JSON.stringify(r.body)).not.toContain('1.743');
  });

  test('un insumo sin lotes aparece sin_stock', async () => {
    const r = await get('/');
    expect(r.body.items.map((i: any) => i.estado)).toEqual(['sin_stock', 'sin_stock']);
  });
});

describe('GET /inventario/materias-primas/:id/lotes', () => {
  test('400 con id inválido y 404 si es de otra panadería', async () => {
    expect((await get('/materias-primas/xyz/lotes')).status).toBe(400);
    expect((await get(`/materias-primas/${MP_AJENA}/lotes`)).status).toBe(404);
  });

  test('lista solo lotes con existencias, en orden FEFO para un insumo FEFO', async () => {
    lotes.push(
      { id: 'a', panaderia_id: PAN, materia_prima_id: MP_LEVADURA, cantidad_inicial: 500, cantidad_disponible: 500, costo_unitario: 24, fecha_vencimiento: new Date(`${fechaMas(60)}T00:00:00Z`), codigo_lote: 'A', created_at: new Date('2026-10-01T00:00:00Z') },
      { id: 'b', panaderia_id: PAN, materia_prima_id: MP_LEVADURA, cantidad_inicial: 500, cantidad_disponible: 200, costo_unitario: 24, fecha_vencimiento: new Date(`${fechaMas(10)}T00:00:00Z`), codigo_lote: 'B', created_at: new Date('2026-10-05T00:00:00Z') },
      { id: 'c', panaderia_id: PAN, materia_prima_id: MP_LEVADURA, cantidad_inicial: 500, cantidad_disponible: 0, costo_unitario: 24, fecha_vencimiento: new Date(`${fechaMas(5)}T00:00:00Z`), codigo_lote: 'C', created_at: new Date('2026-10-06T00:00:00Z') },
    );
    const r = await get(`/materias-primas/${MP_LEVADURA}/lotes`);
    expect(r.status).toBe(200);
    expect(r.body.lotes.map((l: any) => l.codigo_lote)).toEqual(['B', 'A']);
    expect(r.body.resumen).toMatchObject({ stock: 700, lotes_activos: 2, valor: 16800 });
    expect(r.body.lotes[0].costo_unitario).toBe(24);
  });

  test('el operario no recibe costos ni valor', async () => {
    rol = 'operario';
    lotes.push({ id: 'a', panaderia_id: PAN, materia_prima_id: MP_HARINA, cantidad_inicial: 10, cantidad_disponible: 10, costo_unitario: 1.743, fecha_vencimiento: null, codigo_lote: 'A', created_at: new Date('2026-10-01T00:00:00Z') });
    const r = await get(`/materias-primas/${MP_HARINA}/lotes`);
    expect(r.status).toBe(200);
    expect(r.body.lotes[0]).not.toHaveProperty('costo_unitario');
    expect(r.body.resumen).not.toHaveProperty('valor');
  });
});

describe('GET /inventario/opciones-entrada', () => {
  test('lista insumos activos con presentaciones activas y proveedores con oferta vigente, sin precios', async () => {
    const r = await get('/opciones-entrada');
    expect(r.status).toBe(200);
    expect(r.body.materias.map((m: any) => m.nombre)).toEqual(['Harina', 'Levadura']);
    const harina = r.body.materias[0];
    expect(harina).toMatchObject({ id: MP_HARINA, unidad: 'g', criterio_rotacion: null });
    expect(harina.presentaciones).toEqual([
      { id: PRES, nombre: 'Bulto 50 kg', contenido: 50000, proveedores: [{ id: PROV_2, nombre: 'Alfa SAS' }, { id: PROV_1, nombre: 'Zeta Ltda' }] },
    ]);
    expect(r.body.materias[1].criterio_rotacion).toBe('FEFO');
    expect(JSON.stringify(r.body)).not.toMatch(/precio|87150|costo/);
  });

  test('ordena presentaciones de mayor a menor contenido y no repite proveedor aunque tenga dos ofertas', async () => {
    presentaciones.push({ id: 'p-chico', panaderia_id: PAN, materia_prima_id: MP_HARINA, nombre: 'Libra', contenido: 500, activa: true });
    presentaciones.push({ id: 'p-grande', panaderia_id: PAN, materia_prima_id: MP_HARINA, nombre: 'Tonelada', contenido: 1000000, activa: true });
    ofertas.push({ id: 'o9', panaderia_id: PAN, presentacion_id: PRES, proveedor_id: PROV_1, precio_referencia: 1, vigente: true, proveedor_activo: true });
    const r = await get('/opciones-entrada');
    const pres = r.body.materias[0].presentaciones;
    expect(pres.map((p: any) => p.nombre)).toEqual(['Tonelada', 'Bulto 50 kg', 'Libra']);
    expect(pres[1].proveedores.map((p: any) => p.id)).toEqual([PROV_2, PROV_1]);
  });

  test('el operario puede consultarlo; no incluye insumos de otra panadería ni inactivos', async () => {
    rol = 'operario';
    materias[1].activa = false;
    const r = await get('/opciones-entrada');
    expect(r.status).toBe(200);
    expect(r.body.materias.map((m: any) => m.nombre)).toEqual(['Harina']);
  });

  test('una oferta no vigente o de proveedor desactivado no cuenta; sin ofertas aparece sin proveedores; una presentación inactiva no aparece', async () => {
    ofertas.find((o) => o.id === 'o2')!.vigente = false;
    const r1 = await get('/opciones-entrada');
    expect(r1.body.materias[0].presentaciones[0].proveedores).toEqual([{ id: PROV_1, nombre: 'Zeta Ltda' }]);
    ofertas = ofertas.filter((o) => o.presentacion_id !== PRES);
    presentaciones[1].activa = false;
    const r = await get('/opciones-entrada');
    expect(r.body.materias[0].presentaciones[0].proveedores).toEqual([]);
    expect(r.body.materias[1].presentaciones).toEqual([]);
  });

  test('si la base falla responde 500 genérico', async () => {
    const original = prismaFalso.materia_prima.findMany;
    prismaFalso.materia_prima.findMany = async () => {
      throw new Error('boom interno');
    };
    const silencio = console.error;
    console.error = () => {};
    try {
      const r = await get('/opciones-entrada');
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toContain('boom');
    } finally {
      console.error = silencio;
      prismaFalso.materia_prima.findMany = original;
    }
  });
});

describe('insumos que no se controlan en inventario (agua)', () => {
  const conAgua = () =>
    materias.push({ id: MP_AGUA, panaderia_id: PAN, codigo: 'MP-008', nombre: 'Agua', activa: true, controla_inventario: false, criterio_rotacion: null, unidad_base_id: 'u' });

  const get = async (ruta: string) => ({ status: (await fetch(`${base}/inventario${ruta}`)).status });
  const json = async (ruta: string) => (await (await fetch(`${base}/inventario${ruta}`)).json()) as any;

  test('no aparecen en las existencias', async () => {
    conAgua();
    const r = await json('');
    expect(r.items.map((i: any) => i.codigo)).toEqual(['MP-001', 'MP-002']);
  });

  test('no se ofrecen en el formulario de entrada', async () => {
    conAgua();
    const r = await json('/opciones-entrada');
    expect(r.materias.map((m: any) => m.codigo)).toEqual(['MP-001', 'MP-002']);
  });

  test('no se registran entradas: 409 y no se crea nada', async () => {
    conAgua();
    const r = await fetch(`${base}/inventario/entradas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materia_prima_id: MP_AGUA, presentacion_id: PRES, cantidad: 1 }),
    });
    expect(r.status).toBe(409);
    expect(((await r.json()) as any).error).toMatch(/no se controla/);
    expect(compras).toHaveLength(0);
    expect(lotes).toHaveLength(0);
  });
});

describe('GET /inventario/alertas', () => {
  const lote = (id: string, materia: string, disp: number, dias: number | null, extra: Record<string, unknown> = {}) => ({
    id, panaderia_id: PAN, materia_prima_id: materia, cantidad_inicial: disp, cantidad_disponible: disp, costo_unitario: 2,
    fecha_vencimiento: dias === null ? null : new Date(`${fechaMas(dias)}T00:00:00Z`), codigo_lote: id, created_at: new Date('2026-10-01T10:00:00Z'), ...extra,
  });
  const sembrar = () =>
    lotes.push(
      lote('venc', MP_LEVADURA, 100, -2),
      lote('pronto', MP_HARINA, 1000, 3),
      lote('lejos', MP_HARINA, 1000, 40),
      lote('sin-fecha', MP_HARINA, 1000, null),
      lote('agotado', MP_HARINA, 0, -5),
      lote('ajeno', MP_AJENA, 50, -1, { panaderia_id: OTRA }),
    );

  test('lista vencidos y por vencer con datos del insumo, en orden de vencimiento, y resume con valor para gestión', async () => {
    sembrar();
    const r = await get('/alertas');
    expect(r.status).toBe(200);
    expect(r.body.dias_alerta).toBe(7);
    expect(r.body.fecha).toBe(hoy());
    expect(r.body.items.map((i: any) => [i.lote_id, i.estado, i.dias])).toEqual([['venc', 'vencido', -2], ['pronto', 'por_vencer', 3]]);
    expect(r.body.items[0]).toMatchObject({ nombre: 'Levadura', codigo: 'MP-002', unidad: 'g', cantidad_disponible: 100, valor: 200, fecha_vencimiento: fechaMas(-2) });
    expect(r.body.resumen).toEqual({ vencidos: 1, por_vencer: 1, valor_vencido: 200, valor_por_vencer: 2000 });
  });

  test('el operario ve las alertas sin ningún valor', async () => {
    sembrar();
    rol = 'operario';
    const r = await get('/alertas');
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(2);
    for (const it of r.body.items) expect(it).not.toHaveProperty('valor');
    expect(r.body.resumen).toEqual({ vencidos: 1, por_vencer: 1 });
  });

  test('acepta días de aviso y rechaza valores no válidos con 400', async () => {
    sembrar();
    expect((await get('/alertas?dias=60')).body.items.map((i: any) => i.lote_id)).toEqual(['venc', 'pronto', 'lejos']); // 'lejos' vence en 40 días
    expect((await get('/alertas?dias=1')).body.items.map((i: any) => i.lote_id)).toEqual(['venc']);
    for (const malo of ['0', '61', 'x', '']) expect((await get(`/alertas?dias=${malo}`)).status).toBe(400);
  });

  test('un insumo sin control de inventario no genera alertas aunque tenga un lote antiguo', async () => {
    materias.push({ id: MP_AGUA, panaderia_id: PAN, codigo: 'MP-008', nombre: 'Agua', activa: true, controla_inventario: false, criterio_rotacion: null, unidad_base_id: 'u' });
    lotes.push(lote('agua-vieja', MP_AGUA, 500, -10));
    expect((await get('/alertas')).body.items).toEqual([]);
  });

  test('un insumo desactivado tampoco genera alertas y sin lotes la respuesta es vacía', async () => {
    expect((await get('/alertas')).body.resumen).toEqual({ vencidos: 0, por_vencer: 0, valor_vencido: 0, valor_por_vencer: 0 });
    sembrar();
    materias.find((m) => m.id === MP_LEVADURA)!.activa = false;
    expect((await get('/alertas')).body.items.map((i: any) => i.lote_id)).toEqual(['pronto']);
  });
});

describe('POST /inventario/lotes/:id/correccion', () => {
  const LOTE = '55555555-5555-4555-8555-555555555551';
  const corregir = async (id: string, cuerpo: unknown) => {
    const r = await fetch(`${base}/inventario/lotes/${id}/correccion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    return { status: r.status, body: (await r.json()) as any };
  };
  beforeEach(() => {
    lotes = [{ id: LOTE, panaderia_id: PAN, materia_prima_id: MP_HARINA, codigo_lote: 'L-1', cantidad_inicial: 4999900, cantidad_disponible: 4999900, costo_unitario: 2, fecha_vencimiento: null, created_at: new Date() }];
  });

  test('registra un ajuste de salida con su motivo y deja el lote en lo que realmente hay', async () => {
    const r = await corregir(LOTE, { cantidad_nueva: 49000, motivo: 'error_registro', observaciones: 'Se digitó mal el peso' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ cantidad_anterior: 4999900, cantidad_nueva: 49000, diferencia: -4950900, unidad: 'g', nombre: 'Harina', codigo_lote: 'L-1' });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]).toMatchObject({ lote_id: LOTE, tipo_movimiento_id: 'tipo-ajuste_salida', cantidad: 4950900, usuario_id: USU, panaderia_id: PAN });
    expect(movimientos[0].observaciones).toBe('Corrección de existencias: Error de registro (entrada o salida mal anotada) (Se digitó mal el peso)');
    expect(lotes[0].cantidad_disponible).toBe(49000);
  });
  test('si faltaba producto registra un ajuste de entrada', async () => {
    lotes[0].cantidad_disponible = 900;
    await corregir(LOTE, { cantidad_nueva: 1000, motivo: 'error_registro' });
    expect(movimientos[0]).toMatchObject({ tipo_movimiento_id: 'tipo-ajuste_entrada', cantidad: 100 });
    expect(lotes[0].cantidad_disponible).toBe(1000);
  });
  test('solo gestión puede corregir', async () => {
    rol = 'operario';
    expect((await corregir(LOTE, { cantidad_nueva: 1, motivo: 'error_registro' })).status).toBe(403);
    expect(movimientos).toHaveLength(0);
    expect(lotes[0].cantidad_disponible).toBe(4999900);
  });
  test('exige usuario asignado', async () => {
    asignado = false;
    expect((await corregir(LOTE, { cantidad_nueva: 1, motivo: 'error_registro' })).status).toBe(403);
    expect(movimientos).toHaveLength(0);
  });
  test('valida identificador, cantidad y motivo', async () => {
    expect((await corregir('xx', { cantidad_nueva: 1, motivo: 'error_registro' })).status).toBe(400);
    expect((await corregir(LOTE, { cantidad_nueva: -1, motivo: 'error_registro' })).status).toBe(400);
    expect((await corregir(LOTE, { cantidad_nueva: 1 })).status).toBe(400);
    expect((await corregir(LOTE, { cantidad_nueva: 1, motivo: 'otro' })).status).toBe(400); // "otro" pide explicación
    lotes[0].cantidad_disponible = 800;
    expect((await corregir(LOTE, { cantidad_nueva: 900, motivo: 'vencimiento' })).status).toBe(400); // vencimiento no sirve para sobrantes
    expect(movimientos).toHaveLength(0);
  });
  test('no corrige si la cantidad es la misma', async () => {
    lotes[0].cantidad_disponible = 800;
    const r = await corregir(LOTE, { cantidad_nueva: 800, motivo: 'error_registro' });
    expect(r.status).toBe(409);
    expect(movimientos).toHaveLength(0);
  });
  test('no encuentra lotes ajenos ni de insumos que no se controlan', async () => {
    lotes[0].panaderia_id = OTRA;
    expect((await corregir(LOTE, { cantidad_nueva: 1, motivo: 'error_registro' })).status).toBe(404);
    lotes[0].panaderia_id = PAN;
    materias[0].controla_inventario = false;
    expect((await corregir(LOTE, { cantidad_nueva: 1, motivo: 'error_registro' })).status).toBe(409);
    materias[0].controla_inventario = true;
    expect((await corregir('55555555-5555-4555-8555-5555555555aa', { cantidad_nueva: 1, motivo: 'error_registro' })).status).toBe(404);
    expect(movimientos).toHaveLength(0);
  });
  test('no corrige un lote que está en un conteo abierto', async () => {
    conteoAbierto = { numero: 3 };
    const r = await corregir(LOTE, { cantidad_nueva: 1, motivo: 'error_registro' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/conteo n\.º 3/);
    expect(movimientos).toHaveLength(0);
    expect(lotes[0].cantidad_disponible).toBe(4999900);
  });
});

describe('PATCH /inventario/lotes/:id/vencimiento', () => {
  const LOTE = '55555555-5555-4555-8555-555555555551';
  const cambiar = async (id: string, cuerpo: unknown) => {
    const r = await fetch(`${base}/inventario/lotes/${id}/vencimiento`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    return { status: r.status, body: (await r.json()) as any };
  };
  beforeEach(() => {
    lotes = [{ id: LOTE, panaderia_id: PAN, materia_prima_id: MP_HARINA, codigo_lote: 'L-1', cantidad_inicial: 500, cantidad_disponible: 500, costo_unitario: 2, fecha_vencimiento: new Date(`${fechaMas(-10)}T00:00:00Z`), created_at: new Date() }];
  });

  test('cambia la fecha y responde con la anterior y la nueva', async () => {
    const r = await cambiar(LOTE, { fecha_vencimiento: fechaMas(30) });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ lote_id: LOTE, codigo_lote: 'L-1', nombre: 'Harina', fecha_anterior: fechaMas(-10), fecha_nueva: fechaMas(30) });
    expect(lotes[0].fecha_vencimiento.toISOString().slice(0, 10)).toBe(fechaMas(30));
  });
  test('admite una fecha pasada (el lote pudo vencerse de verdad)', async () => {
    expect((await cambiar(LOTE, { fecha_vencimiento: fechaMas(-3) })).status).toBe(200);
  });
  test('un insumo sin FEFO puede quedar sin fecha; uno FEFO no', async () => {
    expect((await cambiar(LOTE, { fecha_vencimiento: null })).status).toBe(200);
    expect(lotes[0].fecha_vencimiento).toBeNull();
    materias[0].criterio_rotacion = 'FEFO';
    lotes[0].fecha_vencimiento = new Date(`${fechaMas(-10)}T00:00:00Z`);
    const r = await cambiar(LOTE, { fecha_vencimiento: null });
    expect(r.status).toBe(400);
    expect(lotes[0].fecha_vencimiento === null).toBe(false);
  });
  test('rechaza fechas inválidas, absurdas o ausentes', async () => {
    for (const f of ['2026-02-30', 'mañana', 20261231, '2019-12-31', `${Number(hoy().slice(0, 4)) + 11}-01-01`]) {
      expect((await cambiar(LOTE, { fecha_vencimiento: f })).status, String(f)).toBe(400);
    }
    expect((await cambiar(LOTE, {})).status).toBe(400);
    expect(lotes[0].fecha_vencimiento.toISOString().slice(0, 10)).toBe(fechaMas(-10));
  });
  test('la misma fecha responde 409', async () => {
    expect((await cambiar(LOTE, { fecha_vencimiento: fechaMas(-10) })).status).toBe(409);
  });
  test('solo gestión; no toca lotes ajenos ni inexistentes', async () => {
    rol = 'operario';
    expect((await cambiar(LOTE, { fecha_vencimiento: fechaMas(5) })).status).toBe(403);
    rol = 'administrador';
    expect((await cambiar('xx', { fecha_vencimiento: fechaMas(5) })).status).toBe(400);
    expect((await cambiar('55555555-5555-4555-8555-5555555555aa', { fecha_vencimiento: fechaMas(5) })).status).toBe(404);
    lotes[0].panaderia_id = OTRA;
    expect((await cambiar(LOTE, { fecha_vencimiento: fechaMas(5) })).status).toBe(404);
    expect(lotes[0].fecha_vencimiento.toISOString().slice(0, 10)).toBe(fechaMas(-10));
  });
});
