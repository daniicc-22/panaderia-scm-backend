import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterMateriasPrimas } from '../src/routes/materiasPrimas';
import { sinErroresEnConsola } from './helpers';

const PAN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNIDAD_G = '11111111-1111-4111-8111-111111111111';
const CAT = '22222222-2222-4222-8222-222222222222';
const ID_HARINA = '33333333-3333-4333-8333-333333333331';
const ID_SAL = '33333333-3333-4333-8333-333333333332';
const ID_AJENA = '33333333-3333-4333-8333-333333333399';

type Fila = Record<string, any>;
let materias: Fila[];
let usos: { materia: string; panaderia: string; producto: string; activa: boolean }[];
let creadas: Fila[];
let fallarCreacionConUnico = false;

const coincideNombre = (filtro: any, valor: string) =>
  !filtro || valor.toLowerCase() === String(filtro.equals).toLowerCase();

// Base de datos simulada con lo mínimo que usa el router
const prismaFalso: any = {
  unidad_medida: {
    findUnique: async ({ where }: any) => (where.id === UNIDAD_G ? { id: UNIDAD_G, codigo: 'g' } : null),
    findMany: async () => [{ id: UNIDAD_G, codigo: 'g', nombre: 'gramo', tipo: 'masa' }],
  },
  categoria_materia_prima: {
    findUnique: async ({ where }: any) => (where.id === CAT ? { id: CAT } : null),
    findMany: async () => [{ id: CAT, nombre: 'Harinas' }],
  },
  detalle_formulacion: {
    findMany: async ({ where }: any) =>
      usos
        .filter(
          (u) =>
            u.materia === where.materia_prima_id &&
            u.panaderia === where.formulacion.panaderia_id &&
            u.activa === where.formulacion.activa,
        )
        .map((u) => ({ formulacion: { producto: { nombre: u.producto } } })),
  },
  materia_prima: {
    findMany: async ({ where }: any) =>
      materias
        .filter((m) => m.panaderia_id === where.panaderia_id && (where.activa === undefined || m.activa === where.activa))
        .map((m) => ({
          ...m,
          categoria_materia_prima: null,
          unidad_medida: { codigo: 'g' },
          presentacion: [{ id: 'p1', nombre: 'Bulto 25 kg', contenido: 25000, presentacion_proveedor: [{ id: 'o1', precio_referencia: 100000, vigente: true, proveedor: { activo: true } }] }],
        })),
    findFirst: async ({ where }: any) =>
      materias.find((m) => {
        if (where.panaderia_id && m.panaderia_id !== where.panaderia_id) return false;
        if (typeof where.id === 'string' && m.id !== where.id) return false;
        if (where.id?.not && m.id === where.id.not) return false;
        return coincideNombre(where.nombre, m.nombre);
      }) ?? null,
    create: async ({ data }: any) => {
      if (fallarCreacionConUnico) throw Object.assign(new Error('unico'), { code: 'P2002' });
      const fila = { id: 'nuevo-id', activa: true, ...data };
      creadas.push(fila);
      materias.push(fila);
      return fila;
    },
    update: async ({ where, data }: any) => {
      const fila = materias.find((m) => m.id === where.id)!;
      Object.assign(fila, data);
      return fila;
    },
  },
};

let servidor: ReturnType<express.Application['listen']>;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  // Simula verificarToken + resolverPanaderia: el rol y la panadería vienen de cabeceras de la prueba
  app.use((req, _res, next) => {
    (req as any).usuario = { id: 'u1', email: 'x@x.com', rol: String(req.headers['x-rol']) };
    (req as any).panaderiaId = PAN_A;
    next();
  });
  app.use('/materias-primas', crearRouterMateriasPrimas(prismaFalso));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => {
  servidor.close();
});

beforeEach(() => {
  fallarCreacionConUnico = false;
  creadas = [];
  usos = [];
  materias = [
    { id: ID_HARINA, panaderia_id: PAN_A, codigo: 'MP-001', nombre: 'Harina de trigo', activa: true, categoria_id: null, unidad_base_id: UNIDAD_G, criterio_rotacion: null, lead_time_dias: null, variabilidad_peso_unitario: null },
    { id: ID_SAL, panaderia_id: PAN_A, codigo: 'MP-041', nombre: 'Sal', activa: false, categoria_id: null, unidad_base_id: UNIDAD_G, criterio_rotacion: null, lead_time_dias: null, variabilidad_peso_unitario: null },
    { id: ID_AJENA, panaderia_id: PAN_B, codigo: 'MP-001', nombre: 'Azúcar', activa: true, categoria_id: null, unidad_base_id: UNIDAD_G, criterio_rotacion: null, lead_time_dias: null, variabilidad_peso_unitario: null },
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

describe('GET /materias-primas', () => {
  test('el administrador ve precios; el operario recibe null', async () => {
    const admin = await llamar('GET', '/materias-primas', 'administrador');
    const operario = await llamar('GET', '/materias-primas', 'operario');
    expect(admin.cuerpo[0].presentaciones[0].precio).toBe(100000);
    expect(operario.cuerpo[0].presentaciones[0].precio).toBeNull();
    expect(operario.cuerpo[0].presentaciones[0].costo_por_unidad_base).toBeNull();
  });

  test('solo lista las de su panadería y activas por defecto', async () => {
    const r = await llamar('GET', '/materias-primas', 'administrador');
    expect(r.cuerpo.map((m: any) => m.codigo)).toEqual(['MP-001']);
  });

  test('el administrador puede pedir las inactivas; el operario no', async () => {
    const admin = await llamar('GET', '/materias-primas?incluir_inactivas=true', 'administrador');
    const operario = await llamar('GET', '/materias-primas?incluir_inactivas=true', 'operario');
    expect(admin.cuerpo.map((m: any) => m.codigo)).toEqual(['MP-001', 'MP-041']);
    expect(operario.cuerpo.map((m: any) => m.codigo)).toEqual(['MP-001']);
  });
});

describe('GET /materias-primas/catalogos', () => {
  test('lo ve el administrador y no el operario', async () => {
    expect((await llamar('GET', '/materias-primas/catalogos', 'administrador')).cuerpo.unidades).toHaveLength(1);
    expect((await llamar('GET', '/materias-primas/catalogos', 'operario')).status).toBe(403);
  });
});

describe('POST /materias-primas', () => {
  const valido = { nombre: 'Harina integral', unidad_base_id: UNIDAD_G, categoria_id: CAT, criterio_rotacion: 'FEFO', lead_time_dias: 3 };

  test('el operario no puede crear', async () => {
    const r = await llamar('POST', '/materias-primas', 'operario', valido);
    expect(r.status).toBe(403);
    expect(creadas).toHaveLength(0);
  });

  test('crea con código generado y siempre en la panadería del token', async () => {
    const r = await llamar('POST', '/materias-primas', 'administrador', { ...valido, panaderia_id: PAN_B, codigo: 'MP-777' });
    expect(r.status).toBe(201);
    expect(r.cuerpo.codigo).toBe('MP-042');
    expect(creadas[0].panaderia_id).toBe(PAN_A);
    expect(creadas[0].codigo).toBe('MP-042');
  });

  test('el código se calcula solo con las materias de su panadería', async () => {
    materias = materias.filter((m) => m.panaderia_id === PAN_B);
    const r = await llamar('POST', '/materias-primas', 'administrador', valido);
    expect(r.cuerpo.codigo).toBe('MP-001');
  });

  test('rechaza datos inválidos con 400 y mensajes', async () => {
    const r = await llamar('POST', '/materias-primas', 'administrador', { nombre: '', unidad_base_id: 'x' });
    expect(r.status).toBe(400);
    expect(r.cuerpo.errores.length).toBeGreaterThanOrEqual(2);
    expect(creadas).toHaveLength(0);
  });

  test('unidad o categoría inexistentes dan 400', async () => {
    const otraUnidad = '44444444-4444-4444-8444-444444444444';
    expect((await llamar('POST', '/materias-primas', 'administrador', { ...valido, unidad_base_id: otraUnidad })).status).toBe(400);
    expect((await llamar('POST', '/materias-primas', 'administrador', { ...valido, categoria_id: otraUnidad })).status).toBe(400);
  });

  test('el nombre repetido (sin importar mayúsculas) da 409; el de otra panadería no cuenta', async () => {
    expect((await llamar('POST', '/materias-primas', 'administrador', { ...valido, nombre: 'HARINA DE TRIGO' })).status).toBe(409);
    expect((await llamar('POST', '/materias-primas', 'administrador', { ...valido, nombre: 'Azúcar' })).status).toBe(201);
  });

  test('si dos usuarios crean a la vez y la base lo detecta, responde 409', async () => {
    fallarCreacionConUnico = true;
    const r = await llamar('POST', '/materias-primas', 'administrador', valido);
    expect(r.status).toBe(409);
  });

  test('un fallo inesperado responde 500 sin filtrar detalles', async () => {
    const original = prismaFalso.materia_prima.create;
    prismaFalso.materia_prima.create = async () => {
      throw new Error('detalle interno secreto');
    };
    const r = await sinErroresEnConsola(() => llamar('POST', '/materias-primas', 'administrador', valido));
    prismaFalso.materia_prima.create = original;
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.cuerpo)).not.toContain('secreto');
  });
});

describe('PATCH /materias-primas/:id', () => {
  test('el operario no puede editar', async () => {
    expect((await llamar('PATCH', `/materias-primas/${ID_HARINA}`, 'operario', { nombre: 'X1' })).status).toBe(403);
    expect(materias[0].nombre).toBe('Harina de trigo');
  });

  test('edita los campos permitidos', async () => {
    const r = await llamar('PATCH', `/materias-primas/${ID_HARINA}`, 'administrador', { nombre: 'Harina 000', lead_time_dias: 2 });
    expect(r.status).toBe(200);
    expect(materias[0].nombre).toBe('Harina 000');
    expect(materias[0].lead_time_dias).toBe(2);
  });

  test('no permite cambiar código ni unidad base', async () => {
    const r = await llamar('PATCH', `/materias-primas/${ID_HARINA}`, 'administrador', { codigo: 'MP-500' });
    expect(r.status).toBe(400);
    expect(materias[0].codigo).toBe('MP-001');
  });

  test('una materia prima de otra panadería responde 404 y no se toca', async () => {
    const r = await llamar('PATCH', `/materias-primas/${ID_AJENA}`, 'administrador', { nombre: 'Robada' });
    expect(r.status).toBe(404);
    expect(materias[2].nombre).toBe('Azúcar');
  });

  test('un identificador mal formado da 400', async () => {
    expect((await llamar('PATCH', '/materias-primas/abc', 'administrador', { nombre: 'Otro' })).status).toBe(400);
  });

  test('no permite repetir el nombre de otra materia prima propia', async () => {
    expect((await llamar('PATCH', `/materias-primas/${ID_HARINA}`, 'administrador', { nombre: 'sal' })).status).toBe(409);
  });

  test('guardar su mismo nombre no cuenta como repetido', async () => {
    expect((await llamar('PATCH', `/materias-primas/${ID_HARINA}`, 'administrador', { nombre: 'harina de trigo' })).status).toBe(200);
  });

  test('no se desactiva si la usa una formulación activa, y se nombran los productos', async () => {
    usos = [
      { materia: ID_HARINA, panaderia: PAN_A, producto: 'Pambaso', activa: true },
      { materia: ID_HARINA, panaderia: PAN_A, producto: 'Concha mexicana', activa: true },
      { materia: ID_HARINA, panaderia: PAN_A, producto: 'Fórmula vieja', activa: false },
    ];
    const r = await llamar('PATCH', `/materias-primas/${ID_HARINA}`, 'administrador', { activa: false });
    expect(r.status).toBe(409);
    expect(r.cuerpo.productos.sort()).toEqual(['Concha mexicana', 'Pambaso']);
    expect(materias[0].activa).toBe(true);
  });

  test('con muchos productos el mensaje se acorta pero la lista completa va aparte', async () => {
    usos = Array.from({ length: 12 }, (_, i) => ({ materia: ID_HARINA, panaderia: PAN_A, producto: `Pan ${i + 1}`, activa: true }));
    const r = await llamar('PATCH', `/materias-primas/${ID_HARINA}`, 'administrador', { activa: false });
    expect(r.status).toBe(409);
    expect(r.cuerpo.productos).toHaveLength(12);
    expect(r.cuerpo.error).toContain('y 7 más');
    expect(r.cuerpo.error).not.toContain('Pan 12');
  });

  test('se desactiva si solo la usan formulaciones inactivas', async () => {
    usos = [{ materia: ID_HARINA, panaderia: PAN_A, producto: 'Fórmula vieja', activa: false }];
    const r = await llamar('PATCH', `/materias-primas/${ID_HARINA}`, 'administrador', { activa: false });
    expect(r.status).toBe(200);
    expect(materias[0].activa).toBe(false);
  });

  test('se puede reactivar sin revisar formulaciones', async () => {
    usos = [{ materia: ID_SAL, panaderia: PAN_A, producto: 'Pambaso', activa: true }];
    const r = await llamar('PATCH', `/materias-primas/${ID_SAL}`, 'administrador', { activa: true });
    expect(r.status).toBe(200);
    expect(materias[1].activa).toBe(true);
  });
});
