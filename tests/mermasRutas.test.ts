import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterMermas } from '../src/routes/mermas';

const PAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USU = '99999999-9999-4999-8999-999999999999';
const HARINA = '22222222-2222-4222-8222-222222222221';
const AZUCAR = '22222222-2222-4222-8222-222222222222';
const C_VENC = '33333333-3333-4333-8333-333333333331';
const C_QUEM = '33333333-3333-4333-8333-333333333332';
const C_OTRA = '33333333-3333-4333-8333-333333333333';
const C_INACT = '33333333-3333-4333-8333-333333333334';
const C_AJENA = '33333333-3333-4333-8333-333333333335';
const L_H = '44444444-4444-4444-8444-444444444441';
const L_A = '44444444-4444-4444-8444-444444444442';
const L_AJENO = '44444444-4444-4444-8444-444444444443';
const L_PROD = '44444444-4444-4444-8444-444444444444';
const P_EN = '55555555-5555-4555-8555-555555555551';
const P_FIN = '55555555-5555-4555-8555-555555555552';
const P_CANC = '55555555-5555-4555-8555-555555555553';
const P_PLAN = '55555555-5555-4555-8555-555555555554';
const P_AJENA = '55555555-5555-4555-8555-555555555559';
const TIPO = '77777777-7777-4777-8777-777777777771';

type Fila = Record<string, any>;
let causas: Fila[], lotes: Fila[], producciones: Fila[], consumos: Fila[], desperdicios: Fila[], movimientos: Fila[], materias: Fila[];
let asignado: boolean, hayTipo: boolean;
let rol = 'operario';
let contador = 0;

function coincide(fila: Fila, where: any): boolean {
  return Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(fila[k]);
    }
    return fila[k] === v;
  });
}
const uuid = () => `00000000-0000-4000-8000-${String(++contador).padStart(12, '0')}`;

const conRelaciones = (d: Fila) => {
  const causa = causas.find((c) => c.id === d.causa_id)!;
  const lote = d.lote_id ? lotes.find((l) => l.id === d.lote_id) : null;
  const prod = d.produccion_id ? producciones.find((p) => p.id === d.produccion_id) : null;
  return {
    ...d,
    causa_desperdicio: { codigo: causa.codigo, nombre: causa.nombre },
    lote: lote ? { codigo_lote: lote.codigo_lote, materia_prima_id: lote.materia_prima_id } : null,
    produccion: prod ? { producto: { nombre: prod.producto } } : null,
    usuario_panaderia: { usuario: { nombre: 'Ana Operaria' } },
  };
};

const prismaFalso: any = {
  usuario_panaderia: { findFirst: async () => (asignado ? { usuario_id: USU } : null) },
  causa_desperdicio: {
    findFirst: async ({ where }: any) => causas.find((c) => coincide(c, where)) ?? null,
    findMany: async ({ where }: any) => causas.filter((c) => coincide(c, where)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  },
  lote: { findFirst: async ({ where }: any) => lotes.find((l) => coincide(l, where)) ?? null },
  produccion: { findFirst: async ({ where }: any) => producciones.find((p) => coincide(p, where)) ?? null },
  consumo_produccion: { findFirst: async ({ where }: any) => consumos.find((c) => coincide(c, where)) ?? null },
  materia_prima: {
    findMany: async ({ where }: any) => materias.filter((m) => coincide(m, where)).map((m) => ({ ...m, unidad_medida: { codigo: 'g' } })),
  },
  tipo_movimiento_inventario: { findUnique: async () => (hayTipo ? { id: TIPO, codigo: 'salida_merma' } : null) },
  desperdicio: {
    create: async ({ data }: any) => {
      const d = { id: uuid(), fecha: new Date(Date.UTC(2026, 9, 25, 12, 0, contador)), ...data };
      desperdicios.push(d);
      return d;
    },
    findMany: async ({ where, orderBy, take }: any) =>
      desperdicios
        .filter((d) => coincide(d, where))
        .sort((a, b) => (orderBy?.fecha === 'asc' ? 1 : -1) * (a.fecha.getTime() - b.fecha.getTime()))
        .slice(0, take ?? 1000)
        .map(conRelaciones),
  },
  // Imita el disparador de la base: descuenta del lote y rechaza dejarlo en negativo
  movimiento_inventario: {
    create: async ({ data }: any) => {
      const l = lotes.find((x) => x.id === data.lote_id)!;
      const nuevo = Number(l.cantidad_disponible) - Number(data.cantidad);
      if (nuevo < 0) throw new Error(`El movimiento dejaría cantidad_disponible negativa en el lote ${l.id}`);
      l.cantidad_disponible = nuevo;
      const f = { id: uuid(), ...data };
      movimientos.push(f);
      return f;
    },
  },
  $queryRaw: async () => [],
  $transaction: async (fn: any) => {
    const copia = JSON.stringify({ lotes, desperdicios, movimientos });
    try {
      return await fn(prismaFalso);
    } catch (e) {
      const d = JSON.parse(copia);
      lotes.length = 0;
      lotes.push(...d.lotes);
      desperdicios.length = 0;
      desperdicios.push(...d.desperdicios.map((x: Fila) => ({ ...x, fecha: new Date(x.fecha) })));
      movimientos.length = 0;
      movimientos.push(...d.movimientos);
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
  app.use('/mermas', crearRouterMermas(prismaFalso));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

beforeEach(() => {
  rol = 'operario';
  asignado = true;
  hayTipo = true;
  contador = 0;
  causas = [
    { id: C_OTRA, panaderia_id: PAN, codigo: 'otra', nombre: 'Otra', descripcion: 'Distinta', activo: true },
    { id: C_VENC, panaderia_id: PAN, codigo: 'vencimiento', nombre: 'Vencimiento', descripcion: null, activo: true },
    { id: C_QUEM, panaderia_id: PAN, codigo: 'quemado', nombre: 'Quemado o sobrehorneado', descripcion: 'Horno', activo: true },
    { id: C_INACT, panaderia_id: PAN, codigo: 'hongos', nombre: 'Hongos', descripcion: null, activo: false },
    { id: C_AJENA, panaderia_id: OTRA, codigo: 'vencimiento', nombre: 'Vencimiento', descripcion: null, activo: true },
  ];
  materias = [
    { id: HARINA, panaderia_id: PAN, nombre: 'Harina' },
    { id: AZUCAR, panaderia_id: PAN, nombre: 'Azúcar' },
  ];
  const lote = (id: string, materia: string | null, disp: number, extra: Fila = {}) => ({
    id, panaderia_id: PAN, materia_prima_id: materia, cantidad_inicial: disp, cantidad_disponible: disp, costo_unitario: 2, codigo_lote: id.slice(-3), ...extra,
  });
  lotes = [lote(L_H, HARINA, 1000), lote(L_A, AZUCAR, 500), lote(L_AJENO, HARINA, 100, { panaderia_id: OTRA }), lote(L_PROD, null, 50)];
  producciones = [
    { id: P_EN, panaderia_id: PAN, estado: 'en_curso', producto: 'Pan dulce' },
    { id: P_FIN, panaderia_id: PAN, estado: 'finalizada', producto: 'Pambaso' },
    { id: P_CANC, panaderia_id: PAN, estado: 'cancelada', producto: 'Pan dulce' },
    { id: P_PLAN, panaderia_id: PAN, estado: 'planificada', producto: 'Pan dulce' },
    { id: P_AJENA, panaderia_id: OTRA, estado: 'en_curso', producto: 'Ajeno' },
  ];
  consumos = [{ id: 'c1', panaderia_id: PAN, produccion_id: P_EN, lote_id: L_H, cantidad_consumida: 300 }];
  desperdicios = [];
  movimientos = [];
});

const enviar = async (ruta: string, cuerpo: unknown) => {
  const r = await fetch(`${base}/mermas${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  return { status: r.status, body: (await r.json()) as any };
};
const obtener = async (ruta: string) => {
  const r = await fetch(`${base}/mermas${ruta}`);
  return { status: r.status, body: (await r.json()) as any };
};
const registrar = (cuerpo: unknown) => enviar('', cuerpo);
const deLote = (extra: Fila = {}) => ({ causa_id: C_VENC, etapa: 'almacenamiento', cantidad: 300, lote_id: L_H, ...extra });
const deProduccion = (extra: Fila = {}) => ({ causa_id: C_QUEM, etapa: 'produccion', cantidad: 1500, produccion_id: P_EN, ...extra });
const disponible = (id: string) => Number(lotes.find((l) => l.id === id)!.cantidad_disponible);

describe('GET /mermas/causas', () => {
  test('lista las activas de la panadería, con «Otra» al final', async () => {
    const r = await obtener('/causas');
    expect(r.status).toBe(200);
    expect(r.body.map((c: any) => c.nombre)).toEqual(['Quemado o sobrehorneado', 'Vencimiento', 'Otra']);
    expect(r.body[0]).toEqual({ id: C_QUEM, codigo: 'quemado', nombre: 'Quemado o sobrehorneado', descripcion: 'Horno' });
    expect(r.body[1].descripcion).toBe(null);
  });
});

describe('POST /mermas: merma de un lote', () => {
  test('descuenta el lote con un movimiento «salida_merma» ligado a la merma y guarda el costo', async () => {
    rol = 'administrador';
    const r = await registrar(deLote());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ causa_id: C_VENC, etapa: 'almacenamiento', cantidad: 300, lote_id: L_H, produccion_id: null, costo_estimado: 600 });
    expect(disponible(L_H)).toBe(700);
    expect(desperdicios).toHaveLength(1);
    expect(desperdicios[0]).toMatchObject({ panaderia_id: PAN, lote_id: L_H, produccion_id: null, causa_id: C_VENC, usuario_id: USU, cantidad: 300, etapa: 'almacenamiento', costo_estimado: 600 });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]).toMatchObject({ panaderia_id: PAN, lote_id: L_H, tipo_movimiento_id: TIPO, cantidad: 300, desperdicio_id: desperdicios[0].id, usuario_id: USU });
  });

  test('el operario registra pero no ve el costo en la respuesta (se guarda igual)', async () => {
    const r = await registrar(deLote());
    expect(r.status).toBe(201);
    expect(JSON.stringify(r.body)).not.toMatch(/costo/);
    expect(desperdicios[0].costo_estimado).toBe(600);
  });

  test('se puede dar de baja todo el lote: queda en cero', async () => {
    expect((await registrar(deLote({ cantidad: 1000 }))).status).toBe(201);
    expect(disponible(L_H)).toBe(0);
  });

  test('409 si supera lo que hay en el lote y no escribe nada', async () => {
    const r = await registrar(deLote({ cantidad: 1000.001 }));
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/disponible: 1000/);
    expect(disponible(L_H)).toBe(1000);
    expect(desperdicios).toHaveLength(0);
    expect(movimientos).toHaveLength(0);
  });

  test('la etapa puede ser recepción, almacenamiento o producción', async () => {
    for (const etapa of ['recepcion', 'almacenamiento', 'produccion']) {
      expect((await registrar(deLote({ etapa, cantidad: 10 }))).status).toBe(201);
    }
    expect(desperdicios.map((d) => d.etapa)).toEqual(['recepcion', 'almacenamiento', 'produccion']);
  });

  test('invariante: lo descontado de cada lote es exactamente lo registrado como merma', async () => {
    await registrar(deLote({ cantidad: 120 }));
    await registrar(deLote({ cantidad: 30.5 }));
    await registrar(deLote({ lote_id: L_A, cantidad: 80 }));
    const mermadoH = desperdicios.filter((d) => d.lote_id === L_H).reduce((s, d) => s + d.cantidad, 0);
    expect(1000 - disponible(L_H)).toBe(mermadoH);
    expect(500 - disponible(L_A)).toBe(80);
    expect(movimientos.reduce((s, m) => s + m.cantidad, 0)).toBe(230.5);
  });

  test('409 con un lote de producto terminado (no es de un insumo)', async () => {
    expect((await registrar(deLote({ lote_id: L_PROD, cantidad: 10 }))).status).toBe(409);
    expect(desperdicios).toHaveLength(0);
  });

  test('404 con un lote de otra panadería o inexistente', async () => {
    expect((await registrar(deLote({ lote_id: L_AJENO }))).status).toBe(404);
    expect((await registrar(deLote({ lote_id: '44444444-4444-4444-8444-4444444444ff' }))).status).toBe(404);
    expect(disponible(L_AJENO)).toBe(100);
  });
});

describe('POST /mermas: merma de una producción', () => {
  test('se registra sin tocar los lotes y sin costo', async () => {
    rol = 'administrador';
    const r = await registrar(deProduccion());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ lote_id: null, produccion_id: P_EN, cantidad: 1500, costo_estimado: null });
    expect(desperdicios[0]).toMatchObject({ lote_id: null, produccion_id: P_EN, etapa: 'produccion', costo_estimado: null });
    expect(movimientos).toHaveLength(0);
    expect(disponible(L_H)).toBe(1000);
  });

  test('vale en una producción en curso o finalizada, no en una anulada ni sin iniciar', async () => {
    expect((await registrar(deProduccion({ produccion_id: P_FIN }))).status).toBe(201);
    expect((await registrar(deProduccion({ produccion_id: P_CANC }))).status).toBe(409);
    expect((await registrar(deProduccion({ produccion_id: P_PLAN }))).status).toBe(409);
    expect(desperdicios).toHaveLength(1);
  });

  test('una merma solo de producción debe ir en la etapa «Producción»', async () => {
    const r = await registrar(deProduccion({ etapa: 'almacenamiento' }));
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/etapa/);
    expect(desperdicios).toHaveLength(0);
  });

  test('404 con una producción de otra panadería o inexistente', async () => {
    expect((await registrar(deProduccion({ produccion_id: P_AJENA }))).status).toBe(404);
    expect((await registrar(deProduccion({ produccion_id: '55555555-5555-4555-8555-5555555555ff' }))).status).toBe(404);
  });

  test('con lote y producción a la vez: descuenta el lote y deja ambos vínculos', async () => {
    const r = await registrar(deLote({ etapa: 'produccion', produccion_id: P_EN, cantidad: 50 }));
    expect(r.status).toBe(201);
    expect(desperdicios[0]).toMatchObject({ lote_id: L_H, produccion_id: P_EN });
    expect(disponible(L_H)).toBe(950);
  });

  test('409 si ese lote no se usó en esa producción', async () => {
    const r = await registrar(deLote({ lote_id: L_A, etapa: 'produccion', produccion_id: P_EN }));
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/no se usó/);
    expect(disponible(L_A)).toBe(500);
    expect(desperdicios).toHaveLength(0);
  });
});

describe('POST /mermas: validaciones y fallos', () => {
  test('400 con datos inválidos, sin escribir nada', async () => {
    const malos: Fila[] = [
      deLote({ causa_id: undefined }),
      deLote({ causa_id: 'x' }),
      deLote({ etapa: 'otra' }),
      deLote({ cantidad: 0 }),
      deLote({ cantidad: -5 }),
      deLote({ cantidad: '5' }),
      deLote({ cantidad: 1_000_001 }),
      deLote({ lote_id: 'x' }),
      { causa_id: C_VENC, etapa: 'produccion', cantidad: 5 },
    ];
    for (const m of malos) expect((await registrar(m)).status).toBe(400);
    expect(desperdicios).toHaveLength(0);
    expect(disponible(L_H)).toBe(1000);
  });

  test('400 con una causa inexistente, de otra panadería o desactivada', async () => {
    for (const causa_id of [C_AJENA, C_INACT, '33333333-3333-4333-8333-3333333333ff']) {
      const r = await registrar(deLote({ causa_id }));
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/causa/);
    }
    expect(desperdicios).toHaveLength(0);
  });

  test('403 si el usuario no está asignado a la panadería', async () => {
    asignado = false;
    expect((await registrar(deLote())).status).toBe(403);
    expect(desperdicios).toHaveLength(0);
  });

  test('si falta el tipo de movimiento en el catálogo: 500 y no queda nada', async () => {
    hayTipo = false;
    const r = await registrar(deLote());
    expect(r.status).toBe(500);
    expect(desperdicios).toHaveLength(0);
    expect(disponible(L_H)).toBe(1000);
  });

  test('un fallo al descontar el lote deshace también la merma', async () => {
    const original = prismaFalso.movimiento_inventario.create;
    prismaFalso.movimiento_inventario.create = async () => {
      throw new Error('falla simulada');
    };
    const r = await registrar(deLote());
    prismaFalso.movimiento_inventario.create = original;
    expect(r.status).toBe(500);
    expect(r.body.error).not.toMatch(/falla/);
    expect(desperdicios).toHaveLength(0);
    expect(disponible(L_H)).toBe(1000);
  });

  test('si otro gastó el insumo a la vez, la base rechaza el negativo: 409 para reintentar y no queda nada', async () => {
    const original = prismaFalso.lote.findFirst;
    // La merma ve 1000 disponibles, pero el lote ya solo tiene 100 cuando se descuenta
    prismaFalso.lote.findFirst = async (a: any) => {
      const l = await original(a);
      const copia = l ? { ...l } : l;
      if (l) l.cantidad_disponible = 100;
      return copia;
    };
    const r = await registrar(deLote({ cantidad: 500 }));
    prismaFalso.lote.findFirst = original;
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Vuelve a intentarlo/);
    expect(desperdicios).toHaveLength(0);
  });
});

describe('GET /mermas', () => {
  test('lista de la más reciente a la más antigua, con insumo, unidad, usuario y causa', async () => {
    rol = 'administrador';
    await registrar(deLote({ cantidad: 100 }));
    await registrar(deProduccion());
    const r = await obtener('');
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(2);
    expect(r.body[0]).toMatchObject({ causa: 'Quemado o sobrehorneado', causa_codigo: 'quemado', etapa: 'produccion', cantidad: 1500, unidad: 'g', insumo: null, codigo_lote: null, produccion_id: P_EN, producto: 'Pan dulce', usuario: 'Ana Operaria', costo_estimado: null });
    expect(r.body[1]).toMatchObject({ causa: 'Vencimiento', etapa: 'almacenamiento', cantidad: 100, unidad: 'g', insumo: 'Harina', codigo_lote: '441', produccion_id: null, producto: null, costo_estimado: 200 });
  });

  test('el operario no recibe el costo', async () => {
    await registrar(deLote());
    const r = await obtener('');
    expect(r.body).toHaveLength(1);
    expect(JSON.stringify(r.body)).not.toMatch(/costo/);
  });

  test('filtra por etapa y por producción; rechaza valores inválidos', async () => {
    await registrar(deLote({ cantidad: 10 }));
    await registrar(deLote({ cantidad: 10, etapa: 'recepcion' }));
    await registrar(deProduccion());
    expect((await obtener('?etapa=recepcion')).body).toHaveLength(1);
    expect((await obtener('?etapa=produccion')).body).toHaveLength(1);
    expect((await obtener(`?produccion_id=${P_EN}`)).body).toHaveLength(1);
    expect((await obtener('?etapa=inventada')).status).toBe(400);
    expect((await obtener('?produccion_id=xyz')).status).toBe(400);
  });

  test('no muestra mermas de otra panadería', async () => {
    await registrar(deLote());
    desperdicios.push({ ...desperdicios[0], id: 'ajena', panaderia_id: OTRA });
    expect((await obtener('')).body).toHaveLength(1);
  });

  test('vacía cuando no hay mermas', async () => {
    expect((await obtener('')).body).toEqual([]);
  });
});
