import express from 'express';
import bcrypt from 'bcryptjs';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterUsuarios } from '../src/routes/usuarios';
import { sinErroresEnConsola } from './helpers';

const PAN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_ADMIN_A = '11111111-1111-4111-8111-111111111111';
const ID_OPER_A = '22222222-2222-4222-8222-222222222222';
const ID_OPER_B = '33333333-3333-4333-8333-333333333333';
const ID_ADMIN_B = '44444444-4444-4444-8444-444444444444';
const ID_INEXISTENTE = '99999999-9999-4999-8999-999999999999';
const CLAVE = 'Pan-de-maiz-26';

type Fila = Record<string, any>;
let usuarios: Fila[];
let errorUnicidadAlCrear: boolean;

const fila = (id: string, rol: string, nombre_usuario: string, panaderias: string[], extra: Fila = {}): Fila => ({
  id,
  nombre: `Usuario ${nombre_usuario}`,
  nombre_usuario,
  email: null,
  password_hash: 'hash-original',
  activo: true,
  debe_cambiar_password: false,
  rol: { codigo: rol },
  panaderias,
  ...extra,
});

const enPanaderia = (u: Fila, where: any) => {
  const id = where?.usuario_panaderia?.some?.panaderia_id;
  return id === undefined || u.panaderias.includes(id);
};
const publica = (u: Fila) => {
  // El falso devuelve el hash a propósito (peor caso): la ruta es quien debe quitarlo de la respuesta
  const { panaderias: _p, ...resto } = u;
  return resto;
};

const prismaFalso: any = {
  rol: { findFirst: async ({ where }: any) => ({ id: `rol-${where.codigo}`, codigo: where.codigo }) },
  panaderia: {
    findMany: async () => [
      { id: PAN_A, nombre: 'Casa del Pan' },
      { id: PAN_B, nombre: 'Otra Panadería' },
    ],
  },
  usuario: {
    findMany: async ({ where }: any) => usuarios.filter((u) => enPanaderia(u, where)).map(publica),
    findFirst: async ({ where }: any) => {
      const u = usuarios.find(
        (x) =>
          enPanaderia(x, where) &&
          (where.id === undefined || x.id === where.id) &&
          (where.nombre_usuario === undefined || x.nombre_usuario === where.nombre_usuario) &&
          (where.email === undefined || x.email === where.email),
      );
      return u ? publica(u) : null;
    },
    create: async ({ data }: any) => {
      if (errorUnicidadAlCrear) throw Object.assign(new Error('unique'), { code: 'P2002' });
      const nuevo = fila(`nuevo-${usuarios.length}`, data.rol_id.replace('rol-', ''), data.nombre_usuario, [data.usuario_panaderia.create.panaderia_id], {
        nombre: data.nombre,
        email: data.email,
        password_hash: data.password_hash,
        debe_cambiar_password: data.debe_cambiar_password,
        activo: data.activo,
      });
      usuarios.push(nuevo);
      return publica(nuevo);
    },
    update: async ({ where, data }: any) => {
      const u = usuarios.find((x) => x.id === where.id)!;
      Object.assign(u, data);
      return publica(u);
    },
  },
};

let servidor: ReturnType<express.Application['listen']>;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).usuario = { id: String(req.headers['x-id'] ?? ID_ADMIN_A), email: null, rol: String(req.headers['x-rol']) };
    (req as any).panaderiaId = String(req.headers['x-pan'] ?? PAN_A);
    next();
  });
  app.use('/usuarios', crearRouterUsuarios(prismaFalso));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => {
  servidor.close();
});

beforeEach(() => {
  errorUnicidadAlCrear = false;
  usuarios = [
    fila(ID_ADMIN_A, 'administrador', 'admin.a', [PAN_A]),
    fila(ID_OPER_A, 'operario', 'oper.a', [PAN_A]),
    fila(ID_OPER_B, 'operario', 'oper.b', [PAN_B]),
    fila(ID_ADMIN_B, 'administrador', 'admin.b', [PAN_B], { email: 'b@pan.co' }),
  ];
});

async function pedir(metodo: string, ruta: string, rol: string, cuerpo?: unknown, pan: string = PAN_A) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-rol': rol, 'x-pan': pan },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as any };
}

const NUEVO = { nombre: 'Ana Pérez', nombre_usuario: 'ana.perez', password: CLAVE };

describe('GET /usuarios', () => {
  test('lista solo a los usuarios de la panadería actual y nunca devuelve la contraseña', async () => {
    const r = await pedir('GET', '/usuarios', 'administrador');
    expect(r.status).toBe(200);
    expect(r.cuerpo.map((u: any) => u.nombre_usuario).sort()).toEqual(['admin.a', 'oper.a']);
    expect(JSON.stringify(r.cuerpo)).not.toContain('hash');
    expect(r.cuerpo[0]).toHaveProperty('rol');
  });

  test('el superadministrador ve la panadería que indica el contexto', async () => {
    const r = await pedir('GET', '/usuarios', 'superadministrador', undefined, PAN_B);
    expect(r.cuerpo.map((u: any) => u.nombre_usuario).sort()).toEqual(['admin.b', 'oper.b']);
  });

  test('si la base falla responde 500 con un mensaje genérico', async () => {
    const original = prismaFalso.usuario.findMany;
    prismaFalso.usuario.findMany = async () => {
      throw new Error('fallo simulado con detalle interno');
    };
    try {
      const r = await sinErroresEnConsola(() => pedir('GET', '/usuarios', 'administrador'));
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.cuerpo)).not.toContain('detalle interno');
    } finally {
      prismaFalso.usuario.findMany = original;
    }
  });
});

describe('GET /usuarios/panaderias', () => {
  test('solo el superadministrador la consulta', async () => {
    expect((await pedir('GET', '/usuarios/panaderias', 'superadministrador')).cuerpo).toHaveLength(2);
    expect((await pedir('GET', '/usuarios/panaderias', 'administrador')).status).toBe(403);
  });
});

describe('POST /usuarios', () => {
  test('el administrador crea un operario en SU panadería, con contraseña cifrada y cambio obligatorio', async () => {
    const r = await pedir('POST', '/usuarios', 'administrador', NUEVO);
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({ nombre_usuario: 'ana.perez', rol: 'operario', activo: true, debe_cambiar_password: true });
    const guardado = usuarios.find((u) => u.nombre_usuario === 'ana.perez')!;
    expect(guardado.panaderias).toEqual([PAN_A]);
    expect(guardado.password_hash).not.toBe(CLAVE);
    expect(await bcrypt.compare(CLAVE, guardado.password_hash)).toBe(true);
    expect(JSON.stringify(r.cuerpo)).not.toContain('hash');
  });

  test('el nombre de usuario se guarda en minúsculas', async () => {
    const r = await pedir('POST', '/usuarios', 'administrador', { ...NUEVO, nombre_usuario: 'Ana.Perez' });
    expect(r.status).toBe(201);
    expect(r.cuerpo.nombre_usuario).toBe('ana.perez');
  });

  test('el administrador no puede crear administradores', async () => {
    const r = await pedir('POST', '/usuarios', 'administrador', { ...NUEVO, rol: 'administrador' });
    expect(r.status).toBe(400);
    expect(usuarios).toHaveLength(4);
  });

  test('el superadministrador crea un administrador en la panadería que indica', async () => {
    const r = await pedir('POST', '/usuarios', 'superadministrador', { ...NUEVO, rol: 'administrador' }, PAN_B);
    expect(r.status).toBe(201);
    expect(r.cuerpo.rol).toBe('administrador');
    expect(usuarios.find((u) => u.nombre_usuario === 'ana.perez')!.panaderias).toEqual([PAN_B]);
  });

  test('datos inválidos responden 400 y no crean nada', async () => {
    for (const cuerpo of [{ ...NUEVO, password: 'corta' }, { ...NUEVO, nombre_usuario: 'a b' }, { ...NUEVO, nombre: '' }, {}]) {
      expect((await pedir('POST', '/usuarios', 'administrador', cuerpo)).status).toBe(400);
    }
    expect(usuarios).toHaveLength(4);
  });

  test('un nombre de usuario repetido (de cualquier panadería) responde 409', async () => {
    const r = await pedir('POST', '/usuarios', 'administrador', { ...NUEVO, nombre_usuario: 'oper.b' });
    expect(r.status).toBe(409);
    expect(usuarios).toHaveLength(4);
  });

  test('un correo repetido responde 409', async () => {
    const r = await pedir('POST', '/usuarios', 'administrador', { ...NUEVO, email: 'b@pan.co' });
    expect(r.status).toBe(409);
  });

  test('una carrera con la restricción única de la base también responde 409, no 500', async () => {
    errorUnicidadAlCrear = true;
    expect((await pedir('POST', '/usuarios', 'administrador', NUEVO)).status).toBe(409);
  });

  test('un fallo inesperado responde 500 genérico', async () => {
    const original = prismaFalso.usuario.create;
    prismaFalso.usuario.create = async () => {
      throw new Error('detalle interno');
    };
    try {
      const r = await sinErroresEnConsola(() => pedir('POST', '/usuarios', 'administrador', NUEVO));
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.cuerpo)).not.toContain('detalle interno');
    } finally {
      prismaFalso.usuario.create = original;
    }
  });
});

describe('PATCH /usuarios/:id', () => {
  test('el administrador desactiva y reactiva un operario de su panadería', async () => {
    expect((await pedir('PATCH', `/usuarios/${ID_OPER_A}`, 'administrador', { activo: false })).cuerpo.activo).toBe(false);
    expect(usuarios.find((u) => u.id === ID_OPER_A)!.activo).toBe(false);
    expect((await pedir('PATCH', `/usuarios/${ID_OPER_A}`, 'administrador', { activo: true })).cuerpo.activo).toBe(true);
  });

  test('corrige el nombre', async () => {
    const r = await pedir('PATCH', `/usuarios/${ID_OPER_A}`, 'administrador', { nombre: '  María López ' });
    expect(r.cuerpo.nombre).toBe('María López');
  });

  test('no toca a usuarios de otra panadería: responde 404', async () => {
    const r = await pedir('PATCH', `/usuarios/${ID_OPER_B}`, 'administrador', { activo: false });
    expect(r.status).toBe(404);
    expect(usuarios.find((u) => u.id === ID_OPER_B)!.activo).toBe(true);
  });

  test('el administrador no administra a otro administrador: responde 403', async () => {
    const otroAdmin = '55555555-5555-4555-8555-555555555555';
    usuarios.push(fila(otroAdmin, 'administrador', 'admin.a2', [PAN_A]));
    const r = await pedir('PATCH', `/usuarios/${otroAdmin}`, 'administrador', { activo: false });
    expect(r.status).toBe(403);
    expect(usuarios.find((u) => u.id === otroAdmin)!.activo).toBe(true);
  });

  test('el superadministrador sí administra administradores', async () => {
    const r = await pedir('PATCH', `/usuarios/${ID_ADMIN_B}`, 'superadministrador', { activo: false }, PAN_B);
    expect(r.status).toBe(200);
    expect(usuarios.find((u) => u.id === ID_ADMIN_B)!.activo).toBe(false);
  });

  test('identificador no válido, usuario inexistente, estado o nombre mal escritos y cuerpo vacío', async () => {
    expect((await pedir('PATCH', '/usuarios/abc', 'administrador', { activo: false })).status).toBe(400);
    expect((await pedir('PATCH', `/usuarios/${ID_INEXISTENTE}`, 'administrador', { activo: false })).status).toBe(404);
    expect((await pedir('PATCH', `/usuarios/${ID_OPER_A}`, 'administrador', { activo: 'no' })).status).toBe(400);
    expect((await pedir('PATCH', `/usuarios/${ID_OPER_A}`, 'administrador', { nombre: '   ' })).status).toBe(400);
    expect((await pedir('PATCH', `/usuarios/${ID_OPER_A}`, 'administrador', {})).status).toBe(400);
  });
});

describe('POST /usuarios/:id/contrasena', () => {
  test('restablece la contraseña y obliga al usuario a cambiarla', async () => {
    const r = await pedir('POST', `/usuarios/${ID_OPER_A}/contrasena`, 'administrador', { password: CLAVE });
    expect(r.status).toBe(200);
    const u = usuarios.find((x) => x.id === ID_OPER_A)!;
    expect(await bcrypt.compare(CLAVE, u.password_hash)).toBe(true);
    expect(u.debe_cambiar_password).toBe(true);
  });

  test('una contraseña débil o con el nombre de usuario responde 400 y no cambia nada', async () => {
    for (const password of ['corta', 'Oper.A-2026-x']) {
      expect((await pedir('POST', `/usuarios/${ID_OPER_A}/contrasena`, 'administrador', { password })).status).toBe(400);
    }
    expect(usuarios.find((x) => x.id === ID_OPER_A)!.password_hash).toBe('hash-original');
  });

  test('no se puede restablecer a un usuario de otra panadería (404) ni a otro administrador (403)', async () => {
    expect((await pedir('POST', `/usuarios/${ID_OPER_B}/contrasena`, 'administrador', { password: CLAVE })).status).toBe(404);
    expect((await pedir('POST', `/usuarios/${ID_ADMIN_A}/contrasena`, 'administrador', { password: CLAVE })).status).toBe(403);
    expect(usuarios.find((x) => x.id === ID_OPER_B)!.password_hash).toBe('hash-original');
    expect(usuarios.find((x) => x.id === ID_ADMIN_A)!.password_hash).toBe('hash-original');
  });

  test('identificador no válido responde 400', async () => {
    expect((await pedir('POST', '/usuarios/xyz/contrasena', 'administrador', { password: CLAVE })).status).toBe(400);
  });
});
