// Indicadores de la Tabla I (definición operativa de las variables) y de la hipótesis,
// calculados en el navegador con los registros que ya entrega el backend.
import type { ClaseAbc, RespuestaAbc } from '../../types/abc.types';
import type { MermaResumen } from '../../types/merma.types';
import type { ProduccionResumen } from '../../types/produccion.types';
import type { ItemConteo } from '../../types/conteo.types';
import type { EntregaDia } from '../../types/inventario.types';
import { kilosMerma } from '../inicio/datosInicio';
import { DIAS_LABORABLES_ANIO, diasLaborables, enRango, fechaApi, type Rango } from '../inicio/periodos';

export const DIAS_MES_LABORAL = 26;

// Una merma es por vencimiento si su causa lo dice (código o nombre)
export const esVencimiento = (m: MermaResumen) => /venc|caduc/i.test(`${m.causa_codigo} ${m.causa}`);

const normal = (t: string) => t.trim().toLowerCase();

// Clase ABC por nombre de insumo (la merma trae el nombre, no el id)
export function mapaClases(abc: RespuestaAbc | undefined): Map<string, ClaseAbc> {
  const m = new Map<string, ClaseAbc>();
  for (const i of abc?.items ?? []) m.set(normal(i.nombre), i.clase);
  return m;
}

export interface DatosIndicadores {
  mermas: MermaResumen[];
  producciones: ProduccionResumen[];
  conteos: ItemConteo[];
  abc: RespuestaAbc | undefined;
  // Kilos recibidos por día (entradas de proveedor); opcional
  entregas?: EntregaDia[];
}

export interface Indicadores {
  diasLaborables: number;
  // Reducción del desperdicio
  mermaKg: number;
  consumoKg: number | null;
  mermaPct: number | null;
  mermaAKg: number;
  consumoAKg: number | null;
  mermaAPct: number | null;
  // Llevado a un mes laboral (26 días) para comparar rangos de distinto largo
  vencimientoKgMes: number | null;
  // Eficiencia operativa
  costoMermaMes: number | null;
  costoProduccion: number;
  lotes: number;
  costoPorLote: number | null;
  rendimiento: number | null;
  producciones: number;
  // Trazabilidad
  eri: number | null;
  conteos: number;
  registrosMerma: number;
  // Pedidos recibidos (kg por día de entrega)
  entregasDias: number;
  kgPorEntrega: number | null;
  kgEntregasMes: number | null;
}

// Entregas del rango. El primer día con entradas suele ser la carga del inventario inicial
// (no un pedido), así que se excluye cuando hay otros días.
export function entregasEnRango(d: DatosIndicadores, r: Rango): EntregaDia[] {
  const todas = [...(d.entregas ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const validas = todas.length >= 2 ? todas.slice(1) : todas;
  return validas.filter((e) => enRango(`${e.fecha}T12:00:00`, r));
}

const porMes = (valor: number, dias: number) => (dias > 0 ? (valor / dias) * DIAS_MES_LABORAL : null);

export function calcularIndicadores(d: DatosIndicadores, r: Rango): Indicadores {
  const dias = diasLaborables(r);
  const clases = mapaClases(d.abc);
  const mermas = d.mermas.filter((m) => enRango(m.fecha, r));

  let mermaKg = 0;
  let mermaAKg = 0;
  let vencKg = 0;
  let costo = 0;
  let costoProduccion = 0;
  for (const m of mermas) {
    const kg = kilosMerma(m) ?? 0;
    mermaKg += kg;
    if (m.insumo && clases.get(normal(m.insumo)) === 'A') mermaAKg += kg;
    if (esVencimiento(m)) vencKg += kg;
    costo += m.costo_estimado ?? 0;
    if (m.produccion_id) costoProduccion += m.costo_estimado ?? 0;
  }

  const items = d.abc?.items ?? [];
  const kgAnio = items.reduce((s, i) => s + i.demanda_anual_kg, 0);
  const kgAnioA = items.filter((i) => i.clase === 'A').reduce((s, i) => s + i.demanda_anual_kg, 0);
  const consumoKg = kgAnio > 0 ? (kgAnio / DIAS_LABORABLES_ANIO) * dias : null;
  const consumoAKg = kgAnioA > 0 ? (kgAnioA / DIAS_LABORABLES_ANIO) * dias : null;

  const fin = d.producciones.filter((p) => p.estado === 'finalizada' && enRango(p.fecha, r));
  const lotes = fin.reduce((s, p) => s + (p.lotes ?? 1), 0);
  const conR = fin.filter((p) => p.rendimiento_pct != null);

  const ent = entregasEnRango(d, r);
  const kgEnt = ent.reduce((s, e) => s + e.kg, 0);

  const conteos = d.conteos.filter((c) => c.estado !== 'descartado' && c.resumen.eri != null && enRango(c.creado_at, r));

  return {
    diasLaborables: dias,
    mermaKg,
    consumoKg,
    mermaPct: consumoKg ? (mermaKg / consumoKg) * 100 : null,
    mermaAKg,
    consumoAKg,
    mermaAPct: consumoAKg ? (mermaAKg / consumoAKg) * 100 : null,
    vencimientoKgMes: porMes(vencKg, dias),
    costoMermaMes: porMes(costo, dias),
    costoProduccion,
    lotes,
    costoPorLote: lotes > 0 ? costoProduccion / lotes : null,
    rendimiento: conR.length ? conR.reduce((s, p) => s + (p.rendimiento_pct ?? 0), 0) / conR.length : null,
    producciones: fin.length,
    eri: conteos.length ? conteos.reduce((s, c) => s + (c.resumen.eri ?? 0), 0) / conteos.length : null,
    conteos: conteos.length,
    registrosMerma: mermas.length,
    entregasDias: ent.length,
    kgPorEntrega: ent.length ? kgEnt / ent.length : null,
    kgEntregasMes: ent.length ? porMes(kgEnt, dias) : null,
  };
}

// Primer día con registros: ahí empieza el pre-test
export function primerRegistro(d: DatosIndicadores): Date | null {
  const fechas = [...d.mermas.map((m) => m.fecha), ...d.producciones.map((p) => p.fecha), ...d.conteos.map((c) => c.creado_at)]
    .map((f) => new Date(f).getTime())
    .filter((t) => Number.isFinite(t));
  if (fechas.length === 0) return null;
  const t = new Date(Math.min(...fechas));
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

// ---- Datos diarios para la prueba estadística (t de Student o Wilcoxon) en Colab o Excel
export function csvDiario(d: DatosIndicadores, desde: Date, hasta: Date, corte: Date | null): string {
  const clases = mapaClases(d.abc);
  const dec = (n: number | null) => (n == null ? '' : String(Math.round(n * 1000) / 1000).replace('.', ','));
  const filas = ['fecha;fase;kg_merma;kg_merma_clase_a;kg_merma_vencimiento;costo_merma;costo_merma_produccion;producciones;lotes;unidades;rendimiento_medio_pct;kg_recibidos'];
  for (let dia = new Date(desde); dia < hasta; dia = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1)) {
    if (dia.getDay() === 0) continue; // domingo no se trabaja
    const r = { desde: dia, hasta: new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1) };
    const ms = d.mermas.filter((m) => enRango(m.fecha, r));
    const ps = d.producciones.filter((p) => p.estado === 'finalizada' && enRango(p.fecha, r));
    const conR = ps.filter((p) => p.rendimiento_pct != null);
    const kg = ms.reduce((s, m) => s + (kilosMerma(m) ?? 0), 0);
    const kgA = ms.filter((m) => m.insumo && clases.get(normal(m.insumo)) === 'A').reduce((s, m) => s + (kilosMerma(m) ?? 0), 0);
    const kgV = ms.filter(esVencimiento).reduce((s, m) => s + (kilosMerma(m) ?? 0), 0);
    const costo = ms.reduce((s, m) => s + (m.costo_estimado ?? 0), 0);
    const costoP = ms.filter((m) => m.produccion_id).reduce((s, m) => s + (m.costo_estimado ?? 0), 0);
    const kgRec = entregasEnRango(d, r).reduce((s, e) => s + e.kg, 0);
    const fase = corte ? (dia < corte ? 'pre' : 'post') : '';
    filas.push(
      [
        fechaApi(dia),
        fase,
        dec(kg),
        dec(kgA),
        dec(kgV),
        dec(costo),
        dec(costoP),
        ps.length,
        ps.reduce((s, p) => s + (p.lotes ?? 1), 0),
        dec(ps.reduce((s, p) => s + (p.cantidad_producida ?? 0), 0)),
        dec(conR.length ? conR.reduce((s, p) => s + (p.rendimiento_pct ?? 0), 0) / conR.length : null),
        dec(kgRec),
      ].join(';'),
    );
  }
  return filas.join('\r\n');
}

// ---- Fecha de corte (inicio de la intervención), guardada en este navegador por panadería
const clave = (panaderiaId: string) => `indicadores.fecha-corte.${panaderiaId}`;

export function leerCorte(panaderiaId: string): string {
  try {
    return localStorage.getItem(clave(panaderiaId)) ?? '';
  } catch {
    return '';
  }
}

export function guardarCorte(panaderiaId: string, fecha: string) {
  try {
    if (fecha) localStorage.setItem(clave(panaderiaId), fecha);
    else localStorage.removeItem(clave(panaderiaId));
  } catch {
    // sin almacenamiento disponible
  }
}
