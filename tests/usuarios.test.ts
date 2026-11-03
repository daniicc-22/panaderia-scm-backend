import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  interpretarIdentificador,
  normalizarNombreUsuario,
  puedeAdministrar,
  rolesQuePuedeCrear,
  validarContrasena,
  validarCorreoOpcional,
  validarCrearUsuario,
  validarNombreUsuario,
} from '../src/utils/usuarios';

// ---------- nombre de usuario ----------

test('nombre de usuario: acepta 3 a 30 caracteres en minúsculas, números, punto, guion y guion bajo', () => {
  for (const ok of ['ana', 'ana.perez', 'ana_perez-2', 'a1b', 'x'.repeat(30)]) {
    assert.equal(validarNombreUsuario(ok), null, ok);
  }
});

test('nombre de usuario: rechaza vacío, muy corto o largo, espacios, tildes y símbolos', () => {
  for (const mal of ['', '  ', 'ab', 'x'.repeat(31), 'ana perez', 'añá', 'ana@pan', '.ana', '-ana', 'ana!']) {
    assert.notEqual(validarNombreUsuario(mal), null, JSON.stringify(mal));
  }
  assert.notEqual(validarNombreUsuario(undefined), null);
  assert.notEqual(validarNombreUsuario(123), null);
});

test('nombre de usuario: se normaliza a minúsculas y sin espacios en los extremos', () => {
  assert.equal(normalizarNombreUsuario('  Ana.Perez '), 'ana.perez');
  assert.equal(validarNombreUsuario('  Ana.Perez '), null);
  assert.equal(normalizarNombreUsuario(null), '');
});

// ---------- contraseña ----------

test('contraseña: acepta 10 a 64 caracteres con letras y números', () => {
  assert.equal(validarContrasena('Pan-de-maiz-26'), null);
  assert.equal(validarContrasena('abcdefghi1'), null);
  assert.equal(validarContrasena('a1b2c3d4'.repeat(8)), null);
});

test('contraseña: rechaza vacía, corta, larga, sin números, sin letras, repetitiva y común', () => {
  const casos: unknown[] = [undefined, null, '', 'Corta1', 'abcdefghij', '1234567890', 'a1'.repeat(33), 'aaaaaaaaa1', 'Password123', 'PANADERIA123'];
  for (const c of casos) assert.notEqual(validarContrasena(c), null, JSON.stringify(c));
});

test('contraseña: el límite de largo es exacto (9 no, 10 sí; 64 sí, 65 no)', () => {
  assert.notEqual(validarContrasena('abcdefgh1'), null);
  assert.equal(validarContrasena('abcdefghi1'), null);
  assert.equal(validarContrasena('a1b2'.repeat(16)), null);
  assert.notEqual(validarContrasena('a1b2'.repeat(16) + 'c'), null);
});

test('contraseña: no puede contener el nombre de usuario, sin importar mayúsculas', () => {
  assert.notEqual(validarContrasena('Maria.Lopez-2026', { nombreUsuario: 'maria.lopez' }), null);
  assert.equal(validarContrasena('Maria.Lopez-2026', { nombreUsuario: 'otro.usuario' }), null);
  assert.equal(validarContrasena('Maria.Lopez-2026', { nombreUsuario: null }), null);
});

// ---------- correo y quién puede crear a quién ----------

test('correo opcional: vacío o ausente es válido; con formato malo no', () => {
  for (const ok of [undefined, null, '', 'ana@pan.co', ' ana@pan.co ']) assert.equal(validarCorreoOpcional(ok), null);
  for (const mal of ['ana', 'ana@', '@pan.co', 'ana pan@pan.co', 'ana@pan', 5]) assert.notEqual(validarCorreoOpcional(mal), null, String(mal));
});

test('roles: el superadministrador crea administradores y operarios; el administrador solo operarios; el operario nada', () => {
  assert.deepEqual(rolesQuePuedeCrear('superadministrador'), ['administrador', 'operario']);
  assert.deepEqual(rolesQuePuedeCrear('administrador'), ['operario']);
  assert.deepEqual(rolesQuePuedeCrear('operario'), []);
  assert.deepEqual(rolesQuePuedeCrear('cualquiera'), []);
});

test('administrar: el administrador solo a operarios; nadie administra a un superadministrador', () => {
  assert.equal(puedeAdministrar('administrador', 'operario'), true);
  assert.equal(puedeAdministrar('administrador', 'administrador'), false);
  assert.equal(puedeAdministrar('administrador', 'superadministrador'), false);
  assert.equal(puedeAdministrar('superadministrador', 'administrador'), true);
  assert.equal(puedeAdministrar('superadministrador', 'superadministrador'), false);
  assert.equal(puedeAdministrar('operario', 'operario'), false);
});

// ---------- crear usuario ----------

const CUERPO = { nombre: 'Ana Pérez', nombre_usuario: 'Ana.Perez', password: 'Pan-de-maiz-26' };

test('crear usuario: sin rol indicado crea un operario, con el nombre de usuario normalizado y sin correo', () => {
  const r = validarCrearUsuario(CUERPO, 'administrador');
  assert.ok('datos' in r);
  assert.deepEqual(r.datos, { nombre: 'Ana Pérez', nombre_usuario: 'ana.perez', email: null, password: 'Pan-de-maiz-26', rol: 'operario' });
});

test('crear usuario: el correo se guarda en minúsculas y sin espacios', () => {
  const r = validarCrearUsuario({ ...CUERPO, email: ' Ana@Pan.CO ' }, 'administrador');
  assert.ok('datos' in r);
  assert.equal(r.datos.email, 'ana@pan.co');
});

test('crear usuario: el administrador no puede crear administradores ni superadministradores', () => {
  for (const rol of ['administrador', 'superadministrador', 'inventado']) {
    const r = validarCrearUsuario({ ...CUERPO, rol }, 'administrador');
    assert.ok('error' in r, rol);
  }
});

test('crear usuario: el superadministrador crea administradores pero no superadministradores', () => {
  assert.ok('datos' in validarCrearUsuario({ ...CUERPO, rol: 'administrador' }, 'superadministrador'));
  assert.ok('error' in validarCrearUsuario({ ...CUERPO, rol: 'superadministrador' }, 'superadministrador'));
});

test('crear usuario: el operario no crea a nadie', () => {
  assert.ok('error' in validarCrearUsuario(CUERPO, 'operario'));
});

test('crear usuario: exige nombre, usuario y contraseña válidos', () => {
  assert.ok('error' in validarCrearUsuario({ ...CUERPO, nombre: '  ' }, 'administrador'));
  assert.ok('error' in validarCrearUsuario({ ...CUERPO, nombre: 'x'.repeat(101) }, 'administrador'));
  assert.ok('error' in validarCrearUsuario({ ...CUERPO, nombre_usuario: 'a b' }, 'administrador'));
  assert.ok('error' in validarCrearUsuario({ ...CUERPO, password: 'corta' }, 'administrador'));
  assert.ok('error' in validarCrearUsuario({ ...CUERPO, password: 'Ana.Perez-2026' }, 'administrador'));
  assert.ok('error' in validarCrearUsuario({ ...CUERPO, email: 'no-es-correo' }, 'administrador'));
  assert.ok('error' in validarCrearUsuario(undefined, 'administrador'));
  assert.ok('error' in validarCrearUsuario({}, 'administrador'));
});

// ---------- identificador de ingreso ----------

test('identificador: con arroba es correo; sin arroba es nombre de usuario en minúsculas', () => {
  assert.deepEqual(interpretarIdentificador(' admin@demo.local '), { campo: 'email', valor: 'admin@demo.local' });
  assert.deepEqual(interpretarIdentificador(' Ana.Perez '), { campo: 'nombre_usuario', valor: 'ana.perez' });
  assert.equal(interpretarIdentificador(''), null);
  assert.equal(interpretarIdentificador('   '), null);
  assert.equal(interpretarIdentificador(undefined), null);
  assert.equal(interpretarIdentificador(42), null);
});
