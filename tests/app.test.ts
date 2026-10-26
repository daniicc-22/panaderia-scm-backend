import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { crearApp } from '../src/app';
import { sinErroresEnConsola } from './helpers';

// Pruebas de la aplicación ya ensamblada (inicio de sesión, seguridad y guardas por ruta),
// con la base de datos simulada y un servidor real en un puerto libre.

const SECRETO = 'secreto-de-prueba-con-mas-de-32-caracteres';
const CLAVE = 'Clave-de-prueba-1';
const HASH = bcrypt.hashSync(CLAVE, 4);
const PAN = 'pan-1';

type Fila = Record<string, any>;

function usuarioDe(rol: string, extra: Fila = {}): Fila {
  return {
    id: `u-${rol}`,
    nombre: `Usuario ${rol}`,
    email: `${rol}@prueba.test`,
    password_hash: HASH,
    activo: true,
    rol: { codigo: rol },
    ...extra,
  };
}

function baseFalsa(opciones: { usuarios?: Fila[]; fallar?: boolean; sinPanaderia?: boolean } = {}) {
  const usuarios = opciones.usuarios ?? [usuarioDe('administrador'), usuarioDe('operario')];
  const comprobar = () => {
    if (opciones.fallar) throw new Error('fallo simulado');
  };
  return {
    usuario: {
      findUnique: async ({ where }: any) => {
        comprobar();
        return usuarios.find((u) => u.email === where.email) ?? null;
      },
    },
    rol: {
      findMany: async () => {
        comprobar();
        return [{ id: 'r1', codigo: 'administrador' }];
      },
    },
    usuario_panaderia: {
      findFirst: async () => {
        comprobar();
        return { panaderia_id: PAN };
      },
    },
    panaderia: {
      findFirst: async () => {
        comprobar();
        return { id: PAN };
      },
      findUnique: async ({ where }: any) => {
        comprobar();
        return opciones.sinPanaderia ? null : { id: where.id, nombre: 'La Casa del Pan de Maíz' };
      },
    },
  } as any;
}

const ENTORNO_BASE: Record<string, string | undefined> = {
  JWT_SECRET: SECRETO,
  JWT_EXPIRES_IN: undefined,
  CORS_ORIGINS: 'http://localhost:5173',
  LOGIN_MAX_INTENTOS: undefined,
  NODE_ENV: 'test',
};

// Ejecuta `fn` con el entorno indicado y un servidor levantado con la aplicación recién creada
async function conServidor<T>(
  prisma: any,
  entorno: Record<string, string | undefined>,
  fn: (base: string) => Promise<T>,
): Promise<T> {
  const original: Record<string, string | undefined> = {};
  const combinado = { ...ENTORNO_BASE, ...entorno };
  for (const k of Object.keys(combinado)) {
    original[k] = process.env[k];
    if (combinado[k] === undefined) delete process.env[k];
    else process.env[k] = combinado[k];
  }
  const servidor = crearApp(prisma).listen(0);
  await new Promise<void>((ok) => servidor.once('listening', ok));
  try {
    return await fn(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}`);
  } finally {
    servidor.close();
    for (const k of Object.keys(original)) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  }
}

async function login(base: string, cuerpo: unknown) {
  const r = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as any, cabeceras: r.headers };
}

function tokenDe(rol: string) {
  return jwt.sign({ id: `u-${rol}`, email: `${rol}@prueba.test`, rol }, SECRETO);
}

async function get(base: string, ruta: string, token?: string) {
  const r = await fetch(base + ruta, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const texto = await r.text();
  let cuerpo: any = null;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    // una respuesta de error que no es JSON (p. ej. la página de error por defecto de Express)
  }
  return { status: r.status, cuerpo };
}

// ---------- /health ----------

test('GET /health responde 200 sin token', async () => {
  await conServidor(baseFalsa(), {}, async (base) => {
    const r = await get(base, '/health');
    assert.equal(r.status, 200);
    assert.equal(r.cuerpo.status, 'ok');
  });
});

// ---------- /login ----------

test('POST /login: sin correo o sin contraseña responde 400', async () => {
  await conServidor(baseFalsa(), {}, async (base) => {
    assert.equal((await login(base, { password: CLAVE })).status, 400);
    assert.equal((await login(base, { email: 'administrador@prueba.test' })).status, 400);
    assert.equal((await login(base, {})).status, 400);
  });
});

test('POST /login: usuario inexistente, inactivo o contraseña mala responden 401 con el mismo mensaje', async () => {
  const prisma = baseFalsa({ usuarios: [usuarioDe('administrador'), usuarioDe('operario', { activo: false })] });
  await conServidor(prisma, {}, async (base) => {
    const inexistente = await login(base, { email: 'nadie@prueba.test', password: CLAVE });
    const inactivo = await login(base, { email: 'operario@prueba.test', password: CLAVE });
    const mala = await login(base, { email: 'administrador@prueba.test', password: 'otra-clave' });
    for (const r of [inexistente, inactivo, mala]) {
      assert.equal(r.status, 401);
      assert.equal(r.cuerpo.error, 'Credenciales incorrectas');
    }
  });
});

test('POST /login: con credenciales correctas devuelve usuario y token, sin la contraseña', async () => {
  await conServidor(baseFalsa(), {}, async (base) => {
    const r = await login(base, { email: 'administrador@prueba.test', password: CLAVE });
    assert.equal(r.status, 200);
    assert.deepEqual(r.cuerpo.usuario, {
      id: 'u-administrador',
      nombre: 'Usuario administrador',
      email: 'administrador@prueba.test',
      rol: 'administrador',
    });
    assert.ok(!JSON.stringify(r.cuerpo).includes('password'));
    assert.ok(!JSON.stringify(r.cuerpo).includes(HASH));
    const payload = jwt.verify(r.cuerpo.token, SECRETO) as any;
    assert.equal(payload.id, 'u-administrador');
    assert.equal(payload.email, 'administrador@prueba.test');
    assert.equal(payload.rol, 'administrador');
  });
});

test('POST /login: el token vence a las 8 horas por defecto y según JWT_EXPIRES_IN si se configura', async () => {
  const cuerpo = { email: 'administrador@prueba.test', password: CLAVE };
  await conServidor(baseFalsa(), {}, async (base) => {
    const p = jwt.decode((await login(base, cuerpo)).cuerpo.token) as any;
    assert.equal(p.exp - p.iat, 8 * 3600);
  });
  await conServidor(baseFalsa(), { JWT_EXPIRES_IN: '2h' }, async (base) => {
    const p = jwt.decode((await login(base, cuerpo)).cuerpo.token) as any;
    assert.equal(p.exp - p.iat, 2 * 3600);
  });
});

test('POST /login: sin JWT_SECRET responde 500 y no entrega token', async () => {
  await sinErroresEnConsola(() =>
    conServidor(baseFalsa(), { JWT_SECRET: undefined }, async (base) => {
      const r = await login(base, { email: 'administrador@prueba.test', password: CLAVE });
      assert.equal(r.status, 500);
      assert.equal(r.cuerpo.token, undefined);
    }),
  );
});

test('POST /login: si la base falla responde 500 con un mensaje genérico', async () => {
  await sinErroresEnConsola(() =>
    conServidor(baseFalsa({ fallar: true }), {}, async (base) => {
      const r = await login(base, { email: 'administrador@prueba.test', password: CLAVE });
      assert.equal(r.status, 500);
      assert.equal(r.cuerpo.error, 'Error al iniciar sesión');
      assert.ok(!JSON.stringify(r.cuerpo).includes('fallo simulado'));
    }),
  );
});

// ---------- límite de intentos ----------

test('límite de intentos: tras LOGIN_MAX_INTENTOS fallos responde 429, incluso con la clave correcta', async () => {
  await conServidor(baseFalsa(), { LOGIN_MAX_INTENTOS: '3' }, async (base) => {
    for (let i = 0; i < 3; i++) {
      assert.equal((await login(base, { email: 'administrador@prueba.test', password: 'mala' })).status, 401);
    }
    const bloqueado = await login(base, { email: 'administrador@prueba.test', password: CLAVE });
    assert.equal(bloqueado.status, 429);
    assert.ok(String(bloqueado.cuerpo.error).includes('Demasiados intentos'));
  });
});

test('límite de intentos: los inicios de sesión correctos no cuentan', async () => {
  await conServidor(baseFalsa(), { LOGIN_MAX_INTENTOS: '2' }, async (base) => {
    for (let i = 0; i < 5; i++) {
      assert.equal((await login(base, { email: 'administrador@prueba.test', password: CLAVE })).status, 200);
    }
  });
});

// ---------- CORS, cabeceras y tamaño ----------

test('CORS: responde al origen permitido y no a otro', async () => {
  await conServidor(baseFalsa(), { CORS_ORIGINS: 'https://app.ejemplo.test, http://localhost:5173' }, async (base) => {
    const permitido = await fetch(`${base}/health`, { headers: { origin: 'https://app.ejemplo.test' } });
    assert.equal(permitido.headers.get('access-control-allow-origin'), 'https://app.ejemplo.test');
    const otroPermitido = await fetch(`${base}/health`, { headers: { origin: 'http://localhost:5173' } });
    assert.equal(otroPermitido.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const ajeno = await fetch(`${base}/health`, { headers: { origin: 'https://sitio-malo.test' } });
    assert.equal(ajeno.headers.get('access-control-allow-origin'), null);
  });
});

test('CORS: sin CORS_ORIGINS solo se permite http://localhost:5173', async () => {
  await conServidor(baseFalsa(), { CORS_ORIGINS: undefined }, async (base) => {
    const local = await fetch(`${base}/health`, { headers: { origin: 'http://localhost:5173' } });
    assert.equal(local.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const otro = await fetch(`${base}/health`, { headers: { origin: 'https://otro.test' } });
    assert.equal(otro.headers.get('access-control-allow-origin'), null);
  });
});

test('cabeceras de seguridad de helmet: nosniff y sin x-powered-by', async () => {
  await conServidor(baseFalsa(), {}, async (base) => {
    const r = await fetch(`${base}/health`);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-powered-by'), null);
  });
});

test('un cuerpo de más de 100 kB se rechaza con 413', async () => {
  await conServidor(baseFalsa(), {}, async (base) => {
    const r = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(150 * 1024) }),
    });
    assert.equal(r.status, 413);
  });
});

// ---------- arranque en producción ----------

test('producción: sin JWT_SECRET o con uno de menos de 32 caracteres la aplicación no se crea', () => {
  const original = { NODE_ENV: process.env.NODE_ENV, JWT_SECRET: process.env.JWT_SECRET };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => crearApp(baseFalsa()), /JWT_SECRET/);
    process.env.JWT_SECRET = 'corto';
    assert.throws(() => crearApp(baseFalsa()), /JWT_SECRET/);
    process.env.JWT_SECRET = 'x'.repeat(31);
    assert.throws(() => crearApp(baseFalsa()), /JWT_SECRET/);
    process.env.JWT_SECRET = 'x'.repeat(32);
    assert.doesNotThrow(() => crearApp(baseFalsa()));
  } finally {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('fuera de producción no se exige un secreto largo', () => {
  const original = { NODE_ENV: process.env.NODE_ENV, JWT_SECRET: process.env.JWT_SECRET };
  try {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'corto';
    assert.doesNotThrow(() => crearApp(baseFalsa()));
  } finally {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('producción: la aplicación confía en el proxy del hosting; en desarrollo no', () => {
  const original = { NODE_ENV: process.env.NODE_ENV, JWT_SECRET: process.env.JWT_SECRET };
  try {
    process.env.JWT_SECRET = SECRETO;
    process.env.NODE_ENV = 'production';
    assert.equal(crearApp(baseFalsa()).get('trust proxy'), 1);
    process.env.NODE_ENV = 'development';
    assert.equal(crearApp(baseFalsa()).get('trust proxy'), false);
  } finally {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

// ---------- guardas de las rutas ----------

const RUTAS_PROTEGIDAS = ['/roles', '/mi-panaderia', '/materias-primas', '/proveedores', '/precios', '/formulaciones', '/inventario', '/produccion', '/conteos', '/abc'];

test('todas las rutas protegidas responden 401 sin token y con un token inválido', async () => {
  await conServidor(baseFalsa(), {}, async (base) => {
    for (const ruta of RUTAS_PROTEGIDAS) {
      assert.equal((await get(base, ruta)).status, 401, `${ruta} sin token`);
      assert.equal((await get(base, ruta, 'esto-no-es-un-token')).status, 401, `${ruta} con token inválido`);
    }
  });
});

test('con un token válido ninguna ruta protegida responde 401 ni 403 (las guardas dejan pasar al administrador)', async () => {
  await sinErroresEnConsola(() =>
    conServidor(baseFalsa(), {}, async (base) => {
      for (const ruta of RUTAS_PROTEGIDAS) {
        const { status } = await get(base, ruta, tokenDe('administrador'));
        assert.ok(status !== 401 && status !== 403, `${ruta} respondió ${status}`);
      }
    }),
  );
});

test('/inventario: el operario también pasa las guardas (registra entradas y consulta existencias)', async () => {
  await sinErroresEnConsola(() =>
    conServidor(baseFalsa(), {}, async (base) => {
      const { status } = await get(base, '/inventario', tokenDe('operario'));
      assert.ok(status !== 401 && status !== 403, `/inventario respondió ${status}`);
    }),
  );
});

test('un token firmado con otro secreto se rechaza (401)', async () => {
  await conServidor(baseFalsa(), {}, async (base) => {
    const ajeno = jwt.sign({ id: 'u', email: 'x@x.co', rol: 'administrador' }, 'otro-secreto-distinto-de-mas-de-32-caracteres');
    assert.equal((await get(base, '/abc', ajeno)).status, 401);
  });
});

test('un token vencido se rechaza (401)', async () => {
  await conServidor(baseFalsa(), {}, async (base) => {
    const vencido = jwt.sign({ id: 'u', email: 'x@x.co', rol: 'administrador' }, SECRETO, { expiresIn: -10 });
    assert.equal((await get(base, '/mi-panaderia', vencido)).status, 401);
  });
});

test('/abc: el operario recibe 403', async () => {
  await conServidor(baseFalsa(), {}, async (base) => {
    const r = await get(base, '/abc', tokenDe('operario'));
    assert.equal(r.status, 403);
  });
});

// ---------- /roles y /mi-panaderia ----------

test('GET /roles con token responde 200 y, si la base falla, 500 genérico', async () => {
  await conServidor(baseFalsa(), {}, async (base) => {
    const r = await get(base, '/roles', tokenDe('administrador'));
    assert.equal(r.status, 200);
    assert.equal(r.cuerpo[0].codigo, 'administrador');
  });
  await sinErroresEnConsola(() =>
    conServidor(baseFalsa({ fallar: true }), {}, async (base) => {
      const r = await get(base, '/roles', tokenDe('administrador'));
      assert.equal(r.status, 500);
      assert.equal(r.cuerpo.error, 'Error al consultar los roles');
    }),
  );
});

test('GET /mi-panaderia devuelve solo id y nombre de la panadería del usuario', async () => {
  await conServidor(baseFalsa(), {}, async (base) => {
    const r = await get(base, '/mi-panaderia', tokenDe('operario'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.cuerpo, { id: PAN, nombre: 'La Casa del Pan de Maíz' });
  });
});

test('GET /mi-panaderia: si la panadería ya no existe responde 404', async () => {
  await conServidor(baseFalsa({ sinPanaderia: true }), {}, async (base) => {
    assert.equal((await get(base, '/mi-panaderia', tokenDe('administrador'))).status, 404);
  });
});
