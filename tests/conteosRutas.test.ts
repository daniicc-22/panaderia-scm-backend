import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterConteos } from '../src/routes/conteos';

const PAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USU = '99999999-9999-4999-8999-999999999999';
const MP_HARINA = '22222222-2222-4222-8222-222222222221';
const MP_LEV = '22222222-2222-4222-8222-222222222222';
const MP_AGUA = '22222222-2222-4222-8222-222222222298';
const L1 = '55555555-5555-4555-8555-555555555551'; // harina 100000
const L2 = '55555555-5555-4555-8555-555555555552'; // harina 50000
const L3 = '55555555-5555-4555-8555-555555555553'; // levadura 500
const L_AGUA = '55555555-5555-4555-8555-555555555558';
const L_AJENO = '55555555-5555-4555-8555-555555555599';
const T_ENT = '66666666-6666-4666-8666-666666666661';
const T_SAL = '66666666-6666-4666-8666-666666666662';

type Fila = Record<string, any>;
let conteos: Fila[], detalles: Fila[], lotes: Fila[], materias: Fila[], movimientos: Fila[];
let asignado: boolean;
let rol = 'administrador';
let contador = 0;

function coincide(fila: Fila, where: any): boolean {
  return Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      if ('not' in v) return fila[k] !== v.not;
      if ('in' in v) return v.in.includes(fila[k]);
      if ('gt' in v) return Number(fila[k]) > v.gt;
    }
    return fila[k] === v;
  });
}
const copiar = <T,>(x: T): T => structuredClone(x);

const conAutor = (c: Fila) => ({
  ...c,
  creador: { usuario: { nombre: 'Ana' } },
  resolutor: c.resuelto_por ? { usuario: { nombre: 'Luis' } } : null,
});

const prismaFalso: any = {
  $queryRaw: async () => [],
  usuario_panaderia: { findFirst: async () => (asignado ? { usuario_id: USU } : null) },
  materia_prima: {
    findFirst: async ({ where }: any) => materias.find((m) => coincide(m, where)) ?? null,
    findMany: async ({ where }: any) => materias.filter((m) => coincide(m, where)).map((m) => ({ ...m, unidad_medida: { codigo: 'g' } })),
  },
  lote: {
    findFirst: async ({ where }: any) => lotes.find((l) => coincide(l, where)) ?? null,
    findMany: async ({ where }: any) => lotes.filter((l) => coincide(l, where)),
  },
  tipo_movimiento_inventario: {
    findMany: async () => [
      { id: T_ENT, codigo: 'ajuste_entrada' },
      { id: T_SAL, codigo: 'ajuste_salida' },
    ],
  },
  movimiento_inventario: {
    // Imita el trigger de la base: aplica el efecto sobre el lote y rechaza dejarlo en negativo
    create: async ({ data }: any) => {
      const lote = lotes.find((l) => l.id === data.lote_id)!;
      const signo = data.tipo_movimiento_id === T_ENT ? 1 : -1;
      const nuevo = lote.cantidad_disponible + data.cantidad * signo;
      if (nuevo < 0) throw new Error('La cantidad disponible del lote no puede quedar negativa');
      lote.cantidad_disponible = nuevo;
      const f = { id: `mov-${++contador}`, ...data };
      movimientos.push(f);
      return f;
    },
  },
  conteo_fisico: {
    findFirst: async ({ where }: any) => {
      const c = conteos.find((x) => coincide(x, where));
      if (!c) return null;
      return {
        ...conAutor(c),
        detalle_conteo: detalles
          .filter((d) => d.conteo_id === c.id)
          .map((d) => ({ ...d, lote: lotes.find((l) => l.id === d.lote_id), usuario: { usuario: { nombre: 'Ana' } } })),
      };
    },
    findMany: async ({ where, take }: any) =>
      conteos
        .filter((x) => coincide(x, where))
        .sort((a, b) => b.numero - a.numero)
        .slice(0, take)
        .map((c) => ({ ...conAutor(c), detalle_conteo: detalles.filter((d) => d.conteo_id === c.id) })),
    aggregate: async ({ where }: any) => ({
      _max: { numero: conteos.filter((x) => coincide(x, where)).reduce<number | null>((m, x) => (m === null || x.numero > m ? x.numero : m), null) },
    }),
    create: async ({ data }: any) => {
      if (data.estado === undefined && conteos.some((c) => c.panaderia_id === data.panaderia_id && c.estado === 'en_curso')) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const f = { id: `00000000-0000-4000-8000-${String(++contador).padStart(12, '0')}`, estado: 'en_curso', created_at: new Date(), enviado_at: null, resuelto_por: null, resuelto_at: null, ...data };
      conteos.push(f);
      return f;
    },
    deleteMany: async ({ where }: any) => {
      const antes = conteos.length;
      conteos = conteos.filter((c) => !coincide(c, where));
      return { count: antes - conteos.length };
    },
    update: async ({ where, data }: any) => {
      const c = conteos.find((x) => x.id === where.id)!;
      if (data.estado === 'en_curso' && conteos.some((x) => x.id !== c.id && x.panaderia_id === c.panaderia_id && x.estado === 'en_curso')) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      Object.assign(c, data);
      return c;
    },
  },
  detalle_conteo: {
    findMany: async ({ where }: any) => detalles.filter((d) => coincide(d, where)),
    count: async ({ where }: any) => detalles.filter((d) => coincide(d, where)).length,
    upsert: async ({ where, create, update }: any) => {
      const k = where.conteo_id_lote_id;
      const e = detalles.find((d) => d.conteo_id === k.conteo_id && d.lote_id === k.lote_id);
      if (e) Object.assign(e, update);
      else detalles.push({ id: `det-${++contador}`, contado_at: new Date(), movimiento_id: null, ...create });
    },
    update: async ({ where, data }: any) => {
      Object.assign(detalles.find((d) => d.id === where.id)!, data);
    },
    deleteMany: async ({ where }: any) => {
      const antes = detalles.length;
      detalles = detalles.filter((d) => !coincide(d, where));
      return { count: antes - detalles.length };
    },
  },
  // Transacción simulada: si algo falla se deshace todo lo escrito
  $transaction: async (fn: any) => {
    const foto = copiar({ conteos, detalles, lotes, movimientos });
    try {
      return await fn(prismaFalso);
    } catch (e) {
      ({ conteos, detalles, lotes, movimientos } = foto);
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
  app.use('/conteos', crearRouterConteos(prismaFalso));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

beforeEach(() => {
  rol = 'administrador';
  asignado = true;
  contador = 0;
  conteos = [];
  detalles = [];
  movimientos = [];
  materias = [
    { id: MP_HARINA, panaderia_id: PAN, codigo: 'MP-001', nombre: 'Harina', activa: true, controla_inventario: true, unidad_medida: { codigo: 'g' } },
    { id: MP_LEV, panaderia_id: PAN, codigo: 'MP-002', nombre: 'Levadura', activa: true, controla_inventario: true },
    { id: MP_AGUA, panaderia_id: PAN, codigo: 'MP-008', nombre: 'Agua', activa: true, controla_inventario: false },
  ];
  const lote = (id: string, mp: string, disp: number, costo: number, extra: Fila = {}) => ({
    id, panaderia_id: PAN, materia_prima_id: mp, codigo_lote: `LT-${id.slice(-2)}`, cantidad_disponible: disp, costo_unitario: costo, fecha_vencimiento: null, ...extra,
  });
  lotes = [
    lote(L1, MP_HARINA, 100000, 2),
    lote(L2, MP_HARINA, 50000, 3),
    lote(L3, MP_LEV, 500, 20),
    lote(L_AGUA, MP_AGUA, 10, 1),
    { ...lote(L_AJENO, MP_HARINA, 10, 1), panaderia_id: OTRA },
  ];
});

const llamar = async (metodo: string, ruta: string, cuerpo?: unknown) => {
  const r = await fetch(`${base}/conteos${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, body: (await r.json()) as any };
};
const abrir = async () => (await llamar('POST', '', {})).body.id as string;
const contar = (id: string, lote: string, cantidad: number, extra: Record<string, unknown> = {}) =>
  llamar('PUT', `/${id}/lineas`, { lote_id: lote, cantidad_contada: cantidad, ...extra });
const enviado = async () => {
  const id = await abrir();
  await contar(id, L1, 90000, { motivo: 'error_produccion' }); // falta 10000
  await contar(id, L2, 50000); // exacto
  await contar(id, L3, 600, { motivo: 'error_registro' }); // sobra 100
  await llamar('POST', `/${id}/enviar`);
  return id;
};

describe('POST / (abrir)', () => {
  test('abre el conteo n.º 1 en curso y luego el siguiente número', async () => {
    const r = await llamar('POST', '', { observaciones: '  Conteo de fin de mes ' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ numero: 1, estado: 'en_curso' });
    expect(conteos[0].observaciones).toBe('Conteo de fin de mes');
    expect(conteos[0].creado_por).toBe(USU);
    await llamar('POST', `/${r.body.id}/descartar`);
    expect((await llamar('POST', '', {})).body.numero).toBe(2);
  });
  test('rechaza abrir otro mientras hay uno en curso', async () => {
    const id = await abrir();
    const r = await llamar('POST', '', {});
    expect(r.status).toBe(409);
    expect(r.body.id).toBe(id);
    expect(conteos).toHaveLength(1);
  });
  test('una carrera con la restricción única responde 409, no 500', async () => {
    const original = prismaFalso.conteo_fisico.findFirst;
    prismaFalso.conteo_fisico.findFirst = async () => null; // la revisión previa no ve el conteo abierto
    await abrir();
    const r = await llamar('POST', '', {});
    prismaFalso.conteo_fisico.findFirst = original;
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/al mismo tiempo/);
  });
  test('exige usuario asignado y observaciones válidas', async () => {
    asignado = false;
    expect((await llamar('POST', '', {})).status).toBe(403);
    asignado = true;
    expect((await llamar('POST', '', { observaciones: 5 })).status).toBe(400);
    expect(conteos).toHaveLength(0);
  });
  test('un operario también puede abrir y contar', async () => {
    rol = 'operario';
    expect((await llamar('POST', '', {})).status).toBe(201);
  });
});

describe('PUT /:id/lineas (contar)', () => {
  test('guarda lo que decía el sistema y calcula la diferencia', async () => {
    const id = await abrir();
    const r = await contar(id, L1, 90000, { motivo: 'perdida_dano', observaciones: 'Se rompió un bulto' });
    expect(r.status).toBe(200);
    expect(detalles[0]).toMatchObject({ conteo_id: id, lote_id: L1, cantidad_sistema: 100000, cantidad_contada: 90000, motivo: 'perdida_dano', contado_por: USU, panaderia_id: PAN });
    expect(r.body.lineas[0]).toMatchObject({ codigo: 'MP-001', diferencia: -10000, cantidad_sistema: 100000, motivo: 'perdida_dano', ajustada: false });
    expect(r.body.resumen).toMatchObject({ lotes: 1, faltantes: 1, eri: 90 });
  });
  test('contar de nuevo el mismo lote lo reemplaza y renueva el valor del sistema', async () => {
    const id = await abrir();
    await contar(id, L1, 90000, { motivo: 'otro', observaciones: 'revisar' });
    lotes[0].cantidad_disponible = 95000; // llegó un movimiento mientras tanto
    await contar(id, L1, 95000);
    expect(detalles).toHaveLength(1);
    expect(detalles[0]).toMatchObject({ cantidad_sistema: 95000, cantidad_contada: 95000, motivo: null, observaciones: null });
  });
  test('con diferencia exige motivo; sin diferencia lo descarta', async () => {
    const id = await abrir();
    const sin = await contar(id, L1, 1);
    expect(sin.status).toBe(400);
    expect(sin.body.error).toMatch(/motivo/);
    expect(sin.body).toMatchObject({ requiere_motivo: true, cantidad_sistema: 100000, diferencia: -99999 });
    expect(detalles).toHaveLength(0);
    await contar(id, L2, 50000, { motivo: 'perdida_dano' });
    expect(detalles[0].motivo).toBeNull();
  });
  test('"otro" pide explicación y "vencimiento" no sirve para sobrantes', async () => {
    const id = await abrir();
    expect((await contar(id, L1, 1, { motivo: 'otro' })).status).toBe(400);
    expect((await contar(id, L1, 200000, { motivo: 'vencimiento' })).status).toBe(400);
    expect((await contar(id, L1, 1, { motivo: 'vencimiento' })).status).toBe(200);
  });
  test('valida el cuerpo, el lote y el estado del conteo', async () => {
    const id = await abrir();
    expect((await contar(id, 'no-uuid', 1)).status).toBe(400);
    expect((await contar(id, L1, -1)).status).toBe(400);
    expect((await llamar('PUT', '/no-uuid/lineas', { lote_id: L1, cantidad_contada: 1 })).status).toBe(400);
    expect((await contar('00000000-0000-4000-8000-0000000000ff', L1, 100000)).status).toBe(404);
    expect((await contar(id, L_AJENO, 10)).status).toBe(404); // lote de otra panadería
    expect((await contar(id, '55555555-5555-4555-8555-5555555555aa', 10)).status).toBe(404);
    expect((await contar(id, L_AGUA, 10)).status).toBe(409); // insumo que no se controla
    materias[0].activa = false;
    expect((await contar(id, L1, 1, { motivo: 'otro', observaciones: 'x y z' })).status).toBe(409);
    materias[0].activa = true;
    await contar(id, L2, 50000);
    await llamar('POST', `/${id}/enviar`);
    expect((await contar(id, L2, 50000)).status).toBe(409); // ya enviado
  });
  test('exige usuario asignado', async () => {
    const id = await abrir();
    asignado = false;
    expect((await contar(id, L1, 100000)).status).toBe(403);
    expect(detalles).toHaveLength(0);
  });
});

describe('GET /:id/lotes (lotes por contar)', () => {
  test('lista los lotes con existencias de insumos que se controlan, sin mostrar lo que dice el sistema', async () => {
    const id = await abrir();
    lotes.push({ id: '55555555-5555-4555-8555-555555555560', panaderia_id: PAN, materia_prima_id: MP_HARINA, codigo_lote: 'LT-00', cantidad_disponible: 0, costo_unitario: 1, fecha_vencimiento: null });
    lotes[1].fecha_vencimiento = new Date('2026-12-01T00:00:00Z');
    lotes[0].fecha_vencimiento = new Date('2027-01-01T00:00:00Z');
    await contar(id, L3, 500);
    const r = await llamar('GET', `/${id}/lotes`);
    expect(r.status).toBe(200);
    expect(r.body.items.map((i: any) => i.lote_id)).toEqual([L2, L1, L3]); // harina por vencimiento, luego levadura
    expect(r.body.items.map((i: any) => i.contado)).toEqual([false, false, true]);
    expect(r.body.items[0]).toMatchObject({ codigo: 'MP-001', nombre: 'Harina', unidad: 'g', fecha_vencimiento: '2026-12-01' });
    expect(JSON.stringify(r.body)).not.toMatch(/cantidad|costo/); // sin agua (no se controla), sin lote vacío, sin lote ajeno
  });
  test('un insumo desactivado no aparece; valida el identificador y la panadería', async () => {
    const id = await abrir();
    materias[1].activa = false;
    expect((await llamar('GET', `/${id}/lotes`)).body.items.map((i: any) => i.lote_id)).toEqual([L1, L2]);
    expect((await llamar('GET', '/xx/lotes')).status).toBe(400);
    expect((await llamar('GET', '/00000000-0000-4000-8000-0000000000ff/lotes')).status).toBe(404);
    conteos[0].panaderia_id = OTRA;
    expect((await llamar('GET', `/${id}/lotes`)).status).toBe(404);
  });
});

describe('DELETE /:id/lineas/:loteId', () => {
  test('quita un lote contado', async () => {
    const id = await abrir();
    await contar(id, L1, 100000);
    const r = await llamar('DELETE', `/${id}/lineas/${L1}`);
    expect(r.status).toBe(200);
    expect(r.body.lineas).toHaveLength(0);
    expect((await llamar('DELETE', `/${id}/lineas/${L1}`)).status).toBe(404);
    expect((await llamar('DELETE', `/${id}/lineas/x`)).status).toBe(400);
  });
  test('no admite cambios en un conteo enviado', async () => {
    const id = await enviado();
    expect((await llamar('DELETE', `/${id}/lineas/${L1}`)).status).toBe(409);
    expect(detalles).toHaveLength(3);
  });
});

describe('POST /:id/enviar', () => {
  test('sin lotes contados no se envía', async () => {
    const id = await abrir();
    expect((await llamar('POST', `/${id}/enviar`)).status).toBe(409);
    expect(conteos[0].estado).toBe('en_curso');
  });
  test('pasa a enviado con su fecha y no se puede enviar dos veces', async () => {
    const id = await enviado();
    expect(conteos[0].estado).toBe('enviado');
    expect(conteos[0].enviado_at).toBeInstanceOf(Date);
    expect((await llamar('POST', `/${id}/enviar`)).status).toBe(409);
    expect((await llamar('POST', '/00000000-0000-4000-8000-0000000000ff/enviar')).status).toBe(404);
  });
});

describe('POST /:id/devolver', () => {
  test('solo gestión; vuelve a en curso', async () => {
    const id = await enviado();
    rol = 'operario';
    expect((await llamar('POST', `/${id}/devolver`)).status).toBe(403);
    rol = 'administrador';
    const r = await llamar('POST', `/${id}/devolver`);
    expect(r.status).toBe(200);
    expect(conteos[0]).toMatchObject({ estado: 'en_curso', enviado_at: null });
    expect((await llamar('POST', `/${id}/devolver`)).status).toBe(409);
  });
  test('no devuelve si ya hay otro conteo en curso (409)', async () => {
    const id = await enviado();
    await abrir();
    const r = await llamar('POST', `/${id}/devolver`);
    expect(r.status).toBe(409);
    expect(conteos[0].estado).toBe('enviado');
  });
});

describe('POST /:id/descartar', () => {
  test('cierra sin ajustar el inventario', async () => {
    const id = await enviado();
    const r = await llamar('POST', `/${id}/descartar`);
    expect(r.status).toBe(200);
    expect(conteos[0]).toMatchObject({ estado: 'descartado', resuelto_por: USU });
    expect(movimientos).toHaveLength(0);
    expect(lotes[0].cantidad_disponible).toBe(100000);
    expect((await llamar('POST', `/${id}/descartar`)).status).toBe(409);
  });
  test('un conteo en curso también se puede descartar; un operario no', async () => {
    const id = await abrir();
    rol = 'operario';
    expect((await llamar('POST', `/${id}/descartar`)).status).toBe(403);
    rol = 'administrador';
    expect((await llamar('POST', `/${id}/descartar`)).status).toBe(200);
  });
});

describe('POST /:id/aplicar', () => {
  test('crea un ajuste por cada diferencia, con su motivo, y cierra el conteo', async () => {
    const id = await enviado();
    const r = await llamar('POST', `/${id}/aplicar`);
    expect(r.status).toBe(200);
    expect(r.body.ajustes).toBe(2);
    expect(movimientos).toHaveLength(2);
    const sal = movimientos.find((m) => m.lote_id === L1)!;
    const ent = movimientos.find((m) => m.lote_id === L3)!;
    expect(sal).toMatchObject({ tipo_movimiento_id: T_SAL, cantidad: 10000, usuario_id: USU, panaderia_id: PAN });
    expect(sal.observaciones).toMatch(/Conteo n\.º 1: Error en una producción/);
    expect(ent).toMatchObject({ tipo_movimiento_id: T_ENT, cantidad: 100 });
    expect(lotes.find((l) => l.id === L1)!.cantidad_disponible).toBe(90000);
    expect(lotes.find((l) => l.id === L2)!.cantidad_disponible).toBe(50000);
    expect(lotes.find((l) => l.id === L3)!.cantidad_disponible).toBe(600);
    expect(conteos[0]).toMatchObject({ estado: 'aplicado', resuelto_por: USU });
    expect(detalles.filter((d) => d.movimiento_id).map((d) => d.lote_id).sort()).toEqual([L1, L3].sort());
    expect(r.body.lineas.find((l: any) => l.lote_id === L2).ajustada).toBe(false);
  });
  test('incluye las observaciones en la nota del ajuste', async () => {
    const id = await abrir();
    await contar(id, L1, 99000, { motivo: 'otro', observaciones: 'Se derramó' });
    await llamar('POST', `/${id}/enviar`);
    await llamar('POST', `/${id}/aplicar`);
    expect(movimientos[0].observaciones).toBe('Conteo n.º 1: Otro (Se derramó)');
  });
  test('solo gestión y solo un conteo enviado', async () => {
    const id = await enviado();
    rol = 'operario';
    expect((await llamar('POST', `/${id}/aplicar`)).status).toBe(403);
    rol = 'administrador';
    asignado = false;
    expect((await llamar('POST', `/${id}/aplicar`)).status).toBe(403);
    asignado = true;
    await llamar('POST', `/${id}/aplicar`);
    expect((await llamar('POST', `/${id}/aplicar`)).status).toBe(409); // no se aplica dos veces
    expect(movimientos).toHaveLength(2);
    const otro = await abrir();
    expect((await llamar('POST', `/${otro}/aplicar`)).status).toBe(409); // en curso
  });
  test('todo o nada: si un ajuste dejaría un lote en negativo no se aplica ninguno', async () => {
    const id = await abrir();
    await contar(id, L3, 600, { motivo: 'error_registro' }); // +100 (se aplica primero o después según el orden de lote)
    await contar(id, L1, 0, { motivo: 'perdida_dano' }); // -100000
    await llamar('POST', `/${id}/enviar`);
    lotes[0].cantidad_disponible = 40000; // se gastó producto después de contar
    const r = await llamar('POST', `/${id}/aplicar`);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/negativo/);
    expect(movimientos).toHaveLength(0);
    expect(lotes.find((l) => l.id === L3)!.cantidad_disponible).toBe(500);
    expect(lotes[0].cantidad_disponible).toBe(40000);
    expect(conteos[0].estado).toBe('enviado');
    expect(detalles.every((d) => d.movimiento_id === null)).toBe(true);
  });
  test('todo o nada: una línea sin motivo no deja ajustes a medias', async () => {
    const id = await enviado();
    detalles.find((d) => d.lote_id === L3)!.motivo = null; // dato dañado: diferencia sin motivo
    const r = await llamar('POST', `/${id}/aplicar`);
    expect(r.status).toBe(409);
    expect(movimientos).toHaveLength(0);
    expect(lotes[0].cantidad_disponible).toBe(100000);
    expect(conteos[0].estado).toBe('enviado');
  });
  test('un error inesperado devuelve 500 y no deja nada escrito', async () => {
    const id = await enviado();
    const original = prismaFalso.movimiento_inventario.create;
    let n = 0;
    prismaFalso.movimiento_inventario.create = async (a: any) => {
      if (++n === 2) throw new Error('caída de red');
      return original(a);
    };
    const silencio = console.error;
    console.error = () => {};
    const r = await llamar('POST', `/${id}/aplicar`);
    console.error = silencio;
    prismaFalso.movimiento_inventario.create = original;
    expect(r.status).toBe(500);
    expect(movimientos).toHaveLength(0);
    expect(conteos[0].estado).toBe('enviado');
    expect(lotes.map((l) => l.cantidad_disponible).slice(0, 3)).toEqual([100000, 50000, 500]);
  });
  test('el ajuste es sobre lo contado menos lo del sistema al contar, aunque el lote cambie después', async () => {
    const id = await abrir();
    await contar(id, L1, 90000, { motivo: 'perdida_dano' }); // -10000 respecto a 100000
    await llamar('POST', `/${id}/enviar`);
    lotes[0].cantidad_disponible = 70000; // una producción gastó 30000 después
    await llamar('POST', `/${id}/aplicar`);
    expect(lotes[0].cantidad_disponible).toBe(60000);
  });
});

describe('GET / y GET /:id', () => {
  test('el listado trae la exactitud por conteo; el último y el promedio solo cuentan los enviados o aplicados', async () => {
    const id1 = await enviado(); // ERI = (0.9 + 1 + 500/600)/3
    const id2 = await abrir(); // no se puede abrir otro con uno enviado? sí: el enviado ya no está "en curso"
    await contar(id2, L2, 25000, { motivo: 'perdida_dano' }); // 50 %
    const r = await llamar('GET', '');
    expect(r.status).toBe(200);
    expect(r.body.meta_eri).toBe(95);
    expect(r.body.items.map((i: any) => i.numero)).toEqual([2, 1]);
    expect(r.body.items[1].resumen.eri).toBe(91.11);
    expect(r.body.ultimo_eri).toBe(91.11); // el conteo en curso no cuenta
    expect(r.body.promedio_eri).toBe(91.11);
    await llamar('POST', `/${id2}/enviar`);
    const r2 = await llamar('GET', '');
    expect(r2.body.ultimo_eri).toBe(50);
    expect(r2.body.promedio_eri).toBe(70.56);
    await llamar('POST', `/${id1}/aplicar`);
    expect((await llamar('GET', '')).body.promedio_eri).toBe(70.56); // aplicado sigue contando
  });
  test('un conteo descartado no cuenta en la exactitud', async () => {
    const id1 = await enviado();
    await llamar('POST', `/${id1}/descartar`);
    const r = await llamar('GET', '');
    expect(r.body.items[0].resumen.eri).toBe(91.11); // se muestra en su fila
    expect(r.body.ultimo_eri).toBeNull();
    expect(r.body.promedio_eri).toBeNull();
  });
  test('sin conteos no hay exactitud', async () => {
    const r = await llamar('GET', '');
    expect(r.body).toMatchObject({ items: [], ultimo_eri: null, promedio_eri: null });
  });
  test('el detalle muestra el dinero solo a gestión', async () => {
    const id = await enviado();
    const g = await llamar('GET', `/${id}`);
    expect(g.status).toBe(200);
    expect(g.body.resumen).toMatchObject({ valor_faltantes: 20000, valor_sobrantes: 2000, lotes: 3, exactos: 1, faltantes: 1, sobrantes: 1 });
    expect(g.body.lineas.find((l: any) => l.lote_id === L1).valor_diferencia).toBe(-20000);
    expect(g.body.lineas[0]).toMatchObject({ nombre: 'Harina' });
    expect(g.body.creado_por).toBe('Ana');
    rol = 'operario';
    const o = await llamar('GET', `/${id}`);
    expect(JSON.stringify(o.body)).not.toMatch(/valor_|costo/);
    expect(o.body.resumen.eri).toBe(g.body.resumen.eri);
  });
  test('valida el identificador y no muestra conteos de otra panadería', async () => {
    expect((await llamar('GET', '/xx')).status).toBe(400);
    expect((await llamar('GET', '/00000000-0000-4000-8000-0000000000ff')).status).toBe(404);
    const id = await abrir();
    conteos[0].panaderia_id = OTRA;
    expect((await llamar('GET', `/${id}`)).status).toBe(404);
    expect((await llamar('GET', '')).body.items).toHaveLength(0);
  });
});

describe('aislamiento entre panaderías', () => {
  test('ninguna acción toca un conteo de otra panadería', async () => {
    const id = await enviado();
    conteos[0].panaderia_id = OTRA;
    const acciones: [string, string, unknown?][] = [
      ['PUT', `/${id}/lineas`, { lote_id: L1, cantidad_contada: 1, motivo: 'perdida_dano' }],
      ['DELETE', `/${id}/lineas/${L1}`],
      ['POST', `/${id}/enviar`],
      ['POST', `/${id}/devolver`],
      ['POST', `/${id}/descartar`],
      ['POST', `/${id}/aplicar`],
      ['GET', `/${id}/lotes`],
    ];
    for (const [m, ruta, cuerpo] of acciones) {
      expect((await llamar(m, ruta, cuerpo)).status, `${m} ${ruta}`).toBe(404);
    }
    expect(conteos[0]).toMatchObject({ estado: 'enviado', panaderia_id: OTRA });
    expect(movimientos).toHaveLength(0);
  });
});

describe('DELETE /:id (eliminar)', () => {
  const eliminar = (id: string) => llamar('DELETE', `/${id}`);

  test('elimina un conteo en curso con sus líneas y deja abrir otro', async () => {
    const id = await abrir();
    await contar(id, L1, 100000);
    const r = await eliminar(id);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ eliminado: true, id });
    expect(conteos).toHaveLength(0);
    expect(detalles).toHaveLength(0);
    expect((await llamar('POST', '', {})).status).toBe(201);
  });
  test('elimina uno descartado y uno enviado (administración) sin tocar el inventario', async () => {
    const id = await enviado();
    expect((await eliminar(id)).status).toBe(200);
    const otro = await abrir();
    await llamar('POST', `/${otro}/descartar`);
    expect((await eliminar(otro)).status).toBe(200);
    expect(conteos).toHaveLength(0);
    expect(movimientos).toHaveLength(0);
    expect(lotes[0].cantidad_disponible).toBe(100000);
  });
  test('un conteo aplicado no se elimina', async () => {
    const id = await enviado();
    await llamar('POST', `/${id}/aplicar`);
    const r = await eliminar(id);
    expect(r.status).toBe(409);
    expect(conteos).toHaveLength(1);
    expect(detalles).toHaveLength(3);
  });
  test('el operario elimina solo los suyos que están en curso o descartados', async () => {
    rol = 'operario';
    const mio = await abrir();
    expect((await eliminar(mio)).status).toBe(200);
    const descartado = await abrir();
    rol = 'administrador';
    await llamar('POST', `/${descartado}/descartar`);
    rol = 'operario';
    expect((await eliminar(descartado)).status).toBe(200);
    expect(conteos).toHaveLength(0);
  });
  test('el operario no elimina conteos ajenos ni enviados', async () => {
    const ajeno = await abrir();
    conteos[0].creado_por = '88888888-8888-4888-8888-888888888888';
    rol = 'operario';
    const r1 = await eliminar(ajeno);
    expect(r1.status).toBe(403);
    expect(conteos).toHaveLength(1);
    conteos[0].creado_por = USU;
    await contar(ajeno, L1, 100000);
    await llamar('POST', `/${ajeno}/enviar`);
    const r2 = await eliminar(ajeno);
    expect(r2.status).toBe(403);
    expect(conteos).toHaveLength(1);
    expect(detalles).toHaveLength(1);
  });
  test('el listado y el detalle indican si se puede eliminar', async () => {
    const aplicado = await enviado();
    await llamar('POST', `/${aplicado}/aplicar`);
    const enCurso = await abrir();
    let lista = (await llamar('GET', '')).body.items;
    expect(lista.find((i: any) => i.id === aplicado).puede_eliminar).toBe(false);
    expect(lista.find((i: any) => i.id === enCurso).puede_eliminar).toBe(true);
    expect((await llamar('GET', `/${aplicado}`)).body.puede_eliminar).toBe(false);
    expect((await llamar('GET', `/${enCurso}`)).body.puede_eliminar).toBe(true);
    // el operario: no el aplicado, no el de otra persona, sí el suyo
    rol = 'operario';
    conteos.find((c) => c.id === enCurso)!.creado_por = '88888888-8888-4888-8888-888888888888';
    lista = (await llamar('GET', '')).body.items;
    expect(lista.find((i: any) => i.id === enCurso).puede_eliminar).toBe(false);
    conteos.find((c) => c.id === enCurso)!.creado_por = USU;
    expect((await llamar('GET', `/${enCurso}`)).body.puede_eliminar).toBe(true);
    expect((await contar(enCurso, L1, 90000)).status).toBe(200); // el aplicado dejó el lote en 90000
    expect((await llamar('POST', `/${enCurso}/enviar`)).status).toBe(200);
    expect((await llamar('GET', `/${enCurso}`)).body.puede_eliminar).toBe(false); // enviado: lo revisa un administrador
  });
  test('valida el identificador, la panadería y que exista', async () => {
    expect((await eliminar('xx')).status).toBe(400);
    expect((await eliminar('00000000-0000-4000-8000-0000000000ff')).status).toBe(404);
    const id = await abrir();
    conteos[0].panaderia_id = OTRA;
    expect((await eliminar(id)).status).toBe(404);
    expect(conteos).toHaveLength(1);
  });
});
