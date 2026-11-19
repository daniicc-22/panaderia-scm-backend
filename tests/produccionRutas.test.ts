import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterProduccion } from '../src/routes/produccion';
import { hoyColombia } from '../src/utils/entradas';

const PAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USU = '99999999-9999-4999-8999-999999999999';
const U_G = '11111111-1111-4111-8111-111111111111';
const U_KG = '11111111-1111-4111-8111-111111111112';
const HARINA = '22222222-2222-4222-8222-222222222221';
const AZUCAR = '22222222-2222-4222-8222-222222222222';
const LEVADURA = '22222222-2222-4222-8222-222222222223';
const AGUA = '22222222-2222-4222-8222-222222222224';
const P_PAN = '55555555-5555-4555-8555-555555555551';
const P_MASA = '55555555-5555-4555-8555-555555555552';
const P_SIN = '55555555-5555-4555-8555-555555555553';
const F_PAN = '66666666-6666-4666-8666-666666666661';
const F_MASA = '66666666-6666-4666-8666-666666666662';
const F_SIN = '66666666-6666-4666-8666-666666666663';
const F_AJENA = '66666666-6666-4666-8666-666666666669';
const TIPO = '77777777-7777-4777-8777-777777777777';

type Fila = Record<string, any>;
let materias: Fila[], formulaciones: Fila[], productos: Fila[], lotes: Fila[];
let producciones: Fila[], consumos: Fila[], movimientos: Fila[], pesajes: Fila[];
let desperdicios: Fila[] = [], detallesConteo: Fila[] = [];
let asignado: boolean, hayTipo: boolean;
let fallarEnConsumo: boolean;
let contador = 0;
let rol = 'operario';

const OPERADORES = ['not', 'equals', 'gt', 'in'];
function coincide(fila: Fila, where: any): boolean {
  return Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(fila[k]);
      if ('gt' in v) return Number(fila[k]) > v.gt;
      if ('not' in v) return fila[k] !== v.not;
      if (!Object.keys(v).some((x) => OPERADORES.includes(x))) return coincide(fila[k] ?? {}, v);
    }
    return fila[k] === v;
  });
}

const hoy = () => hoyColombia();
const fechaMas = (dias: number) => new Date(Date.parse(`${hoy()}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
const linea = (extra: Fila) => ({ materia_prima_id: null, producto_intermedio_id: null, unidad_id: U_G, ...extra });

// Imita los `include` que usan las consultas de producción
const conRelaciones = (f: Fila) => ({
  ...f,
  producto: { nombre: productos.find((p) => p.id === f.producto_id)?.nombre ?? '?' },
  formulacion: (() => {
    const fo = formulaciones.find((x) => x.id === f.formulacion_id);
    return { version: fo?.version ?? 1, rendimiento_esperado: fo?.rendimiento_esperado ?? null };
  })(),
  usuario_panaderia: { usuario: { nombre: 'Ana Operaria' } },
  pesaje_produccion: pesajes.filter((x) => x.produccion_id === f.id).map((x) => ({ pesado: x.pesado })),
});

const prismaFalso: any = {
  usuario_panaderia: { findFirst: async () => (asignado ? { usuario_id: USU } : null) },
  formulacion: {
    findFirst: async ({ where }: any) => formulaciones.find((f) => coincide(f, where)) ?? null,
    findMany: async ({ where }: any) => formulaciones.filter((f) => coincide(f, where)),
  },
  producto: { findMany: async ({ where }: any) => productos.filter((p) => coincide(p, where)) },
  materia_prima: {
    findMany: async ({ where }: any) =>
      materias.filter((m) => coincide(m, where)).map((m) => ({ ...m, unidad_medida: { codigo: 'g' } })),
  },
  lote: {
    findMany: async ({ where }: any) => lotes.filter((l) => coincide(l, where)),
    count: async ({ where }: any) => lotes.filter((l) => coincide(l, where)).length,
    update: async ({ where, data }: any) => {
      const l = lotes.find((x) => x.id === where.id)!;
      l.cantidad_disponible = Number(l.cantidad_disponible) + Number(data.cantidad_disponible.increment);
      return l;
    },
  },
  desperdicio: {
    findMany: async ({ where }: any) => desperdicios.filter((x) => coincide(x, where)),
    deleteMany: async ({ where }: any) => {
      const antes = desperdicios.length;
      desperdicios = desperdicios.filter((x) => !where.id.in.includes(x.id));
      return { count: antes - desperdicios.length };
    },
  },
  detalle_conteo: { count: async ({ where }: any) => detallesConteo.filter((d) => where.movimiento_id.in.includes(d.movimiento_id)).length },
  tipo_movimiento_inventario: { findUnique: async () => (hayTipo ? { id: TIPO, codigo: 'salida_produccion' } : null) },
  produccion: {
    create: async ({ data }: any) => {
      const f = { id: `00000000-0000-4000-8000-${String(++contador).padStart(12, '0')}`, fecha: new Date(Date.UTC(2026, 9, 25, 12, 0, contador)), ...data };
      producciones.push(f);
      return f;
    },
    findFirst: async ({ where }: any) => {
      const f = producciones.find((x) => coincide(x, where));
      return f ? conRelaciones(f) : null;
    },
    findMany: async ({ where, take }: any) =>
      producciones
        .filter((x) => coincide(x, where))
        .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
        .slice(0, take ?? 1000)
        .map(conRelaciones),
    // Imita el disparador de la base: una producción cerrada no se modifica
    delete: async ({ where }: any) => {
      producciones = producciones.filter((x) => x.id !== where.id);
      return {};
    },
    update: async ({ where, data }: any) => {
      const f = producciones.find((x) => x.id === where.id)!;
      if (f.estado === 'finalizada' || f.estado === 'cancelada') throw new Error(`La producción ${f.id} ya está cerrada y no se puede modificar`);
      Object.assign(f, data);
      return f;
    },
  },
  pesaje_produccion: {
    createMany: async ({ data }: any) => {
      for (const d of data) pesajes.push({ id: `pes-${++contador}`, ...d });
      return { count: data.length };
    },
    findMany: async ({ where }: any) => pesajes.filter((x) => coincide(x, where)),
    deleteMany: async ({ where }: any) => {
      pesajes = pesajes.filter((x) => x.produccion_id !== where.produccion_id);
      return {};
    },
  },
  consumo_produccion: {
    create: async ({ data }: any) => {
      if (fallarEnConsumo) throw new Error('falla simulada');
      const f = { id: `con-${++contador}`, ...data };
      consumos.push(f);
      return f;
    },
    deleteMany: async ({ where }: any) => {
      consumos = consumos.filter((c) => !where.id.in.includes(c.id));
      return {};
    },
    findMany: async ({ where }: any) =>
      consumos
        .filter((c) => coincide(c, where))
        .map((c) => {
          const l = lotes.find((x) => x.id === c.lote_id)!;
          return { ...c, lote: { materia_prima_id: l.materia_prima_id, codigo_lote: l.codigo_lote, fecha_vencimiento: l.fecha_vencimiento } };
        }),
  },
  // Imita el disparador de la base: descuenta del lote y rechaza dejarlo en negativo
  movimiento_inventario: {
    findMany: async ({ where }: any) => {
      const [a, b] = where.OR;
      return movimientos.filter((m) => a.consumo_produccion_id.in.includes(m.consumo_produccion_id) || b.desperdicio_id.in.includes(m.desperdicio_id));
    },
    deleteMany: async ({ where }: any) => {
      movimientos = movimientos.filter((m) => !where.id.in.includes(m.id));
      return {};
    },
    create: async ({ data }: any) => {
      const l = lotes.find((x) => x.id === data.lote_id)!;
      const nuevo = Number(l.cantidad_disponible) - Number(data.cantidad);
      if (nuevo < 0) throw new Error(`El movimiento dejaría cantidad_disponible negativa en el lote ${l.id}`);
      l.cantidad_disponible = nuevo;
      const f = { id: `mov-${++contador}`, ...data };
      movimientos.push(f);
      return f;
    },
  },
  $queryRaw: async () => [],
  $transaction: async (fn: any) => {
    const copia = JSON.stringify({ lotes, producciones, consumos, movimientos, pesajes });
    try {
      return await fn(prismaFalso);
    } catch (e) {
      const d = JSON.parse(copia);
      lotes.length = 0;
      lotes.push(...d.lotes.map((l: Fila) => ({ ...l, created_at: new Date(l.created_at), fecha_vencimiento: l.fecha_vencimiento ? new Date(l.fecha_vencimiento) : null })));
      producciones.length = 0;
      producciones.push(...d.producciones.map((x: Fila) => ({ ...x, fecha: new Date(x.fecha) })));
      consumos.length = 0;
      consumos.push(...d.consumos);
      movimientos.length = 0;
      movimientos.push(...d.movimientos);
      pesajes.length = 0;
      pesajes.push(...d.pesajes);
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
  app.use('/produccion', crearRouterProduccion(prismaFalso));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

const crearLote = (id: string, materia: string, disp: number, extra: Fila = {}) => ({
  id,
  panaderia_id: PAN,
  materia_prima_id: materia,
  cantidad_inicial: disp,
  cantidad_disponible: disp,
  costo_unitario: 2,
  fecha_vencimiento: null,
  codigo_lote: id,
  created_at: new Date('2026-10-01T10:00:00Z'),
  ...extra,
});

beforeEach(() => {
  rol = 'operario';
  asignado = true;
  hayTipo = true;
  fallarEnConsumo = false;
  materias = [
    { id: HARINA, panaderia_id: PAN, codigo: 'MP-001', nombre: 'Harina', activa: true, controla_inventario: true, criterio_rotacion: null, unidad_base_id: U_G },
    { id: AZUCAR, panaderia_id: PAN, codigo: 'MP-002', nombre: 'Azúcar', activa: true, controla_inventario: true, criterio_rotacion: null, unidad_base_id: U_G },
    { id: LEVADURA, panaderia_id: PAN, codigo: 'MP-003', nombre: 'Levadura', activa: true, controla_inventario: true, criterio_rotacion: 'FEFO', unidad_base_id: U_G },
  ];
  productos = [
    { id: P_PAN, panaderia_id: PAN, nombre: 'Pan dulce', activo: true },
    { id: P_MASA, panaderia_id: PAN, nombre: 'Masa base', activo: true },
    { id: P_SIN, panaderia_id: PAN, nombre: 'Galleta', activo: true },
  ];
  formulaciones = [
    {
      id: F_PAN, panaderia_id: PAN, activa: true, producto_id: P_PAN, producto: { nombre: 'Pan dulce', activo: true }, version: 2, rendimiento_esperado: 40,
      detalle_formulacion: [linea({ materia_prima_id: AZUCAR, cantidad_estandar: 100 }), linea({ producto_intermedio_id: P_MASA, cantidad_estandar: 500 })],
    },
    {
      id: F_MASA, panaderia_id: PAN, activa: true, producto_id: P_MASA, producto: { nombre: 'Masa base', activo: true }, version: 1, rendimiento_esperado: null,
      detalle_formulacion: [linea({ materia_prima_id: HARINA, cantidad_estandar: 600 }), linea({ materia_prima_id: AZUCAR, cantidad_estandar: 400 })],
    },
    {
      id: F_SIN, panaderia_id: PAN, activa: true, producto_id: P_SIN, producto: { nombre: 'Galleta', activo: true }, version: 1, rendimiento_esperado: 10,
      detalle_formulacion: [linea({ materia_prima_id: HARINA, cantidad_estandar: 200 }), linea({ producto_intermedio_id: '55555555-5555-4555-8555-5555555555ff', cantidad_estandar: 50 })],
    },
    { id: F_AJENA, panaderia_id: OTRA, activa: true, producto_id: 'x', producto: { nombre: 'Ajeno', activo: true }, version: 1, rendimiento_esperado: 1, detalle_formulacion: [] },
  ];
  lotes = [crearLote('h1', HARINA, 1000), crearLote('a1', AZUCAR, 500)];
  producciones = [];
  consumos = [];
  movimientos = [];
  pesajes = [];
  desperdicios = [];
  detallesConteo = [];
});

const enviar = async (ruta: string, cuerpo: unknown) => {
  const r = await fetch(`${base}/produccion${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  return { status: r.status, body: (await r.json()) as any };
};
const simular = (cuerpo: unknown) => enviar('/simular', cuerpo);
const producir = (cuerpo: unknown) => enviar('', cuerpo);
const pan = (lotes = 1) => ({ formulacion_id: F_PAN, lotes });
const disponible = (id: string) => Number(lotes.find((l) => l.id === id)!.cantidad_disponible);

describe('POST /produccion/simular', () => {
  test('calcula lo necesario repartiendo la masa intermedia y no escribe nada', async () => {
    const r = await simular(pan(1));
    expect(r.status).toBe(200);
    expect(r.body.completo).toBe(true);
    expect(r.body.formulacion).toEqual({ id: F_PAN, producto: 'Pan dulce', version: 2 });
    const [azucar, harina] = r.body.items;
    expect(azucar).toMatchObject({ nombre: 'Azúcar', unidad: 'g', necesario: 300, faltante: 0 });
    expect(azucar.lotes).toEqual([{ lote_id: 'a1', codigo_lote: 'a1', fecha_vencimiento: null, cantidad: 300 }]);
    expect(harina).toMatchObject({ nombre: 'Harina', necesario: 300 });
    expect(producciones).toHaveLength(0);
    expect(movimientos).toHaveLength(0);
    expect(disponible('a1')).toBe(500);
  });

  test('lista los insumos por nombre, sin depender del orden de las líneas de la receta', async () => {
    formulaciones[0].detalle_formulacion.reverse(); // primero la masa (harina), después el azúcar
    const r = await simular(pan(1));
    expect(r.body.items.map((i: any) => i.nombre)).toEqual(['Azúcar', 'Harina']);
  });

  test('escala con los lotes y admite fracciones', async () => {
    const r = await simular(pan(0.5));
    expect(r.body.items.map((i: any) => i.necesario)).toEqual([150, 150]);
  });

  test('si no alcanza responde 200 con completo=false y el faltante', async () => {
    const r = await simular(pan(2));
    expect(r.status).toBe(200);
    expect(r.body.completo).toBe(false);
    expect(r.body.items[0]).toMatchObject({ nombre: 'Azúcar', necesario: 600, faltante: 100 });
  });

  test('FEFO usa primero el lote que vence antes y no toca el vencido (lo informa)', async () => {
    lotes.push(
      crearLote('l-tarde', LEVADURA, 500, { fecha_vencimiento: new Date(`${fechaMas(60)}T00:00:00Z`) }),
      crearLote('l-pronto', LEVADURA, 500, { fecha_vencimiento: new Date(`${fechaMas(5)}T00:00:00Z`), created_at: new Date('2026-10-10T00:00:00Z') }),
      crearLote('l-vencido', LEVADURA, 500, { fecha_vencimiento: new Date(`${fechaMas(-1)}T00:00:00Z`) }),
    );
    formulaciones[0].detalle_formulacion.push(linea({ materia_prima_id: LEVADURA, cantidad_estandar: 600 }));
    const r = await simular(pan(1));
    const lev = r.body.items.find((i: any) => i.nombre === 'Levadura');
    expect(lev.lotes.map((l: any) => [l.codigo_lote, l.cantidad])).toEqual([['l-pronto', 500], ['l-tarde', 100]]);
    expect(lev.lotes[0].fecha_vencimiento).toBe(fechaMas(5));
    expect(lev.vencido_omitido).toBe(500);
    expect(lev.faltante).toBe(0);
  });

  test('400 con cuerpo inválido; 404 con formulación de otra panadería, inactiva o de producto dado de baja', async () => {
    expect((await simular({ formulacion_id: 'x', lotes: 0 })).status).toBe(400);
    expect((await simular({ formulacion_id: F_AJENA, lotes: 1 })).status).toBe(404);
    formulaciones[0].activa = false;
    expect((await simular(pan())).status).toBe(404);
    formulaciones[0].activa = true;
    formulaciones[0].producto.activo = false;
    expect((await simular(pan())).status).toBe(404);
  });

  test('409 si un intermedio no tiene receta vigente, y nombra el producto', async () => {
    const r = await simular({ formulacion_id: F_SIN, lotes: 1 });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('intermedios');
  });

  test('409 si un insumo de la receta está desactivado o viene en otra unidad', async () => {
    materias[1].activa = false;
    const r1 = await simular(pan());
    expect(r1.status).toBe(409);
    expect(r1.body.error).toContain('Azúcar');
    materias[1].activa = true;
    formulaciones[0].detalle_formulacion[0].unidad_id = U_KG;
    const r2 = await simular(pan());
    expect(r2.status).toBe(409);
    expect(r2.body.error).toContain('unidad distinta');
    expect(r2.body.error).toContain('Azúcar');
    formulaciones[0].detalle_formulacion[0].unidad_id = U_G;
    formulaciones[1].detalle_formulacion[0].unidad_id = U_KG; // dentro de la masa intermedia
    const r3 = await simular(pan());
    expect(r3.status).toBe(409);
    expect(r3.body.error).toContain('Harina');
  });

  test('409 si la receta no tiene nada que descontar', async () => {
    formulaciones[0].detalle_formulacion = [];
    expect((await simular(pan())).status).toBe(409);
  });
});

describe('POST /produccion', () => {
  test('descuenta cada insumo de sus lotes y deja produccion, consumos y movimientos enlazados', async () => {
    const r = await producir(pan(1));
    expect(r.status).toBe(201);
    expect(producciones).toHaveLength(1);
    expect(producciones[0]).toMatchObject({
      panaderia_id: PAN, producto_id: P_PAN, formulacion_id: F_PAN, usuario_id: USU,
      estado: 'en_curso', origen_planificacion: 'sin_registro', cantidad_planificada: 40,
    });
    expect(r.body.produccion_id).toBe(producciones[0].id);
    expect(consumos.map((c) => [c.lote_id, c.cantidad_consumida, c.produccion_id]).sort()).toEqual([
      ['a1', 300, producciones[0].id],
      ['h1', 300, producciones[0].id],
    ]);
    expect(movimientos).toHaveLength(2);
    for (const m of movimientos) {
      expect(m).toMatchObject({ panaderia_id: PAN, tipo_movimiento_id: TIPO, usuario_id: USU });
      expect(consumos.find((c) => c.id === m.consumo_produccion_id)).toMatchObject({ lote_id: m.lote_id, cantidad_consumida: m.cantidad });
    }
    expect(disponible('a1')).toBe(200);
    expect(disponible('h1')).toBe(700);
  });

  test('invariante: lo descontado de cada lote es exactamente lo consumido', async () => {
    await producir(pan(1.5));
    for (const l of lotes) {
      const gastado = consumos.filter((c) => c.lote_id === l.id).reduce((s, c) => s + c.cantidad_consumida, 0);
      expect(Math.round((l.cantidad_inicial - l.cantidad_disponible) * 1000) / 1000).toBe(Math.round(gastado * 1000) / 1000);
    }
  });

  test('cantidad planificada = rendimiento × lotes; sin rendimiento queda vacía', async () => {
    expect((await producir(pan(0.5))).status).toBe(201);
    expect(producciones[0].cantidad_planificada).toBe(20);
    producciones.length = 0;
    lotes = [crearLote('h1', HARINA, 1000), crearLote('a1', AZUCAR, 500)];
    expect((await producir({ formulacion_id: F_MASA, lotes: 1 })).status).toBe(201);
    expect(producciones[0].cantidad_planificada).toBeNull();
  });

  test('reparte un insumo entre varios lotes y registra un consumo por lote', async () => {
    lotes = [crearLote('h1', HARINA, 200), crearLote('h2', HARINA, 1000, { created_at: new Date('2026-10-05T00:00:00Z') }), crearLote('a1', AZUCAR, 500)];
    await producir(pan(1));
    expect(consumos.filter((c) => c.lote_id.startsWith('h')).map((c) => [c.lote_id, c.cantidad_consumida])).toEqual([['h1', 200], ['h2', 100]]);
    expect(disponible('h1')).toBe(0);
    expect(disponible('h2')).toBe(900);
  });

  test('409 sin escribir nada cuando falta un insumo, e incluye el plan con el faltante', async () => {
    const r = await producir(pan(2));
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Azúcar');
    expect(r.body.plan.items[0]).toMatchObject({ nombre: 'Azúcar', faltante: 100 });
    expect(producciones).toHaveLength(0);
    expect(consumos).toHaveLength(0);
    expect(movimientos).toHaveLength(0);
    expect(disponible('a1')).toBe(500);
    expect(disponible('h1')).toBe(1000);
  });

  test('no usa lotes vencidos aunque sean los únicos: queda como faltante', async () => {
    lotes = [crearLote('h1', HARINA, 1000, { fecha_vencimiento: new Date(`${fechaMas(-2)}T00:00:00Z`) }), crearLote('a1', AZUCAR, 500)];
    const r = await producir(pan(1));
    expect(r.status).toBe(409);
    expect(disponible('h1')).toBe(1000);
  });

  test('el administrador también puede producir', async () => {
    rol = 'administrador';
    expect((await producir(pan(1))).status).toBe(201);
  });

  test('la respuesta no contiene dinero ni costos', async () => {
    const r = await producir(pan(1));
    expect(JSON.stringify(r.body)).not.toMatch(/costo|precio|valor/i);
  });

  test('400 con cuerpo inválido y 404 con formulación ajena, sin escribir', async () => {
    expect((await producir({ formulacion_id: F_PAN, lotes: -1 })).status).toBe(400);
    expect((await producir({ formulacion_id: F_AJENA, lotes: 1 })).status).toBe(404);
    expect(producciones).toHaveLength(0);
  });

  test('403 si el usuario no está asignado a la panadería', async () => {
    asignado = false;
    expect((await producir(pan())).status).toBe(403);
    expect(producciones).toHaveLength(0);
  });

  test('si otro gastó el insumo a la vez, la base rechaza el negativo: 409 para reintentar y no queda nada', async () => {
    const original = prismaFalso.lote.findMany;
    // El plan ve 500 g de azúcar, pero el lote ya solo tiene 100 g cuando se descuenta
    prismaFalso.lote.findMany = async (a: any) => {
      const filas = await original(a);
      const r = filas.map((l: Fila) => ({ ...l }));
      lotes.find((l) => l.id === 'a1')!.cantidad_disponible = 100;
      return r;
    };
    try {
      const r = await producir(pan(1));
      expect(r.status).toBe(409);
      expect(r.body.error).toContain('Vuelve a intentarlo');
    } finally {
      prismaFalso.lote.findMany = original;
    }
    expect(producciones).toHaveLength(0);
    expect(movimientos).toHaveLength(0);
  });

  test('un fallo a mitad del registro se deshace por completo y responde 500 sin detalles', async () => {
    fallarEnConsumo = true;
    const silencio = console.error;
    console.error = () => {};
    try {
      const r = await producir(pan(1));
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toContain('falla simulada');
    } finally {
      console.error = silencio;
    }
    expect(producciones).toHaveLength(0);
    expect(consumos).toHaveLength(0);
    expect(disponible('h1')).toBe(1000);
  });

  test('si falta el tipo de movimiento en el catálogo responde 500 y no escribe', async () => {
    hayTipo = false;
    const silencio = console.error;
    console.error = () => {};
    try {
      expect((await producir(pan(1))).status).toBe(500);
    } finally {
      console.error = silencio;
    }
    expect(producciones).toHaveLength(0);
  });
});

describe('insumos que no se controlan en inventario (agua)', () => {
  const conAgua = () => {
    materias.push({ id: AGUA, panaderia_id: PAN, codigo: 'MP-008', nombre: 'Agua', activa: true, controla_inventario: false, criterio_rotacion: null, unidad_base_id: U_G });
    formulaciones[0].detalle_formulacion.push(linea({ materia_prima_id: AGUA, cantidad_estandar: 250 }));
  };

  test('simular: el agua aparece como no controlada, sin faltante ni lotes, y no impide completar', async () => {
    conAgua();
    const r = await simular(pan(2));
    const agua = r.body.items.find((i: any) => i.nombre === 'Agua');
    expect(agua).toEqual({
      materia_prima_id: AGUA, codigo: 'MP-008', nombre: 'Agua', unidad: 'g', controla_inventario: false,
      peso_estandar: 500, pesado: false, desviacion_pct: 0,
      necesario: 500, faltante: 0, vencido_omitido: 0, lotes: [],
    });
    // el resto sigue el cálculo normal (azúcar sí falta con 2 lotes) y marca controla_inventario=true
    expect(r.body.items.find((i: any) => i.nombre === 'Azúcar')).toMatchObject({ controla_inventario: true, faltante: 100 });
    expect(r.body.completo).toBe(false);
    const ok = await simular(pan(1));
    expect(ok.body.completo).toBe(true);
    expect(ok.body.items.map((i: any) => i.nombre)).toEqual(['Agua', 'Azúcar', 'Harina']);
  });

  test('registrar: descuenta lo demás, no crea consumos ni movimientos del agua y no pide existencias de agua', async () => {
    conAgua();
    const r = await producir(pan(1));
    expect(r.status).toBe(201);
    expect(consumos.map((c) => c.lote_id).sort()).toEqual(['a1', 'h1']);
    expect(movimientos).toHaveLength(2);
    expect(disponible('a1')).toBe(200);
    expect(disponible('h1')).toBe(700);
    expect(r.body.plan.items.find((i: any) => i.nombre === 'Agua').controla_inventario).toBe(false);
  });

  test('aunque exista un lote de agua antiguo, no se consume', async () => {
    conAgua();
    lotes.push(crearLote('agua1', AGUA, 5000));
    const r = await producir(pan(1));
    expect(r.status).toBe(201);
    expect(disponible('agua1')).toBe(5000);
    expect(consumos.some((c) => c.lote_id === 'agua1')).toBe(false);
  });

  test('una receta solo con insumos no controlados se rechaza (nada que descontar)', async () => {
    materias.push({ id: AGUA, panaderia_id: PAN, codigo: 'MP-008', nombre: 'Agua', activa: true, controla_inventario: false, criterio_rotacion: null, unidad_base_id: U_G });
    formulaciones[0].detalle_formulacion = [linea({ materia_prima_id: AGUA, cantidad_estandar: 250 })];
    const r = await producir(pan(1));
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/inventario para descontar/);
    expect(producciones).toHaveLength(0);
  });

  test('un insumo marcado como controlado sigue exigiendo existencias', async () => {
    conAgua();
    materias.find((m) => m.id === AGUA)!.controla_inventario = true;
    const r = await producir(pan(1));
    expect(r.status).toBe(409);
    expect(r.body.plan.items.find((i: any) => i.nombre === 'Agua')).toMatchObject({ faltante: 250 });
    expect(producciones).toHaveLength(0);
  });
});

// ---------- HU-16: peso real de los insumos, cierre de la producción e historial ----------

const conPesos = (pesos: unknown, lotes = 1) => ({ ...pan(lotes), pesos_reales: pesos });
const idPesos = (id: string, peso: number | null) => ({ materia_prima_id: id, peso_real: peso });
const obtener = async (ruta: string) => {
  const r = await fetch(`${base}/produccion${ruta}`);
  return { status: r.status, body: (await r.json()) as any };
};
// Existencias de sobra para producir varias veces seguidas
const abastecer = () => lotes.forEach((l) => (l.cantidad_disponible = 100_000));
const finalizar = (id: string, cuerpo: unknown) => enviar(`/${id}/finalizar`, cuerpo);
const porNombre = (items: any[], nombre: string) => items.find((i) => i.nombre === nombre);

describe('peso real de los insumos', () => {
  test('simular: usa el peso real, muestra el estándar y la desviación; lo que no se pesó queda como estándar', async () => {
    const r = await simular(conPesos([idPesos(HARINA, 330), idPesos(AZUCAR, null)]));
    expect(r.status).toBe(200);
    const harina = porNombre(r.body.items, 'Harina');
    expect(harina).toMatchObject({ necesario: 330, peso_estandar: 300, pesado: true, desviacion_pct: 10 });
    const azucar = porNombre(r.body.items, 'Azúcar');
    expect(azucar).toMatchObject({ necesario: 300, peso_estandar: 300, pesado: false, desviacion_pct: 0 });
    expect(producciones).toHaveLength(0);
    expect(pesajes).toHaveLength(0);
  });

  test('registrar: el inventario descuenta el peso real y se guarda el pesaje de cada insumo', async () => {
    const r = await producir(conPesos([idPesos(HARINA, 330), idPesos(AZUCAR, 290)]));
    expect(r.status).toBe(201);
    expect(disponible('h1')).toBe(670);
    expect(disponible('a1')).toBe(210);
    expect(consumos.map((c) => Number(c.cantidad_consumida)).sort()).toEqual([290, 330]);
    expect(pesajes).toHaveLength(2);
    const h = pesajes.find((x) => x.materia_prima_id === HARINA)!;
    expect(h).toMatchObject({ panaderia_id: PAN, produccion_id: producciones[0].id, peso_estandar: 300, peso_real: 330, pesado: true });
    const a = pesajes.find((x) => x.materia_prima_id === AZUCAR)!;
    expect(a).toMatchObject({ peso_estandar: 300, peso_real: 290, pesado: true });
  });

  test('sin pesos reales todo es «al ojo»: se descuenta el estándar y real = estándar', async () => {
    const r = await producir(pan(1));
    expect(r.status).toBe(201);
    expect(disponible('h1')).toBe(700);
    expect(pesajes).toHaveLength(2);
    expect(pesajes.every((x) => x.pesado === false && x.peso_real === x.peso_estandar)).toBe(true);
  });

  test('un peso nulo es un insumo al ojo; un peso igual al estándar cuenta como pesado', async () => {
    await producir(conPesos([idPesos(HARINA, null), idPesos(AZUCAR, 300)]));
    expect(pesajes.find((x) => x.materia_prima_id === HARINA)!.pesado).toBe(false);
    expect(pesajes.find((x) => x.materia_prima_id === AZUCAR)!.pesado).toBe(true);
  });

  test('los pesos escalan con los lotes: se escriben para toda la producción', async () => {
    lotes.find((l) => l.id === 'a1')!.cantidad_disponible = 1000;
    const r = await producir(conPesos([idPesos(HARINA, 650)], 2));
    expect(r.status).toBe(201);
    expect(pesajes.find((x) => x.materia_prima_id === HARINA)).toMatchObject({ peso_estandar: 600, peso_real: 650 });
    expect(disponible('h1')).toBe(350);
  });

  for (const [nombre, valor] of [
    ['cero', 0],
    ['negativo', -5],
    ['texto', '300'],
    ['demasiado grande', 1_000_001],
    ['verdadero', true],
  ] as [string, unknown][]) {
    test(`400 con un peso ${nombre}, sin escribir nada`, async () => {
      const r = await producir(conPesos([{ materia_prima_id: HARINA, peso_real: valor }]));
      expect(r.status).toBe(400);
      expect(producciones).toHaveLength(0);
      expect(pesajes).toHaveLength(0);
      expect(disponible('h1')).toBe(1000);
    });
  }

  test('400 si los pesos no son una lista, traen un id inválido o repiten un insumo', async () => {
    expect((await producir(conPesos({ [HARINA]: 300 }))).status).toBe(400);
    expect((await producir(conPesos([{ materia_prima_id: 'no-es-uuid', peso_real: 5 }]))).status).toBe(400);
    expect((await producir(conPesos([idPesos(HARINA, 300), idPesos(HARINA, 310)]))).status).toBe(400);
    expect((await producir(conPesos([idPesos(HARINA, null), idPesos(HARINA, 310)]))).status).toBe(400);
    expect((await producir(conPesos(['x']))).status).toBe(400);
    expect((await producir(conPesos(new Array(201).fill(idPesos(HARINA, 1))))).status).toBe(400);
    expect(producciones).toHaveLength(0);
  });

  test('400 si se pesa un insumo que no está en la receta, también al simular', async () => {
    const a = await producir(conPesos([idPesos(LEVADURA, 5)]));
    expect(a.status).toBe(400);
    expect(a.body.error).toMatch(/no están en la receta/);
    expect((await simular(conPesos([idPesos(LEVADURA, 5)]))).status).toBe(400);
    expect(producciones).toHaveLength(0);
    expect(pesajes).toHaveLength(0);
  });

  test('si con el peso real no alcanzan las existencias: 409 con el plan y sin escribir', async () => {
    const r = await producir(conPesos([idPesos(HARINA, 1500)]));
    expect(r.status).toBe(409);
    expect(porNombre(r.body.plan.items, 'Harina')).toMatchObject({ necesario: 1500, faltante: 500 });
    expect(disponible('h1')).toBe(1000);
    expect(producciones).toHaveLength(0);
    expect(pesajes).toHaveLength(0);
  });

  test('el agua también se pesa: queda en el pesaje pero no se descuenta de ningún lote', async () => {
    formulaciones[0].detalle_formulacion.push(linea({ materia_prima_id: AGUA, cantidad_estandar: 200 }));
    materias.push({ id: AGUA, panaderia_id: PAN, codigo: 'MP-008', nombre: 'Agua', activa: true, controla_inventario: false, criterio_rotacion: null, unidad_base_id: U_G });
    const r = await producir(conPesos([idPesos(AGUA, 230)]));
    expect(r.status).toBe(201);
    expect(pesajes.find((x) => x.materia_prima_id === AGUA)).toMatchObject({ peso_estandar: 200, peso_real: 230, pesado: true });
    expect(consumos.every((c) => c.lote_id !== undefined)).toBe(true);
    expect(movimientos).toHaveLength(2);
  });

  test('un fallo a mitad del registro deshace también los pesajes', async () => {
    fallarEnConsumo = true;
    const r = await producir(conPesos([idPesos(HARINA, 330)]));
    expect(r.status).toBe(500);
    expect(pesajes).toHaveLength(0);
    expect(producciones).toHaveLength(0);
    expect(disponible('h1')).toBe(1000);
  });
});

describe('POST /produccion/:id/finalizar', () => {
  const crearEnCurso = async () => {
    await producir(pan(1)); // rendimiento 40 × 1 lote = 40 planificadas
    return producciones[0].id as string;
  };

  test('cierra la producción con lo producido y calcula el rendimiento', async () => {
    const id = await crearEnCurso();
    const r = await finalizar(id, { cantidad_producida: 38 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id, estado: 'finalizada', cantidad_planificada: 40, cantidad_producida: 38, rendimiento_pct: 95, aviso: null });
    expect(producciones[0]).toMatchObject({ estado: 'finalizada', cantidad_producida: 38 });
  });

  test('avisa (sin bloquear) cuando lo producido se aleja mucho de lo planificado', async () => {
    const id = await crearEnCurso();
    const r = await finalizar(id, { cantidad_producida: 5 });
    expect(r.status).toBe(200);
    expect(r.body.rendimiento_pct).toBe(12.5);
    expect(r.body.aviso).toMatch(/12,5 %/);
    expect(producciones[0].estado).toBe('finalizada');
  });

  test('sin rendimiento planificado no hay porcentaje ni aviso', async () => {
    const id = await crearEnCurso();
    producciones[0].cantidad_planificada = null;
    const r = await finalizar(id, { cantidad_producida: 3 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ cantidad_planificada: null, rendimiento_pct: null, aviso: null });
  });

  test('409 si ya estaba finalizada y no cambia lo producido', async () => {
    const id = await crearEnCurso();
    await finalizar(id, { cantidad_producida: 38 });
    const r = await finalizar(id, { cantidad_producida: 10 });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/finalizada/);
    expect(producciones[0].cantidad_producida).toBe(38);
  });

  test('409 si está cancelada o sin iniciar', async () => {
    const id = await crearEnCurso();
    producciones[0].estado = 'cancelada';
    expect((await finalizar(id, { cantidad_producida: 3 })).status).toBe(409);
    producciones[0].estado = 'planificada';
    const r = await finalizar(id, { cantidad_producida: 3 });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/sin iniciar/);
    expect(producciones[0].cantidad_producida).toBeUndefined();
  });

  test('404 si no existe, es de otra panadería o el id está mal formado', async () => {
    const id = await crearEnCurso();
    producciones[0].panaderia_id = OTRA;
    expect((await finalizar(id, { cantidad_producida: 3 })).status).toBe(404);
    expect((await finalizar('99999999-9999-4999-8999-999999999990', { cantidad_producida: 3 })).status).toBe(404);
    expect((await finalizar('no-es-uuid', { cantidad_producida: 3 })).status).toBe(404);
    expect(producciones[0].estado).toBe('en_curso');
  });

  for (const [nombre, cuerpo] of [
    ['cero', { cantidad_producida: 0 }],
    ['negativa', { cantidad_producida: -4 }],
    ['texto', { cantidad_producida: '38' }],
    ['ausente', {}],
    ['enorme', { cantidad_producida: 10_000_001 }],
    ['lista en vez de objeto', []],
  ] as [string, unknown][]) {
    test(`400 con cantidad ${nombre} y la producción sigue en curso`, async () => {
      const id = await crearEnCurso();
      const r = await finalizar(id, cuerpo);
      expect(r.status).toBe(400);
      expect(producciones[0].estado).toBe('en_curso');
    });
  }

  test('el operario y el administrador pueden cerrar; la respuesta no trae dinero', async () => {
    abastecer();
    const id = await crearEnCurso();
    const a = await finalizar(id, { cantidad_producida: 40 });
    expect(a.status).toBe(200);
    expect(JSON.stringify(a.body)).not.toMatch(/costo|precio|valor/i);
    rol = 'administrador';
    await producir(pan(1));
    expect((await finalizar(producciones[1].id, { cantidad_producida: 40 })).status).toBe(200);
  });

  test('una producción cerrada no se puede modificar: el disparador de la base rechaza el cambio y responde 500', async () => {
    const id = await crearEnCurso();
    producciones[0].estado = 'en_curso';
    // Simula una carrera: otra petición la cerró entre la lectura y el cambio
    const original = prismaFalso.produccion.update;
    prismaFalso.produccion.update = async (a: any) => {
      producciones[0].estado = 'finalizada';
      return original(a);
    };
    const r = await finalizar(id, { cantidad_producida: 20 });
    prismaFalso.produccion.update = original;
    expect(r.status).toBe(500);
    expect(producciones[0].cantidad_producida).toBeUndefined();
  });
});

describe('GET /produccion y GET /produccion/:id', () => {
  test('lista vacía cuando no hay producciones', async () => {
    const r = await obtener('');
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  test('lista las de la panadería, la más reciente primero, con pesados y rendimiento', async () => {
    abastecer();
    await producir(conPesos([idPesos(HARINA, 310)]));
    await producir(pan(1));
    await finalizar(producciones[0].id, { cantidad_producida: 38 });
    producciones.push({ ...producciones[0], id: 'ajena', panaderia_id: OTRA });
    const r = await obtener('');
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(2);
    expect(r.body[0].id).toBe(producciones[1].id);
    const primera = r.body[1];
    expect(primera).toMatchObject({
      estado: 'finalizada',
      producto: 'Pan dulce',
      version: 2,
      usuario: 'Ana Operaria',
      lotes: 1,
      cantidad_planificada: 40,
      cantidad_producida: 38,
      rendimiento_pct: 95,
      insumos_total: 2,
      insumos_pesados: 1,
    });
    expect(r.body[0]).toMatchObject({ estado: 'en_curso', cantidad_producida: null, rendimiento_pct: null, insumos_pesados: 0 });
  });

  test('filtra por estado y rechaza un estado inválido', async () => {
    abastecer();
    await producir(pan(1));
    await producir(pan(1));
    await finalizar(producciones[0].id, { cantidad_producida: 38 });
    expect((await obtener('?estado=finalizada')).body).toHaveLength(1);
    expect((await obtener('?estado=en_curso')).body).toHaveLength(1);
    expect((await obtener('?estado=inventado')).status).toBe(400);
  });

  test('detalle: por insumo estándar, real, desviación y lotes usados', async () => {
    await producir(conPesos([idPesos(HARINA, 330)]));
    const r = await obtener(`/${producciones[0].id}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ producto: 'Pan dulce', estado: 'en_curso', cantidad_planificada: 40, rendimiento_pct: null });
    const harina = porNombre(r.body.insumos, 'Harina');
    expect(harina).toMatchObject({ unidad: 'g', peso_estandar: 300, peso_real: 330, pesado: true, desviacion_pct: 10 });
    expect(harina.lotes).toEqual([{ codigo_lote: 'h1', fecha_vencimiento: null, cantidad: 330 }]);
    expect(porNombre(r.body.insumos, 'Azúcar')).toMatchObject({ pesado: false, desviacion_pct: 0 });
    expect(JSON.stringify(r.body)).not.toMatch(/costo|precio|valor/i);
  });

  test('detalle de una producción anterior a HU-16 (sin pesajes): solo muestra lo consumido', async () => {
    await producir(pan(1));
    pesajes.length = 0;
    const r = await obtener(`/${producciones[0].id}`);
    expect(r.status).toBe(200);
    expect(porNombre(r.body.insumos, 'Harina')).toMatchObject({ peso_estandar: null, peso_real: null, pesado: null, desviacion_pct: null });
    expect(porNombre(r.body.insumos, 'Harina').lotes[0].cantidad).toBe(300);
  });

  test('detalle: 404 si es de otra panadería, no existe o el id está mal formado', async () => {
    await producir(pan(1));
    producciones[0].panaderia_id = OTRA;
    expect((await obtener(`/${producciones[0].id}`)).status).toBe(404);
    expect((await obtener('/99999999-9999-4999-8999-999999999990')).status).toBe(404);
    expect((await obtener('/xyz')).status).toBe(404);
  });
});

describe('DELETE /produccion/:id', () => {
  const borrar = async (id: string) => {
    const r = await fetch(`${base}/produccion/${id}`, { method: 'DELETE' });
    return { status: r.status, body: (await r.json()) as any };
  };

  test('devuelve el stock a los lotes y borra consumo, movimientos y pesaje', async () => {
    rol = 'administrador';
    await producir(pan(1));
    expect(disponible('a1')).toBe(200);
    const r = await borrar(producciones[0].id);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ eliminada: true, lotes_repuestos: 2, mermas_eliminadas: 0 });
    expect(disponible('a1')).toBe(500);
    expect(disponible('h1')).toBe(1000);
    expect(producciones).toHaveLength(0);
    expect(consumos).toHaveLength(0);
    expect(movimientos).toHaveLength(0);
    expect(pesajes).toHaveLength(0);
  });

  test('las mermas ligadas se eliminan y su cantidad también vuelve al lote', async () => {
    rol = 'administrador';
    await producir(pan(1));
    const prod = producciones[0];
    desperdicios.push({ id: 'd1', panaderia_id: PAN, produccion_id: prod.id });
    lotes.find((l) => l.id === 'a1')!.cantidad_disponible = 150;
    movimientos.push({ id: 'mm', panaderia_id: PAN, lote_id: 'a1', cantidad: 50, desperdicio_id: 'd1', consumo_produccion_id: null });
    const r = await borrar(prod.id);
    expect(r.body.mermas_eliminadas).toBe(1);
    expect(disponible('a1')).toBe(500);
    expect(desperdicios).toHaveLength(0);
  });

  test('un operario no puede eliminar', async () => {
    await producir(pan(1));
    expect((await borrar(producciones[0].id)).status).toBe(403);
    expect(producciones).toHaveLength(1);
  });

  test('no existe, de otra panadería o id inválido: 404', async () => {
    rol = 'administrador';
    expect((await borrar('00000000-0000-4000-8000-0000000000ff')).status).toBe(404);
    expect((await borrar('no-es-uuid')).status).toBe(404);
  });

  test('409 si salieron lotes de intermedio de la producción', async () => {
    rol = 'administrador';
    await producir(pan(1));
    lotes.push({ ...crearLote('i1', HARINA, 10), produccion_origen_id: producciones[0].id });
    const r = await borrar(producciones[0].id);
    expect(r.status).toBe(409);
    expect(producciones).toHaveLength(1);
  });

  test('409 si un conteo físico usó sus movimientos; nada cambia', async () => {
    rol = 'administrador';
    await producir(pan(1));
    detallesConteo.push({ movimiento_id: movimientos[0].id });
    const r = await borrar(producciones[0].id);
    expect(r.status).toBe(409);
    expect(disponible('a1')).toBe(200);
    expect(movimientos).toHaveLength(2);
  });
});
