import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterProveedores } from '../src/routes/proveedores';
import { sinErroresEnConsola } from './helpers';

const PAN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GRUPO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ID_PROPIO = '55555555-5555-4555-8555-555555555551';
const ID_GRUPO = '55555555-5555-4555-8555-555555555552';
const ID_AJENO = '55555555-5555-4555-8555-555555555599';

type Fila = Record<string, any>;
let proveedores: Fila[];
let ofertas: { proveedor_id: string; vigente: boolean }[];
let creados: Fila[];
let grupoDePanaderiaA: string | null;

// Evalúa el filtro de alcance que arma el router: OR de panaderia_id / grupo_id
const enAlcance = (p: Fila, where: any) =>
  !where.OR || where.OR.some((c: any) => (c.panaderia_id && p.panaderia_id === c.panaderia_id) || (c.grupo_id && p.grupo_id === c.grupo_id));

const prismaFalso: any = {
  panaderia: { findUnique: async () => ({ grupo_id: grupoDePanaderiaA }) },
  presentacion_proveedor: {
    count: async ({ where }: any) => ofertas.filter((o) => o.proveedor_id === where.proveedor_id && o.vigente === where.vigente).length,
  },
  proveedor: {
    findMany: async ({ where }: any) =>
      proveedores
        .filter((p) => enAlcance(p, where))
        .map((p) => ({ ...p, _count: { presentacion_proveedor: ofertas.filter((o) => o.proveedor_id === p.id && o.vigente).length } })),
    findFirst: async ({ where }: any) =>
      proveedores.find((p) => {
        if (!enAlcance(p, where)) return false;
        if (typeof where.id === 'string' && p.id !== where.id) return false;
        if (where.id?.not && p.id === where.id.not) return false;
        if (where.nombre && p.nombre.toLowerCase() !== String(where.nombre.equals).toLowerCase()) return false;
        return true;
      }) ?? null,
    create: async ({ data }: any) => {
      const fila = { id: 'nuevo-id', activo: true, grupo_id: null, ...data };
      creados.push(fila);
      proveedores.push(fila);
      return fila;
    },
    update: async ({ where, data }: any) => {
      const fila = proveedores.find((p) => p.id === where.id)!;
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
  app.use((req, _res, next) => {
    (req as any).usuario = { id: 'u1', email: 'x@x.com', rol: String(req.headers['x-rol']) };
    (req as any).panaderiaId = PAN_A;
    next();
  });
  app.use('/proveedores', crearRouterProveedores(prismaFalso));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => {
  servidor.close();
});

beforeEach(() => {
  grupoDePanaderiaA = null;
  creados = [];
  ofertas = [
    { proveedor_id: ID_PROPIO, vigente: true },
    { proveedor_id: ID_PROPIO, vigente: true },
    { proveedor_id: ID_PROPIO, vigente: false },
  ];
  proveedores = [
    { id: ID_PROPIO, panaderia_id: PAN_A, grupo_id: null, nombre: 'Proveedor general', contacto: null, telefono: null, direccion: null, activo: true },
    { id: ID_GRUPO, panaderia_id: null, grupo_id: GRUPO, nombre: 'Distribuidora del grupo', contacto: null, telefono: null, direccion: null, activo: true },
    { id: ID_AJENO, panaderia_id: PAN_B, grupo_id: null, nombre: 'Molino de otra panadería', contacto: null, telefono: null, direccion: null, activo: true },
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

describe('GET /proveedores', () => {
  test('el operario no tiene acceso', async () => {
    expect((await llamar('GET', '/proveedores', 'operario')).status).toBe(403);
  });

  test('sin grupo solo ve los de su panadería, con el conteo de ofertas vigentes', async () => {
    const r = await llamar('GET', '/proveedores', 'administrador');
    expect(r.cuerpo.map((p: any) => p.nombre)).toEqual(['Proveedor general']);
    expect(r.cuerpo[0].ofertas_vigentes).toBe(2);
    expect(r.cuerpo[0].alcance).toBe('panaderia');
  });

  test('con grupo ve además los compartidos del grupo, pero nunca los de otra panadería', async () => {
    grupoDePanaderiaA = GRUPO;
    const r = await llamar('GET', '/proveedores', 'administrador');
    expect(r.cuerpo.map((p: any) => p.nombre).sort()).toEqual(['Distribuidora del grupo', 'Proveedor general']);
    expect(r.cuerpo.find((p: any) => p.nombre === 'Distribuidora del grupo').alcance).toBe('grupo');
  });
});

describe('POST /proveedores', () => {
  test('el operario no puede crear', async () => {
    expect((await llamar('POST', '/proveedores', 'operario', { nombre: 'Nuevo' })).status).toBe(403);
    expect(creados).toHaveLength(0);
  });

  test('crea siempre en la panadería del token e ignora panaderia_id y grupo_id del cuerpo', async () => {
    const r = await llamar('POST', '/proveedores', 'administrador', { nombre: 'Lácteos Nariño', telefono: '3001234567', panaderia_id: PAN_B, grupo_id: GRUPO });
    expect(r.status).toBe(201);
    expect(creados[0].panaderia_id).toBe(PAN_A);
    expect(creados[0].grupo_id).toBeNull();
    expect(creados[0].telefono).toBe('3001234567');
  });

  test('datos inválidos dan 400 y no crean nada', async () => {
    const r = await llamar('POST', '/proveedores', 'administrador', { nombre: '', telefono: 'abc' });
    expect(r.status).toBe(400);
    expect(r.cuerpo.errores.length).toBeGreaterThanOrEqual(2);
    expect(creados).toHaveLength(0);
  });

  test('un nombre repetido (sin importar mayúsculas) da 409, también contra los del grupo', async () => {
    expect((await llamar('POST', '/proveedores', 'administrador', { nombre: 'PROVEEDOR GENERAL' })).status).toBe(409);
    grupoDePanaderiaA = GRUPO;
    expect((await llamar('POST', '/proveedores', 'administrador', { nombre: 'distribuidora del grupo' })).status).toBe(409);
  });

  test('el nombre de un proveedor de otra panadería no cuenta como repetido', async () => {
    expect((await llamar('POST', '/proveedores', 'administrador', { nombre: 'Molino de otra panadería' })).status).toBe(201);
  });

  test('un fallo inesperado responde 500 sin filtrar detalles', async () => {
    const original = prismaFalso.proveedor.create;
    prismaFalso.proveedor.create = async () => {
      throw new Error('detalle interno secreto');
    };
    const r = await sinErroresEnConsola(() => llamar('POST', '/proveedores', 'administrador', { nombre: 'Otro' }));
    prismaFalso.proveedor.create = original;
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.cuerpo)).not.toContain('secreto');
  });
});

describe('PATCH /proveedores/:id', () => {
  test('el operario no puede editar', async () => {
    expect((await llamar('PATCH', `/proveedores/${ID_PROPIO}`, 'operario', { nombre: 'Cambiado' })).status).toBe(403);
    expect(proveedores[0].nombre).toBe('Proveedor general');
  });

  test('edita los campos permitidos', async () => {
    const r = await llamar('PATCH', `/proveedores/${ID_PROPIO}`, 'administrador', { contacto: 'Doña Marta', telefono: '3109998877' });
    expect(r.status).toBe(200);
    expect(proveedores[0].contacto).toBe('Doña Marta');
  });

  test('no se pueden cambiar panaderia_id ni grupo_id', async () => {
    const r = await llamar('PATCH', `/proveedores/${ID_PROPIO}`, 'administrador', { panaderia_id: PAN_B });
    expect(r.status).toBe(400);
    expect(proveedores[0].panaderia_id).toBe(PAN_A);
  });

  test('un proveedor de otra panadería responde 404 y no se toca', async () => {
    const r = await llamar('PATCH', `/proveedores/${ID_AJENO}`, 'administrador', { nombre: 'Robado' });
    expect(r.status).toBe(404);
    expect(proveedores[2].nombre).toBe('Molino de otra panadería');
  });

  test('un proveedor compartido del grupo se ve pero no se modifica desde aquí (403)', async () => {
    grupoDePanaderiaA = GRUPO;
    const r = await llamar('PATCH', `/proveedores/${ID_GRUPO}`, 'administrador', { nombre: 'Cambiado' });
    expect(r.status).toBe(403);
    expect(proveedores[1].nombre).toBe('Distribuidora del grupo');
  });

  test('si la panadería no pertenece al grupo, el proveedor del grupo ni siquiera se encuentra (404)', async () => {
    expect((await llamar('PATCH', `/proveedores/${ID_GRUPO}`, 'administrador', { nombre: 'Cambiado' })).status).toBe(404);
  });

  test('identificador mal formado da 400', async () => {
    expect((await llamar('PATCH', '/proveedores/abc', 'administrador', { nombre: 'Otro' })).status).toBe(400);
  });

  test('no permite repetir el nombre de otro proveedor, pero sí conservar el propio', async () => {
    grupoDePanaderiaA = GRUPO;
    expect((await llamar('PATCH', `/proveedores/${ID_PROPIO}`, 'administrador', { nombre: 'distribuidora del grupo' })).status).toBe(409);
    expect((await llamar('PATCH', `/proveedores/${ID_PROPIO}`, 'administrador', { nombre: 'proveedor general' })).status).toBe(200);
  });

  test('al desactivar avisa cuántas ofertas vigentes dejan de contar', async () => {
    const r = await llamar('PATCH', `/proveedores/${ID_PROPIO}`, 'administrador', { activo: false });
    expect(r.status).toBe(200);
    expect(r.cuerpo.activo).toBe(false);
    expect(r.cuerpo.ofertas_afectadas).toBe(2);
  });

  test('al reactivar no calcula ofertas afectadas', async () => {
    proveedores[0].activo = false;
    const r = await llamar('PATCH', `/proveedores/${ID_PROPIO}`, 'administrador', { activo: true });
    expect(r.status).toBe(200);
    expect(r.cuerpo.ofertas_afectadas).toBeUndefined();
    expect(proveedores[0].activo).toBe(true);
  });
});
