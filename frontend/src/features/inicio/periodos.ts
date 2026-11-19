// Períodos del Inicio de gestión (SCM, ABC y EOQ).
// La panadería trabaja de lunes a sábado: 312 días laborables al año
// (mes = 26 días laborables, quincena = 13). Los valores anuales del backend
// se dividen por estos divisores; nada se recalcula en el servidor.

export type Periodo = 'dia' | 'quincena' | 'mes' | 'anio';

export const DIAS_LABORABLES_ANIO = 312;

export interface InfoPeriodo {
  id: Periodo;
  etiqueta: string;
  // Valor anual ÷ divisor = valor del período
  divisor: number;
  diasLaborables: number;
  // Ventana de calendario para los datos reales (producción y mermas)
  ventanaDias: number;
  ventana: string;
  // Texto corto para la cabecera de cada bloque
  corto: string;
}

export const PERIODOS: InfoPeriodo[] = [
  { id: 'dia', etiqueta: 'Día', divisor: 312, diasLaborables: 1, ventanaDias: 1, ventana: 'hoy', corto: 'por día' },
  { id: 'quincena', etiqueta: 'Quincena', divisor: 24, diasLaborables: 13, ventanaDias: 15, ventana: 'últimos 15 días', corto: 'por quincena' },
  { id: 'mes', etiqueta: 'Mes', divisor: 12, diasLaborables: 26, ventanaDias: 30, ventana: 'últimos 30 días', corto: 'por mes' },
  { id: 'anio', etiqueta: 'Año', divisor: 1, diasLaborables: 312, ventanaDias: 365, ventana: 'últimos 12 meses', corto: 'por año' },
];

export function infoPeriodo(p: Periodo): InfoPeriodo {
  return PERIODOS.find((x) => x.id === p) ?? PERIODOS[2];
}

// true si la fecha cae dentro de los últimos `dias` días de calendario, contando hoy
export function dentroDeVentana(fechaIso: string, dias: number, hoy: Date = new Date()): boolean {
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1));
  const f = new Date(fechaIso);
  return !Number.isNaN(f.getTime()) && f >= inicio;
}

export const esDomingo = (hoy: Date = new Date()) => hoy.getDay() === 0;

// ---- Rangos de fechas: [desde, hasta) en hora local
export interface Rango {
  desde: Date;
  hasta: Date;
}

const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sumarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Período actual (que termina hoy) o el anterior, del mismo largo, para comparar.
// En «Día», el anterior es el último día laborable (el lunes se compara con el sábado).
export function rangoPeriodo(p: Periodo, anterior = false, hoy: Date = new Date()): Rango {
  const info = infoPeriodo(p);
  const manana = sumarDias(inicioDia(hoy), 1);
  const actual = { desde: sumarDias(manana, -info.ventanaDias), hasta: manana };
  if (!anterior) return actual;
  if (p === 'dia') {
    let dia = sumarDias(actual.desde, -1);
    if (dia.getDay() === 0) dia = sumarDias(dia, -1);
    return { desde: dia, hasta: sumarDias(dia, 1) };
  }
  return { desde: sumarDias(actual.desde, -info.ventanaDias), hasta: actual.desde };
}

export function enRango(fechaIso: string, r: Rango): boolean {
  const f = new Date(fechaIso);
  return !Number.isNaN(f.getTime()) && f >= r.desde && f < r.hasta;
}

// Días de lunes a sábado dentro del rango
export function diasLaborables(r: Rango): number {
  let n = 0;
  for (let d = r.desde; d < r.hasta; d = sumarDias(d, 1)) if (d.getDay() !== 0) n += 1;
  return n;
}

// AAAA-MM-DD local; `hasta` del rango es exclusivo, así que se envía el día anterior
export function fechaApi(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}
export const hastaApi = (r: Rango) => fechaApi(sumarDias(r.hasta, -1));

export const TEXTO_ANTERIOR: Record<Periodo, string> = {
  dia: 'el día laborable anterior',
  quincena: 'los 15 días anteriores',
  mes: 'los 30 días anteriores',
  anio: 'los 12 meses anteriores',
};

// ---- Referencias para los semáforos.
// Merma: ADEPAN reporta hasta 12 % de desperdicio sin estandarización [29].
// Pesaje y rendimiento: tolerancia del 5 % (acordarla con el grupo y el asesor).
export const REFERENCIA_MERMA_PCT = 12;
export const TOLERANCIA_PESAJE_PCT = 5;
export const META_RENDIMIENTO_PCT = 95;

// Cambio porcentual de `anterior` a `actual`; null si no hay con qué comparar
export function variacion(actual: number, anterior: number): number | null {
  if (!Number.isFinite(anterior) || anterior === 0) return null;
  return ((actual - anterior) / anterior) * 100;
}

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
// «mar 24 nov» para fechas cercanas
export function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const solo = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = solo ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} ${d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')}`;
}

// ---- Preferencias del visor (período y bloques abiertos). Si el navegador no deja guardar, se usa el valor por defecto.
const CLAVE_PERIODO = 'inicio.periodo';

export function leerPeriodo(): Periodo {
  try {
    const v = localStorage.getItem(CLAVE_PERIODO);
    if (v && PERIODOS.some((p) => p.id === v)) return v as Periodo;
  } catch {
    // sin almacenamiento disponible
  }
  return 'mes';
}

export function guardarPeriodo(p: Periodo) {
  try {
    localStorage.setItem(CLAVE_PERIODO, p);
  } catch {
    // sin almacenamiento disponible
  }
}

export function leerAbierto(id: string, porDefecto = true): boolean {
  try {
    const v = localStorage.getItem(`inicio.bloque.${id}`);
    return v === null ? porDefecto : v !== '0';
  } catch {
    return porDefecto;
  }
}

export function guardarAbierto(id: string, abierto: boolean) {
  try {
    localStorage.setItem(`inicio.bloque.${id}`, abierto ? '1' : '0');
  } catch {
    // sin almacenamiento disponible
  }
}

// ---- Formatos
export const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const f0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const f1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const f2 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

// Menos decimales cuanto más grande es la cifra
export function cantidad(n: number): string {
  const a = Math.abs(n);
  return (a >= 100 ? f0 : a >= 10 ? f1 : f2).format(n);
}

export const porcentaje = (n: number) => `${f1.format(n)} %`;
