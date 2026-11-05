/**
 * Datos de DEMOSTRACIÓN para ver cómo se comportan la clasificación ABC, el EOQ, Qué pedir, las mermas y los conteos.
 * NO son datos reales: antes de la prueba piloto se borran (ver scripts/limpiar_pruebas.sql) y se cargan los reales.
 *
 * Usa la propia API (igual que la app), así respeta todas las reglas: lotes, descuento de inventario, costos, etc.
 * Todo lo que crea lleva el código de lote «DEMO-…» o la nota «DEMO» para poder reconocerlo.
 *
 *   Uso (PowerShell, con el backend corriendo):
 *     $env:DEMO_USUARIO="admin@demo.local"; $env:DEMO_PASSWORD="Demo123!"
 *     npx ts-node scripts/datos_demo.ts
 *
 *   Variables:  API_URL (por defecto http://localhost:3000), DEMO_USUARIO, DEMO_PASSWORD
 *   Por seguridad se niega a correr contra un servidor publicado (https) si no se pasa --confirmar-publicado.
 */
const API = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const USUARIO = process.env.DEMO_USUARIO;
const PASSWORD = process.env.DEMO_PASSWORD;
const confirmado = process.argv.includes('--confirmar-publicado');

if (!USUARIO || !PASSWORD) {
  console.error('Faltan DEMO_USUARIO y DEMO_PASSWORD (usuario administrador de la panadería).');
  process.exit(1);
}
if (/^https:\/\//i.test(API) && !confirmado) {
  console.error(`API_URL apunta a un servidor publicado (${API}). Si de verdad quieres cargar datos de demostración ahí, agrega --confirmar-publicado.`);
  process.exit(1);
}

let token = '';
async function llamar<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<{ ok: boolean; estado: number; datos: T }> {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const datos = (await r.json().catch(() => ({}))) as T;
  return { ok: r.ok, estado: r.status, datos };
}

// Aleatorio con semilla fija: dos corridas dan resultados parecidos y reproducibles
let semilla = 20261105;
const azar = () => {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
};
const entre = (a: number, b: number) => a + azar() * (b - a);
const enteroEntre = (a: number, b: number) => Math.floor(entre(a, b + 1));
const redondear = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const sumarDias = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
const marca = Date.now().toString(36).slice(-5).toUpperCase();

interface Opciones {
  materias: { id: string; codigo: string; nombre: string; presentaciones: { id: string; contenido: number; proveedores: { id: string }[] }[] }[];
}
interface LotesRespuesta {
  lotes: { id: string; cantidad_disponible: number }[];
}

async function main() {
  console.log(`Servidor: ${API}`);
  const login = await llamar<{ token?: string; error?: string }>('POST', '/login', { usuario: USUARIO, password: PASSWORD });
  if (!login.ok || !login.datos.token) throw new Error(`No se pudo iniciar sesión: ${login.datos.error ?? login.estado}`);
  token = login.datos.token;

  // 1. Entradas de inventario: un lote por insumo con proveedor y precio vigente
  const opciones = await llamar<Opciones>('GET', '/inventario/opciones-entrada');
  if (!opciones.ok) throw new Error('No se pudieron leer los insumos.');
  let entradas = 0;
  const lotesPorMateria = new Map<string, string>();
  for (const m of opciones.datos.materias) {
    const pres = m.presentaciones.find((p) => p.proveedores.length > 0);
    if (!pres) continue;
    const base = {
      materia_prima_id: m.id,
      presentacion_id: pres.id,
      proveedor_id: pres.proveedores[0].id,
      cantidad: enteroEntre(3, 25),
      codigo_lote: `DEMO-${m.codigo}-${marca}`.slice(0, 40),
    };
    let r = await llamar('POST', '/inventario/entradas', { ...base, fecha_vencimiento: sumarDias(enteroEntre(20, 160)) });
    if (!r.ok) r = await llamar('POST', '/inventario/entradas', base); // insumos que no llevan vencimiento
    if (r.ok) {
      entradas++;
      lotesPorMateria.set(m.id, m.nombre);
    }
  }
  console.log(`Entradas registradas: ${entradas}`);

  // 2. Producciones cerradas con rendimientos variados
  const formulaciones = await llamar<{ id: string; producto: string }[]>('GET', '/formulaciones');
  let producciones = 0;
  const lista = Array.isArray(formulaciones.datos) ? formulaciones.datos : [];
  for (const f of lista.slice(0, 8)) {
    const reg = await llamar<{ produccion_id?: string }>('POST', '/produccion', { formulacion_id: f.id, lotes: enteroEntre(1, 3) });
    if (!reg.ok || !reg.datos.produccion_id) continue;
    const det = await llamar<{ cantidad_planificada: number | null }>('GET', `/produccion/${reg.datos.produccion_id}`);
    const plan = det.datos.cantidad_planificada;
    if (!plan) continue;
    const cierre = await llamar('POST', `/produccion/${reg.datos.produccion_id}/finalizar`, { cantidad_producida: Math.max(1, Math.round(plan * entre(0.88, 1.06))) });
    if (cierre.ok) producciones++;
  }
  console.log(`Producciones cerradas: ${producciones}`);

  // 3. Mermas por causa (unas pocas causas pesan más, como en la vida real)
  const causas = await llamar<{ id: string; codigo: string }[]>('GET', '/mermas/causas');
  let mermas = 0;
  const pesos = [5, 3, 2, 1];
  const causasLista = Array.isArray(causas.datos) ? causas.datos : [];
  const ids = [...lotesPorMateria.keys()];
  const mermasPorTotal = Math.min(18, ids.length * 2);
  for (let i = 0; i < mermasPorTotal && causasLista.length > 0; i++) {
    const materiaId = ids[i % ids.length];
    const lotes = await llamar<LotesRespuesta>('GET', `/inventario/materias-primas/${materiaId}/lotes`);
    const lote = lotes.datos.lotes?.[0];
    if (!lote || lote.cantidad_disponible <= 0) continue;
    // elige la causa con probabilidad proporcional al peso
    const total = causasLista.slice(0, 4).reduce((s, _, k) => s + (pesos[k] ?? 1), 0);
    let tiro = azar() * total;
    let causa = causasLista[0];
    for (let k = 0; k < Math.min(4, causasLista.length); k++) {
      tiro -= pesos[k] ?? 1;
      if (tiro <= 0) {
        causa = causasLista[k];
        break;
      }
    }
    const r = await llamar('POST', '/mermas', {
      causa_id: causa.id,
      etapa: azar() < 0.6 ? 'almacenamiento' : 'recepcion',
      cantidad: redondear(lote.cantidad_disponible * entre(0.005, 0.04)),
      lote_id: lote.id,
    });
    if (r.ok) mermas++;
  }
  console.log(`Mermas registradas: ${mermas}`);

  // 4. Tres conteos físicos con exactitud distinta, para ver la tendencia (no se aplican: no cambian el inventario)
  const exactitudes = [0.82, 0.9, 0.96];
  let conteos = 0;
  for (const objetivo of exactitudes) {
    const nuevo = await llamar<{ id?: string; error?: string }>('POST', '/conteos', { observaciones: 'DEMO' });
    if (!nuevo.ok || !nuevo.datos.id) {
      console.log(`No se pudo abrir un conteo: ${nuevo.datos.error ?? nuevo.estado}`);
      break;
    }
    const porContar = await llamar<{ items: { lote_id: string; contado: boolean; nombre: string }[] }>('GET', `/conteos/${nuevo.datos.id}/lotes`);
    const sistema = new Map<string, number>();
    for (const materiaId of ids) {
      const l = await llamar<LotesRespuesta>('GET', `/inventario/materias-primas/${materiaId}/lotes`);
      for (const x of l.datos.lotes ?? []) sistema.set(x.id, x.cantidad_disponible);
    }
    for (const it of porContar.datos.items ?? []) {
      const esperado = sistema.get(it.lote_id);
      if (esperado === undefined) continue;
      const exacto = azar() < objetivo;
      const contada = exacto ? esperado : Math.max(0, redondear(esperado * entre(0.85, 1.05)));
      await llamar('PUT', `/conteos/${nuevo.datos.id}/lineas`, {
        lote_id: it.lote_id,
        cantidad_contada: contada,
        ...(exacto ? {} : { motivo: 'perdida_dano', observaciones: 'DEMO' }),
      });
    }
    const enviado = await llamar('POST', `/conteos/${nuevo.datos.id}/enviar`);
    if (enviado.ok) conteos++;
  }
  console.log(`Conteos enviados: ${conteos}`);
  console.log('Listo. Recuerda: son datos de demostración, no reales.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
