import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterFormulaciones } from '../src/routes/formulaciones';
import { sinErroresEnConsola } from './helpers';

const PAN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const U_G = '11111111-1111-4111-8111-111111111111';
const U_UND = '11111111-1111-4111-8111-111111111112';
const HARINA = '33333333-3333-4333-8333-333333333331';
const SAL = '33333333-3333-4333-8333-333333333332';
const AZUCAR = '33333333-3333-4333-8333-333333333333';
const INACTIVA = '33333333-3333-4333-8333-333333333334';
const AJENA = '33333333-3333-4333-8333-333333333399';
const INTER = '44444444-4444-4444-8444-444444444441';
const INTER_NUEVO = '44444444-4444-4444-8444-444444444442';
const PROD_PAN = '55555555-5555-4555-8555-555555555551';
const PROD_OTRO = '55555555-5555-4555-8555-555555555552';
const F_V1 = '66666666-6666-4666-8666-666666666661';
const F_V2 = '66666666-6666-4666-8666-666666666662';
const F_OTRO = '66666666-6666-4666-8666-666666666663';
const F_AJENA = '66666666-6666-4666-8666-666666666664';
const F_INTER = '66666666-6666-4666-8666-666666666665';

type Fila = Record<string, any>;
let formulaciones: Fila[];
let productos: Fila[];
let materias: Fila[];
let operaciones: string[];
let fallarCierre = false;
let fallarCreacion: 'ninguna' | 'unico' | 'otro' = 'ninguna';
let unidadUnExiste = true;
let unidadGExiste = true;
let secuencia = 0;

// Identificadores con formato UUID, como los genera la base
const uuidNuevo = (d: string) => `${d.repeat(8)}-${d.repeat(4)}-4${d.repeat(3)}-8${d.repeat(3)}-${String(++secuencia).padStart(12, '0')}`;

const linea = (materia: string | null, cantidad: number, extra: Fila = {}) => ({
  materia_prima_id: materia,
  producto_intermedio_id: null,
  cantidad_estandar: cantidad,
  unidad_id: U_G,
  tolerancia_porcentaje: null,
  ...extra,
});

const coincide = (f: Fila, where: any) => {
  if (!where) return true;
  if (where.id !== undefined && f.id !== where.id) return false;
  if (where.panaderia_id !== undefined && f.panaderia_id !== where.panaderia_id) return false;
  if (where.producto_id !== undefined && f.producto_id !== where.producto_id) return false;
  if (where.activa !== undefined && f.activa !== where.activa) return false;
  if (where.producto?.activo !== undefined) {
    const prod = productos.find((x) => x.id === f.producto_id);
    if (!prod || prod.activo !== where.producto.activo) return false;
  }
  return true;
};

const conRelaciones = (f: Fila) => ({
  ...f,
  producto: productos.find((x) => x.id === f.producto_id) ?? { id: f.producto_id, nombre: 'Otro', es_intermedio: false, activo: true },
  usuario: f.aprobado_por ? { nombre: 'Ana Administradora' } : null,
  detalle_formulacion: f.detalle_formulacion.map((d: Fila) => ({ ...d, unidad_medida: { codigo: 'g' } })),
});

const prismaFalso: any = {
  formulacion: {
    findFirst: async ({ where }: any) => {
      const f = formulaciones.find((x) => coincide(x, where));
      return f ? conRelaciones(f) : null;
    },
    findMany: async ({ where }: any) =>
      formulaciones
        .filter((x) => coincide(x, where))
        .sort((a, b) => b.version - a.version)
        .map(conRelaciones),
    aggregate: async ({ where }: any) => {
      const versiones = formulaciones.filter((x) => coincide(x, where)).map((x) => x.version);
      return { _max: { version: versiones.length ? Math.max(...versiones) : null } };
    },
    updateMany: async ({ where, data }: any) => {
      operaciones.push('cerrar');
      if (fallarCierre) {
        // Otra persona ya cerró la vigente entre la lectura y la escritura
        formulaciones.filter((x) => coincide(x, { id: where.id })).forEach((x) => (x.activa = false));
        return { count: 0 };
      }
      const afectadas = formulaciones.filter((x) => coincide(x, where));
      afectadas.forEach((x) => Object.assign(x, data));
      return { count: afectadas.length };
    },
    create: async ({ data }: any) => {
      operaciones.push('crear');
      if (fallarCreacion === 'unico') throw Object.assign(new Error('unico'), { code: 'P2002' });
      if (fallarCreacion === 'otro') throw new Error('falla inesperada');
      // La base permite una sola versión activa por producto
      if (data.activa && formulaciones.some((x) => x.producto_id === data.producto_id && x.activa)) {
        throw Object.assign(new Error('indice unico'), { code: 'P2002' });
      }
      const { detalle_formulacion, ...resto } = data;
      const fila = { id: uuidNuevo('6'), vigente_hasta: null, ...resto, detalle_formulacion: detalle_formulacion.create };
      formulaciones.push(fila);
      return fila;
    },
  },
  materia_prima: {
    findMany: async ({ where }: any) =>
      materias
        .filter(
          (m) =>
            (where.panaderia_id === undefined || m.panaderia_id === where.panaderia_id) &&
            (where.activa === undefined || m.activa === where.activa) &&
            (where.id?.in === undefined || where.id.in.includes(m.id)),
        )
        .map((m) => ({
          ...m,
          presentacion: [{ id: 'p', contenido: 1000, activa: true, presentacion_proveedor: [{ id: 'o', precio_referencia: 2000, vigente: true, proveedor: { activo: true } }] }],
        })),
  },
  detalle_formulacion: {
    findMany: async ({ where }: any) =>
      formulaciones
        .filter((f) => coincide(f, { panaderia_id: where.formulacion.panaderia_id, activa: where.formulacion.activa, producto: where.formulacion.producto }))
        .flatMap((f) =>
          f.detalle_formulacion
            .filter((d: Fila) => d.producto_intermedio_id === where.producto_intermedio_id)
            .map((d: Fila) => ({ ...d, formulacion: conRelaciones(f) })),
        ),
  },
  producto: {
    findMany: async ({ where }: any = {}) =>
      productos
        .filter(
          (p) =>
            (where?.id?.in === undefined || where.id.in.includes(p.id)) &&
            (where?.panaderia_id === undefined || p.panaderia_id === where.panaderia_id) &&
            (where?.es_intermedio === undefined || p.es_intermedio === where.es_intermedio) &&
            (where?.activo === undefined || p.activo === where.activo),
        )
        .map((p) => ({ id: p.id, nombre: p.nombre })),
    update: async ({ where, data }: any) => {
      const prod = productos.find((x) => x.id === where.id)!;
      Object.assign(prod, data);
      return prod;
    },
    findFirst: async ({ where }: any) =>
      productos.find(
        (p) =>
          p.panaderia_id === where.panaderia_id &&
          // Como la base: solo ignora mayúsculas si se pide mode: 'insensitive'
          (where.nombre.mode === 'insensitive'
            ? p.nombre.toLowerCase() === String(where.nombre.equals).toLowerCase()
            : p.nombre === where.nombre.equals),
      ) ?? null,
    create: async ({ data }: any) => {
      operaciones.push('crear-producto');
      const fila = { id: uuidNuevo('7'), activo: true, ...data };
      productos.push(fila);
      return fila;
    },
  },
  unidad_medida: {
    findUnique: async ({ where }: any) => {
      if (where.codigo === 'un' && unidadUnExiste) return { id: U_UND, codigo: 'un' };
      if (where.codigo === 'g' && unidadGExiste) return { id: U_G, codigo: 'g' };
      return null;
    },
  },
  // Transacción simulada: si falla algo, se deshacen todos los cambios
  $transaction: async (fn: any) => {
    const copia = JSON.parse(JSON.stringify(formulaciones, (_k, v) => v));
    const copiaProductos = JSON.parse(JSON.stringify(productos));
    try {
      return await fn(prismaFalso);
    } catch (e) {
      formulaciones.splice(0, formulaciones.length, ...copia);
      productos.splice(0, productos.length, ...copiaProductos);
      throw e;
    }
  },
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
  app.use('/formulaciones', crearRouterFormulaciones(prismaFalso));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => {
  servidor.close();
});

beforeEach(() => {
  fallarCierre = false;
  fallarCreacion = 'ninguna';
  unidadUnExiste = true;
  unidadGExiste = true;
  productos = [
    { id: PROD_PAN, panaderia_id: PAN_A, nombre: 'Pan', es_intermedio: false, activo: true },
    { id: PROD_OTRO, panaderia_id: PAN_A, nombre: 'Otro viejo', es_intermedio: false, activo: false },
    { id: INTER, panaderia_id: PAN_A, nombre: 'Masa añadida', es_intermedio: true, activo: true },
    { id: 'producto-b', panaderia_id: PAN_B, nombre: 'Pan de yuca', es_intermedio: false, activo: true },
  ];
  operaciones = [];
  secuencia = 0;
  materias = [
    { id: HARINA, panaderia_id: PAN_A, codigo: 'MP-001', nombre: 'Harina', activa: true, unidad_base_id: U_G },
    { id: SAL, panaderia_id: PAN_A, codigo: 'MP-007', nombre: 'Sal', activa: true, unidad_base_id: U_G },
    { id: AZUCAR, panaderia_id: PAN_A, codigo: 'MP-002', nombre: 'Azúcar', activa: true, unidad_base_id: U_UND },
    { id: INACTIVA, panaderia_id: PAN_A, codigo: 'MP-099', nombre: 'Vieja', activa: false, unidad_base_id: U_G },
    { id: AJENA, panaderia_id: PAN_B, codigo: 'MP-001', nombre: 'Ajena', activa: true, unidad_base_id: U_G },
  ];
  formulaciones = [
    {
      id: F_V1, panaderia_id: PAN_A, producto_id: PROD_PAN, version: 1, activa: false,
      vigente_desde: new Date('2026-09-01'), vigente_hasta: new Date('2026-10-01'), rendimiento_esperado: 10, aprobado_por: null,
      detalle_formulacion: [linea(HARINA, 900)],
    },
    {
      id: F_V2, panaderia_id: PAN_A, producto_id: PROD_PAN, version: 2, activa: true,
      vigente_desde: new Date('2026-10-01'), vigente_hasta: null, rendimiento_esperado: 10, aprobado_por: 'u0',
      detalle_formulacion: [linea(HARINA, 1000, { tolerancia_porcentaje: 2 }), linea(SAL, 20), linea(null, 300, { producto_intermedio_id: INTER, unidad_id: U_UND })],
    },
    {
      id: F_OTRO, panaderia_id: PAN_A, producto_id: PROD_OTRO, version: 1, activa: true,
      vigente_desde: new Date('2026-10-01'), vigente_hasta: null, rendimiento_esperado: 5, aprobado_por: null,
      detalle_formulacion: [linea(SAL, 10)],
    },
    {
      id: F_INTER, panaderia_id: PAN_A, producto_id: INTER, version: 1, activa: true,
      vigente_desde: new Date('2026-10-01'), vigente_hasta: null, rendimiento_esperado: 1, aprobado_por: null,
      detalle_formulacion: [linea(HARINA, 500)],
    },
    {
      id: F_AJENA, panaderia_id: PAN_B, producto_id: '55555555-5555-4555-8555-5555555555b1', version: 1, activa: true,
      vigente_desde: new Date('2026-10-01'), vigente_hasta: null, rendimiento_esperado: 5, aprobado_por: null,
      detalle_formulacion: [linea(AJENA, 10)],
    },
  ];
});

async function llamar(metodo: string, ruta: string, rol: string, cuerpo?: unknown) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-rol': rol },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as any };
}

const valido = () => ({
  rendimiento: 12,
  ingredientes: [
    { materia_prima_id: HARINA, cantidad: 1100, tolerancia_porcentaje: 2 },
    { materia_prima_id: SAL, cantidad: 20 },
    { producto_intermedio_id: INTER, cantidad: 300 },
  ],
});

describe('GET /formulaciones/:id (campos de versión)', () => {
  test('devuelve versión, estado, fechas e identificadores de los ingredientes', async () => {
    const r = await llamar('GET', `/formulaciones/${F_V2}`, 'administrador');
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ producto_id: PROD_PAN, version: 2, activa: true, vigente_desde: '2026-10-01', vigente_hasta: null });
    const harina = r.cuerpo.ingredientes.find((i: any) => i.materia_prima_id === HARINA);
    expect(harina.tolerancia_porcentaje).toBe(2);
  });

  test('una versión anterior también se puede consultar y muestra su cierre', async () => {
    const r = await llamar('GET', `/formulaciones/${F_V1}`, 'administrador');
    expect(r.cuerpo).toMatchObject({ version: 1, activa: false, vigente_hasta: '2026-10-01' });
  });

  test('el operario sigue sin ver costos', async () => {
    const r = await llamar('GET', `/formulaciones/${F_V2}`, 'operario');
    expect(r.cuerpo.costo_lote).toBeNull();
    expect(r.cuerpo.ingredientes[0].costo).toBeNull();
  });
});

describe('GET /formulaciones/:id/versiones', () => {
  test('lista las versiones del producto, de la más nueva a la más vieja', async () => {
    const r = await llamar('GET', `/formulaciones/${F_V1}/versiones`, 'administrador');
    expect(r.status).toBe(200);
    expect(r.cuerpo.producto).toBe('Pan');
    expect(r.cuerpo.versiones.map((v: any) => v.version)).toEqual([2, 1]);
    expect(r.cuerpo.versiones[0]).toMatchObject({ activa: true, ingredientes: 3, aprobado_por: 'Ana Administradora' });
    expect(r.cuerpo.versiones[0].costo_lote).toBeGreaterThan(0);
  });

  test('no mezcla versiones de otros productos', async () => {
    const r = await llamar('GET', `/formulaciones/${F_OTRO}/versiones`, 'administrador');
    expect(r.cuerpo.versiones).toHaveLength(1);
  });

  test('el operario no accede (403) y una formulación ajena no existe (404)', async () => {
    expect((await llamar('GET', `/formulaciones/${F_V2}/versiones`, 'operario')).status).toBe(403);
    expect((await llamar('GET', `/formulaciones/${F_AJENA}/versiones`, 'administrador')).status).toBe(404);
  });

  test('identificador no válido: 400', async () => {
    expect((await llamar('GET', '/formulaciones/xx/versiones', 'administrador')).status).toBe(400);
  });
});

describe('POST /formulaciones/:id/versiones', () => {
  test('crea la versión 3: cierra la vigente y deja una sola activa', async () => {
    const r = await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', valido());
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({ version: 3, version_anterior: 2 });

    const v2 = formulaciones.find((f) => f.id === F_V2)!;
    expect(v2.activa).toBe(false);
    expect(v2.vigente_hasta).toBeInstanceOf(Date);
    const activas = formulaciones.filter((f) => f.producto_id === PROD_PAN && f.activa);
    expect(activas).toHaveLength(1);
    expect(activas[0]).toMatchObject({ version: 3, aprobado_por: 'u1', rendimiento_esperado: 12, panaderia_id: PAN_A });
    // Primero se cierra, después se crea (la base permite una sola activa)
    expect(operaciones).toEqual(['cerrar', 'crear']);
  });

  test('las versiones anteriores no se modifican (cantidades intactas)', async () => {
    await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', valido());
    expect(formulaciones.find((f) => f.id === F_V1)!.detalle_formulacion[0].cantidad_estandar).toBe(900);
    expect(formulaciones.find((f) => f.id === F_V2)!.detalle_formulacion[0].cantidad_estandar).toBe(1000);
  });

  test('desde una versión vieja se puede restaurar su contenido como versión nueva', async () => {
    const r = await llamar('POST', `/formulaciones/${F_V1}/versiones`, 'administrador', {
      rendimiento: 10,
      ingredientes: [{ materia_prima_id: HARINA, cantidad: 900 }],
    });
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({ version: 3, version_anterior: 2 });
  });

  test('la unidad de cada ingrediente sale de la materia prima, no del cliente', async () => {
    const r = await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', {
      rendimiento: 10,
      ingredientes: [{ materia_prima_id: AZUCAR, cantidad: 500 }, { materia_prima_id: HARINA, cantidad: 1 }],
    });
    expect(r.status).toBe(201);
    const nueva = formulaciones.find((f) => f.version === 3)!;
    expect(nueva.detalle_formulacion.find((d: any) => d.materia_prima_id === AZUCAR).unidad_id).toBe(U_UND);
    expect(nueva.detalle_formulacion.find((d: any) => d.materia_prima_id === HARINA).unidad_id).toBe(U_G);
  });

  test('el cliente no puede enviar la unidad ni otros campos', async () => {
    const r = await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', {
      rendimiento: 10,
      ingredientes: [{ materia_prima_id: HARINA, cantidad: 5, unidad_id: U_UND }],
    });
    expect(r.status).toBe(400);
    expect((await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', { ...valido(), activa: false })).status).toBe(400);
    expect(operaciones).toEqual([]);
  });

  test('conserva un producto intermedio existente con su unidad', async () => {
    await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', valido());
    const nueva = formulaciones.find((f) => f.version === 3)!;
    const inter = nueva.detalle_formulacion.find((d: any) => d.producto_intermedio_id === INTER);
    expect(inter).toMatchObject({ unidad_id: U_UND, materia_prima_id: null, cantidad_estandar: 300 });
  });

  test('un intermedio inexistente no se puede sumar', async () => {
    const cuerpo = valido();
    cuerpo.ingredientes.push({ producto_intermedio_id: INTER_NUEVO, cantidad: 10 } as any);
    const r = await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', cuerpo);
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toContain('intermedio');
    expect(operaciones).toEqual([]);
  });

  test('sin cambios respecto a la vigente: 400 y no se escribe nada', async () => {
    const r = await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', {
      rendimiento: 10,
      ingredientes: [
        { materia_prima_id: SAL, cantidad: 20 },
        { producto_intermedio_id: INTER, cantidad: 300 },
        { materia_prima_id: HARINA, cantidad: 1000, tolerancia_porcentaje: 2 },
      ],
    });
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toContain('No hay cambios');
    expect(operaciones).toEqual([]);
    expect(formulaciones.filter((f) => f.producto_id === PROD_PAN)).toHaveLength(2);
  });

  test('materia prima inactiva o de otra panadería: 400 y no se escribe nada', async () => {
    for (const id of [INACTIVA, AJENA, '33333333-3333-4333-8333-333333333398']) {
      const r = await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', {
        rendimiento: 10,
        ingredientes: [{ materia_prima_id: id, cantidad: 5 }],
      });
      expect(r.status).toBe(400);
    }
    expect(operaciones).toEqual([]);
    expect(formulaciones.find((f) => f.id === F_V2)!.activa).toBe(true);
  });

  test('validaciones del cuerpo: 400 con la lista de errores', async () => {
    const r = await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', { rendimiento: 0, ingredientes: [] });
    expect(r.status).toBe(400);
    expect(r.cuerpo.errores.length).toBeGreaterThanOrEqual(2);
  });

  test('permisos: operario 403; formulación ajena 404; id inválido 400', async () => {
    expect((await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'operario', valido())).status).toBe(403);
    expect((await llamar('POST', `/formulaciones/${F_AJENA}/versiones`, 'administrador', valido())).status).toBe(404);
    expect((await llamar('POST', '/formulaciones/xx/versiones', 'administrador', valido())).status).toBe(400);
    expect(operaciones).toEqual([]);
  });

  test('el superadministrador también puede', async () => {
    expect((await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'superadministrador', valido())).status).toBe(201);
  });

  test('un producto sin versión activa recibe max+1 y no cierra nada', async () => {
    formulaciones.find((f) => f.id === F_V2)!.activa = false;
    const r = await llamar('POST', `/formulaciones/${F_V1}/versiones`, 'administrador', {
      rendimiento: 12,
      ingredientes: [{ materia_prima_id: HARINA, cantidad: 950 }],
    });
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({ version: 3, version_anterior: null });
    expect(operaciones).toEqual(['crear']);
  });

  test('cambio simultáneo (la vigente ya fue cerrada por otra persona): 409', async () => {
    fallarCierre = true;
    const r = await sinErroresEnConsola(() => llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', valido()));
    expect(r.status).toBe(409);
    // No se creó ninguna versión nueva sobre un estado que cambió
    expect(formulaciones.filter((f) => f.producto_id === PROD_PAN)).toHaveLength(2);
    expect(operaciones).toEqual(['cerrar']);
  });

  test('choque con la restricción única de la base: 409', async () => {
    fallarCreacion = 'unico';
    const r = await sinErroresEnConsola(() => llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', valido()));
    expect(r.status).toBe(409);
  });

  test('si la creación falla, la vigente no queda cerrada (transacción)', async () => {
    fallarCreacion = 'otro';
    const r = await sinErroresEnConsola(() => llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', valido()));
    expect(r.status).toBe(500);
    const v2 = formulaciones.find((f) => f.id === F_V2)!;
    expect(v2.activa).toBe(true);
    expect(v2.vigente_hasta).toBeNull();
  });
});

describe('POST /formulaciones (producto nuevo con su primera versión)', () => {
  const nuevo = () => ({
    nombre: 'Pan de yuca',
    rendimiento: 20,
    ingredientes: [
      { materia_prima_id: HARINA, cantidad: 1000 },
      { materia_prima_id: AZUCAR, cantidad: 100, tolerancia_porcentaje: 1.5 },
    ],
  });

  test('crea el producto y la versión 1 vigente, en ese orden', async () => {
    const r = await llamar('POST', '/formulaciones', 'administrador', nuevo());
    expect(r.status).toBe(201);
    expect(r.cuerpo.version).toBe(1);

    const producto = productos.find((p) => p.nombre === 'Pan de yuca' && p.panaderia_id === PAN_A)!;
    expect(producto).toMatchObject({ es_intermedio: false, unidad_produccion_id: U_UND, panaderia_id: PAN_A });
    const f = formulaciones.find((x) => x.producto_id === producto.id)!;
    expect(f).toMatchObject({ version: 1, activa: true, aprobado_por: 'u1', rendimiento_esperado: 20, panaderia_id: PAN_A });
    expect(r.cuerpo).toMatchObject({ id: f.id, producto_id: producto.id });
    expect(operaciones).toEqual(['crear-producto', 'crear']);
  });

  test('la unidad de cada ingrediente sale de la materia prima', async () => {
    await llamar('POST', '/formulaciones', 'administrador', nuevo());
    const f = formulaciones.find((x) => x.producto_id.startsWith('77777777'))!;
    expect(f.detalle_formulacion.find((d: any) => d.materia_prima_id === HARINA).unidad_id).toBe(U_G);
    expect(f.detalle_formulacion.find((d: any) => d.materia_prima_id === AZUCAR)).toMatchObject({
      unidad_id: U_UND,
      tolerancia_porcentaje: 1.5,
    });
  });

  test('el nombre repetido se rechaza sin distinguir mayúsculas, también contra inactivos', async () => {
    expect((await llamar('POST', '/formulaciones', 'administrador', { ...nuevo(), nombre: 'PAN' })).status).toBe(409);
    expect((await llamar('POST', '/formulaciones', 'administrador', { ...nuevo(), nombre: ' otro  viejo ' })).status).toBe(409);
    expect(operaciones).toEqual([]);
  });

  test('el mismo nombre en otra panadería no estorba', async () => {
    // "Pan de yuca" ya existe en la panadería B, pero esta es la A
    expect((await llamar('POST', '/formulaciones', 'administrador', nuevo())).status).toBe(201);
  });

  test('materia prima inactiva, inexistente o ajena: 400 sin escribir', async () => {
    for (const id of [INACTIVA, AJENA, '33333333-3333-4333-8333-333333333398']) {
      const r = await llamar('POST', '/formulaciones', 'administrador', {
        ...nuevo(),
        ingredientes: [{ materia_prima_id: id, cantidad: 5 }],
      });
      expect(r.status).toBe(400);
    }
    expect(operaciones).toEqual([]);
    expect(productos).toHaveLength(4);
  });

  test('no acepta la unidad ni un es_intermedio que no sea booleano', async () => {
    const casos = [
      { ...nuevo(), es_intermedio: 'si' },
      { ...nuevo(), unidad_produccion_id: U_G },
    ];
    for (const c of casos) expect((await llamar('POST', '/formulaciones', 'administrador', c)).status).toBe(400);
    expect(operaciones).toEqual([]);
  });

  test('operario 403; cuerpo inválido 400', async () => {
    expect((await llamar('POST', '/formulaciones', 'operario', nuevo())).status).toBe(403);
    const r = await llamar('POST', '/formulaciones', 'administrador', { nombre: '', rendimiento: 0, ingredientes: [] });
    expect(r.status).toBe(400);
    expect(r.cuerpo.errores.length).toBeGreaterThanOrEqual(3);
    expect(operaciones).toEqual([]);
  });

  test('si falla la formulación, el producto tampoco queda creado (transacción)', async () => {
    fallarCreacion = 'otro';
    const r = await sinErroresEnConsola(() => llamar('POST', '/formulaciones', 'administrador', nuevo()));
    expect(r.status).toBe(500);
    expect(productos).toHaveLength(4);
    expect(formulaciones).toHaveLength(5);
  });

  test('si falta la unidad un en el catálogo: 500 sin crear nada', async () => {
    unidadUnExiste = false;
    const r = await sinErroresEnConsola(() => llamar('POST', '/formulaciones', 'administrador', nuevo()));
    expect(r.status).toBe(500);
    expect(operaciones).toEqual([]);
  });

  test('un producto recién creado ya tiene historial con su versión 1', async () => {
    const creada = await llamar('POST', '/formulaciones', 'administrador', nuevo());
    const r = await llamar('GET', `/formulaciones/${creada.cuerpo.id}/versiones`, 'administrador');
    expect(r.cuerpo.versiones).toHaveLength(1);
    expect(r.cuerpo.versiones[0]).toMatchObject({ version: 1, activa: true, ingredientes: 2 });
  });
});

describe('GET /formulaciones (productos dados de baja)', () => {
  const nombres = (r: any) => r.cuerpo.map((x: any) => x.producto).sort();

  test('por defecto no muestra los productos inactivos', async () => {
    const r = await llamar('GET', '/formulaciones', 'administrador');
    expect(nombres(r)).toEqual(['Masa añadida', 'Pan']);
    expect(r.cuerpo[0]).toHaveProperty('producto_id');
    expect(r.cuerpo[0].producto_activo).toBe(true);
  });

  test('el administrador puede pedirlos con incluir_inactivos', async () => {
    const r = await llamar('GET', '/formulaciones?incluir_inactivos=true', 'administrador');
    expect(nombres(r)).toEqual(['Masa añadida', 'Otro viejo', 'Pan']);
    expect(r.cuerpo.find((x: any) => x.producto === 'Otro viejo').producto_activo).toBe(false);
  });

  test('el operario no puede verlos aunque lo pida', async () => {
    const r = await llamar('GET', '/formulaciones?incluir_inactivos=true', 'operario');
    expect(nombres(r)).toEqual(['Masa añadida', 'Pan']);
  });
});

describe('PATCH /formulaciones/:id/producto', () => {
  const ruta = (id: string) => `/formulaciones/${id}/producto`;

  test('da de baja un producto; sus versiones se conservan y sale de la lista', async () => {
    const r = await llamar('PATCH', ruta(F_V2), 'administrador', { activo: false });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ producto_id: PROD_PAN, producto: 'Pan', activo: false });
    expect(productos.find((p) => p.id === PROD_PAN)!.activo).toBe(false);
    expect(formulaciones.filter((f) => f.producto_id === PROD_PAN)).toHaveLength(2);
    const lista = await llamar('GET', '/formulaciones', 'administrador');
    expect(lista.cuerpo.map((x: any) => x.producto)).toEqual(['Masa añadida']);
  });

  test('reactiva un producto dado de baja', async () => {
    const r = await llamar('PATCH', ruta(F_OTRO), 'administrador', { activo: true });
    expect(r.status).toBe(200);
    expect(productos.find((p) => p.id === PROD_OTRO)!.activo).toBe(true);
    const lista = await llamar('GET', '/formulaciones', 'administrador');
    expect(lista.cuerpo.map((x: any) => x.producto)).toContain('Otro viejo');
  });

  test('no da de baja un intermedio que usa un producto vigente (409 con los nombres)', async () => {
    const r = await llamar('PATCH', ruta(F_INTER), 'administrador', { activo: false });
    expect(r.status).toBe(409);
    expect(r.cuerpo.productos).toEqual(['Pan']);
    expect(r.cuerpo.error).toContain('Pan');
    expect(productos.find((p) => p.id === INTER)!.activo).toBe(true);
  });

  test('sí lo da de baja si quien lo usa ya está inactivo', async () => {
    await llamar('PATCH', ruta(F_V2), 'administrador', { activo: false });
    const r = await llamar('PATCH', ruta(F_INTER), 'administrador', { activo: false });
    expect(r.status).toBe(200);
  });

  test('el 409 también aplica a un intermedio que usa un producto inactivo solo si ese producto está vigente', async () => {
    // Pan sigue activo: bloquea; al reactivar y dar de baja otra vez el orden no importa
    expect((await llamar('PATCH', ruta(F_INTER), 'administrador', { activo: false })).status).toBe(409);
  });

  test('permisos y validaciones', async () => {
    expect((await llamar('PATCH', ruta(F_V2), 'operario', { activo: false })).status).toBe(403);
    expect((await llamar('PATCH', ruta(F_AJENA), 'administrador', { activo: false })).status).toBe(404);
    expect((await llamar('PATCH', ruta('xx'), 'administrador', { activo: false })).status).toBe(400);
    expect((await llamar('PATCH', ruta(F_V2), 'administrador', { activo: 'no' })).status).toBe(400);
    expect((await llamar('PATCH', ruta(F_V2), 'administrador', { activo: false, nombre: 'x' })).status).toBe(400);
    expect((await llamar('PATCH', ruta(F_V2), 'administrador', {})).status).toBe(400);
    expect(productos.find((p) => p.id === PROD_PAN)!.activo).toBe(true);
  });
});

describe('costo con productos intermedios', () => {
  // Pan v2: harina 1000 g, sal 20 g y 300 g de «Masa añadida» (receta vigente: 500 g de harina). Cada gramo cuesta 2.
  // Masa: 300/500 x 500 g de harina = 300 g -> 600. Total: 2000 + 40 + 600 = 2640.
  const pan = (r: any) => r.cuerpo.find((x: any) => x.producto === 'Pan');

  test('el detalle reparte el costo del intermedio entre sus materias primas', async () => {
    const r = await llamar('GET', `/formulaciones/${F_V2}`, 'administrador');
    expect(r.cuerpo.costo_lote).toBe(2640);
    expect(r.cuerpo.costo_incompleto).toBe(false);
    const masa = r.cuerpo.ingredientes.find((i: any) => i.tipo === 'producto_intermedio');
    expect(masa.costo).toBe(600);
    expect(masa.costo_por_unidad).toBe(2);
  });

  test('la lista muestra el mismo costo y sin aviso de costo incompleto', async () => {
    const r = await llamar('GET', '/formulaciones', 'administrador');
    expect(pan(r).costo_lote).toBe(2640);
    expect(pan(r).costo_unidad).toBe(264);
    expect(pan(r).costo_incompleto).toBe(false);
  });

  test('si el intermedio no tiene receta, el costo queda incompleto y su línea sin costo', async () => {
    formulaciones = formulaciones.filter((f) => f.id !== F_INTER);
    const lista = await llamar('GET', '/formulaciones', 'administrador');
    expect(pan(lista).costo_incompleto).toBe(true);
    expect(pan(lista).costo_lote).toBe(2040); // solo harina y sal
    const det = await llamar('GET', `/formulaciones/${F_V2}`, 'administrador');
    const masa = det.cuerpo.ingredientes.find((i: any) => i.tipo === 'producto_intermedio');
    expect(masa.costo).toBeNull();
    expect(masa.costo_por_unidad).toBeNull();
  });

  test('un intermedio dado de baja sigue costeando a quien lo usa', async () => {
    productos.find((p) => p.id === INTER)!.activo = false;
    const det = await llamar('GET', `/formulaciones/${F_V2}`, 'administrador');
    expect(det.cuerpo.costo_lote).toBe(2640);
    expect(det.cuerpo.costo_incompleto).toBe(false);
  });

  test('si la receta del intermedio tiene varias materias primas, el peso del lote cuenta sus gramos', async () => {
    formulaciones.find((f) => f.id === F_INTER)!.detalle_formulacion = [linea(HARINA, 500), linea(SAL, 500)];
    // Masa de 1000 g (500 harina + 500 sal): 300 g = 150 + 150 -> 600 con el mismo precio por gramo
    const det = await llamar('GET', `/formulaciones/${F_V2}`, 'administrador');
    expect(det.cuerpo.costo_lote).toBe(2000 + 40 + 600);
    expect(det.cuerpo.peso_lote_g).toBe(1320);
  });

  test('el historial costea cada versión con los intermedios repartidos', async () => {
    const r = await llamar('GET', `/formulaciones/${F_V1}/versiones`, 'administrador');
    const v = (n: number) => r.cuerpo.versiones.find((x: any) => x.version === n);
    expect(v(2).costo_lote).toBe(2640);
    expect(v(2).costo_incompleto).toBe(false);
    expect(v(1).costo_lote).toBe(1800); // 900 g de harina
  });

  test('el operario no ve costos de intermedios', async () => {
    const det = await llamar('GET', `/formulaciones/${F_V2}`, 'operario');
    const masa = det.cuerpo.ingredientes.find((i: any) => i.tipo === 'producto_intermedio');
    expect(masa.costo).toBeNull();
    expect(masa.costo_por_unidad).toBeNull();
    expect(det.cuerpo.costo_lote).toBeNull();
  });
});

describe('productos intermedios: crearlos y usarlos como ingrediente', () => {
  const INTER2 = '44444444-4444-4444-8444-444444444443'; // galleta, con receta
  const INTER_SIN = '44444444-4444-4444-8444-444444444444'; // sin receta
  const INTER_BAJA = '44444444-4444-4444-8444-444444444445'; // dado de baja, con receta
  const INTER_AJENO = '44444444-4444-4444-8444-444444444446'; // de otra panadería
  const F_INTER2 = '66666666-6666-4666-8666-666666666666';
  const F_BAJA = '66666666-6666-4666-8666-666666666667';
  const F_AJENO = '66666666-6666-4666-8666-666666666668';

  beforeEach(() => {
    productos.push(
      { id: INTER2, panaderia_id: PAN_A, nombre: 'Galleta', es_intermedio: true, activo: true },
      { id: INTER_SIN, panaderia_id: PAN_A, nombre: 'Relleno sin receta', es_intermedio: true, activo: true },
      { id: INTER_BAJA, panaderia_id: PAN_A, nombre: 'Masa vieja', es_intermedio: true, activo: false },
      { id: INTER_AJENO, panaderia_id: PAN_B, nombre: 'Masa ajena', es_intermedio: true, activo: true },
    );
    const receta = (id: string, producto: string, panaderia: string, lineas: Fila[]) => ({
      id, panaderia_id: panaderia, producto_id: producto, version: 1, activa: true,
      vigente_desde: new Date('2026-10-01'), vigente_hasta: null, rendimiento_esperado: 1, aprobado_por: null,
      detalle_formulacion: lineas,
    });
    formulaciones.push(
      receta(F_INTER2, INTER2, PAN_A, [linea(HARINA, 300)]),
      receta(F_BAJA, INTER_BAJA, PAN_A, [linea(HARINA, 200)]),
      receta(F_AJENO, INTER_AJENO, PAN_B, [linea(AJENA, 200)]),
    );
  });

  const nuevoConIntermedio = (id: string) => ({
    nombre: 'Concha de prueba',
    rendimiento: 10,
    ingredientes: [{ materia_prima_id: HARINA, cantidad: 800 }, { producto_intermedio_id: id, cantidad: 150 }],
  });
  const NO_VALIDO = 'no existe, está dado de baja o no pertenece';
  const invalidos = () => [
    [INTER_SIN, 'sin receta', 'todavía no tiene receta'],
    [INTER_BAJA, 'dado de baja', NO_VALIDO],
    [INTER_AJENO, 'de otra panadería', NO_VALIDO],
    [PROD_PAN, 'que no es intermedio', NO_VALIDO],
    [INTER_NUEVO, 'inexistente', NO_VALIDO],
  ] as const;

  test('POST /: crea un producto intermedio con su primera versión', async () => {
    const r = await llamar('POST', '/formulaciones', 'administrador', {
      nombre: 'Masa base', es_intermedio: true, rendimiento: 1, ingredientes: [{ materia_prima_id: HARINA, cantidad: 6000 }],
    });
    expect(r.status).toBe(201);
    const p = productos.find((x) => x.nombre === 'Masa base')!;
    expect(p).toMatchObject({ es_intermedio: true, unidad_produccion_id: U_UND, panaderia_id: PAN_A });
    expect(formulaciones.find((f) => f.producto_id === p.id)).toMatchObject({ version: 1, activa: true });
  });

  test('POST /: sin es_intermedio el producto es final', async () => {
    await llamar('POST', '/formulaciones', 'administrador', { ...nuevoConIntermedio(INTER2), nombre: 'Final' });
    expect(productos.find((x) => x.nombre === 'Final')!.es_intermedio).toBe(false);
  });

  test('POST /: un producto nuevo puede llevar un intermedio como ingrediente, en gramos', async () => {
    const r = await llamar('POST', '/formulaciones', 'administrador', nuevoConIntermedio(INTER2));
    expect(r.status).toBe(201);
    const f = formulaciones.find((x) => x.producto_id === r.cuerpo.producto_id)!;
    const l = f.detalle_formulacion.find((d: any) => d.producto_intermedio_id === INTER2);
    expect(l).toMatchObject({ materia_prima_id: null, cantidad_estandar: 150, unidad_id: U_G });
    expect(f.detalle_formulacion.find((d: any) => d.materia_prima_id === HARINA)).toMatchObject({ producto_intermedio_id: null, unidad_id: U_G });
  });

  test('POST /: un intermedio puede llevar otro intermedio', async () => {
    const r = await llamar('POST', '/formulaciones', 'administrador', { ...nuevoConIntermedio(INTER2), nombre: 'Masa con galleta', es_intermedio: true });
    expect(r.status).toBe(201);
    expect(productos.find((x) => x.nombre === 'Masa con galleta')!.es_intermedio).toBe(true);
  });

  test('POST /: rechaza intermedios sin receta, dados de baja, ajenos, que no lo son o inexistentes', async () => {
    for (const [id, motivo, mensaje] of invalidos()) {
      const antes = productos.length;
      const r = await llamar('POST', '/formulaciones', 'administrador', nuevoConIntermedio(id));
      expect([motivo, r.status]).toEqual([motivo, 400]);
      expect([motivo, String(r.cuerpo.error).includes(mensaje)]).toEqual([motivo, true]);
      expect(productos).toHaveLength(antes);
    }
    expect(operaciones).toEqual([]);
  });

  test('POST /: el mensaje de un intermedio sin receta nombra el producto', async () => {
    const r = await llamar('POST', '/formulaciones', 'administrador', nuevoConIntermedio(INTER_SIN));
    expect(r.cuerpo.error).toContain('Relleno sin receta');
    expect(r.cuerpo.error).toContain('receta');
  });

  test('POST /: si falta la unidad de gramos responde 500 y no crea nada', async () => {
    unidadGExiste = false;
    const antes = productos.length;
    const r = await llamar('POST', '/formulaciones', 'administrador', nuevoConIntermedio(INTER2));
    expect(r.status).toBe(500);
    expect(productos).toHaveLength(antes);
    expect(operaciones).toEqual([]);
  });

  test('POST /: sin intermedios no hace falta la unidad de gramos', async () => {
    unidadGExiste = false;
    const r = await llamar('POST', '/formulaciones', 'administrador', {
      nombre: 'Solo harina', rendimiento: 5, ingredientes: [{ materia_prima_id: HARINA, cantidad: 100 }],
    });
    expect(r.status).toBe(201);
  });

  test('versiones: suma un intermedio nuevo en gramos y conserva la unidad del que ya tenía', async () => {
    const cuerpo = valido();
    cuerpo.ingredientes.push({ producto_intermedio_id: INTER2, cantidad: 80 } as any);
    const r = await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', cuerpo);
    expect(r.status).toBe(201);
    const nueva = formulaciones.find((f) => f.producto_id === PROD_PAN && f.version === 3)!;
    expect(nueva.detalle_formulacion.find((d: any) => d.producto_intermedio_id === INTER2)).toMatchObject({ unidad_id: U_G, cantidad_estandar: 80 });
    expect(nueva.detalle_formulacion.find((d: any) => d.producto_intermedio_id === INTER)).toMatchObject({ unidad_id: U_UND });
  });

  test('versiones: rechaza intermedios nuevos inválidos sin tocar nada', async () => {
    for (const [id, motivo, mensaje] of invalidos()) {
      const cuerpo = valido();
      cuerpo.ingredientes.push({ producto_intermedio_id: id, cantidad: 10 } as any);
      const r = await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', cuerpo);
      expect([motivo, r.status]).toEqual([motivo, 400]);
      expect([motivo, String(r.cuerpo.error).includes(mensaje)]).toEqual([motivo, true]);
    }
    expect(operaciones).toEqual([]);
    expect(formulaciones.find((f) => f.id === F_V2)!.activa).toBe(true);
  });

  test('versiones: un intermedio dado de baja que la formulación ya tenía se puede conservar', async () => {
    productos.find((p) => p.id === INTER)!.activo = false;
    const r = await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', valido());
    expect(r.status).toBe(201);
  });

  test('versiones: un intermedio no puede usarse a sí mismo', async () => {
    const r = await llamar('POST', `/formulaciones/${F_INTER}/versiones`, 'administrador', {
      rendimiento: 1, ingredientes: [{ materia_prima_id: HARINA, cantidad: 500 }, { producto_intermedio_id: INTER, cantidad: 10 }],
    });
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toContain('sí mismo');
    expect(operaciones).toEqual([]);
  });

  test('versiones: ciclo indirecto (la masa usaría la galleta y la galleta ya usa la masa)', async () => {
    formulaciones.find((f) => f.id === F_INTER2)!.detalle_formulacion.push(linea(null, 100, { producto_intermedio_id: INTER, unidad_id: U_G }));
    const r = await llamar('POST', `/formulaciones/${F_INTER}/versiones`, 'administrador', {
      rendimiento: 1, ingredientes: [{ materia_prima_id: HARINA, cantidad: 500 }, { producto_intermedio_id: INTER2, cantidad: 10 }],
    });
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toContain('sí mismo');
    expect(operaciones).toEqual([]);
  });

  test('versiones: una cadena sin vueltas es válida (masa usa galleta, galleta solo harina)', async () => {
    const r = await llamar('POST', `/formulaciones/${F_INTER}/versiones`, 'administrador', {
      rendimiento: 1, ingredientes: [{ materia_prima_id: HARINA, cantidad: 500 }, { producto_intermedio_id: INTER2, cantidad: 10 }],
    });
    expect(r.status).toBe(201);
  });

  test('versiones: un producto que usa dos intermedios donde uno usa al otro no es ciclo', async () => {
    formulaciones.find((f) => f.id === F_INTER)!.detalle_formulacion.push(linea(null, 50, { producto_intermedio_id: INTER2, unidad_id: U_G }));
    const cuerpo = valido();
    cuerpo.ingredientes.push({ producto_intermedio_id: INTER2, cantidad: 80 } as any);
    expect((await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', cuerpo)).status).toBe(201);
  });

  test('versiones: la unidad de gramos solo hace falta si se suma un intermedio nuevo', async () => {
    unidadGExiste = false;
    expect((await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', valido())).status).toBe(201);
    const cuerpo = valido();
    cuerpo.ingredientes.push({ producto_intermedio_id: INTER2, cantidad: 80 } as any);
    cuerpo.rendimiento = 13;
    const antes = formulaciones.length;
    const r = await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'administrador', cuerpo);
    expect(r.status).toBe(500);
    expect(formulaciones).toHaveLength(antes);
  });

  test('el operario no puede crear ni versionar', async () => {
    expect((await llamar('POST', '/formulaciones', 'operario', nuevoConIntermedio(INTER2))).status).toBe(403);
    const cuerpo = valido();
    cuerpo.ingredientes.push({ producto_intermedio_id: INTER2, cantidad: 80 } as any);
    expect((await llamar('POST', `/formulaciones/${F_V2}/versiones`, 'operario', cuerpo)).status).toBe(403);
  });
});
