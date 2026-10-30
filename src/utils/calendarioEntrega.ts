/**
 * Calendario de entregas del proveedor (Sprint 7: HU-21 y HU-22).
 *
 * Funciones puras. Trabajan con fechas civiles 'AAAA-MM-DD' (el día en
 * Colombia) y reciben "hoy" como parámetro: nunca leen el reloj, para que
 * las pruebas no dependan de la fecha en que se ejecutan.
 *
 * Días de la semana como en JavaScript: 0 = domingo, 1 = lunes ... 6 = sábado.
 */

export type FechaCivil = string;

const MS_DIA = 86_400_000;
const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function aMilisegundos(fecha: FechaCivil): number {
  const partes = FORMATO_FECHA.exec(fecha);
  if (!partes) throw new Error(`Fecha inválida: ${fecha}`);
  const anio = Number(partes[1] ?? 0);
  const mes = Number(partes[2] ?? 0);
  const dia = Number(partes[3] ?? 0);
  const ms = Date.UTC(anio, mes - 1, dia);
  const control = new Date(ms);
  if (
    control.getUTCFullYear() !== anio ||
    control.getUTCMonth() !== mes - 1 ||
    control.getUTCDate() !== dia
  ) {
    throw new Error(`Fecha inválida: ${fecha}`);
  }
  return ms;
}

function aFecha(ms: number): FechaCivil {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Suma (o resta, con negativos) una cantidad entera de días a una fecha civil. */
export function sumarDias(fecha: FechaCivil, dias: number): FechaCivil {
  if (!Number.isInteger(dias)) {
    throw new Error('Los días a sumar deben ser un número entero');
  }
  return aFecha(aMilisegundos(fecha) + dias * MS_DIA);
}

/** Días entre dos fechas civiles (positivo si `hasta` es posterior a `desde`). */
export function diasEntre(desde: FechaCivil, hasta: FechaCivil): number {
  return Math.round((aMilisegundos(hasta) - aMilisegundos(desde)) / MS_DIA);
}

/** 0 = domingo ... 6 = sábado. */
export function diaDeLaSemana(fecha: FechaCivil): number {
  return new Date(aMilisegundos(fecha)).getUTCDay();
}

/** Valida los días de entrega y los devuelve sin repetidos y ordenados. */
export function normalizarDiasEntrega(dias: readonly number[]): number[] {
  if (!Array.isArray(dias) || dias.length === 0) {
    throw new Error('Debe indicar al menos un día de entrega');
  }
  for (const dia of dias) {
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
      throw new Error('Los días de entrega van de 0 (domingo) a 6 (sábado)');
    }
  }
  return [...new Set(dias)].sort((a, b) => a - b);
}

function validarPlazo(plazoDias: number): void {
  if (!Number.isInteger(plazoDias) || plazoDias < 0) {
    throw new Error('El tiempo de entrega debe ser un número entero de días, 0 o más');
  }
}

/** Primer día de entrega que cae en `fecha` o después. */
export function entregaDesde(fecha: FechaCivil, diasEntrega: readonly number[]): FechaCivil {
  const permitidos = normalizarDiasEntrega(diasEntrega);
  for (let i = 0; i < 7; i++) {
    const candidata = sumarDias(fecha, i);
    if (permitidos.includes(diaDeLaSemana(candidata))) return candidata;
  }
  throw new Error('No se encontró un día de entrega'); // inalcanzable: hay al menos un día
}

/** Primer día de entrega estrictamente posterior a `fecha`. */
export function entregaPosteriorA(fecha: FechaCivil, diasEntrega: readonly number[]): FechaCivil {
  return entregaDesde(sumarDias(fecha, 1), diasEntrega);
}

/**
 * Fecha en que llegaría un pedido hecho el día `fechaPedido`: el primer día de
 * entrega que cae a partir de `fechaPedido + plazoDias`.
 */
export function proximaEntrega(
  fechaPedido: FechaCivil,
  diasEntrega: readonly number[],
  plazoDias: number,
): FechaCivil {
  validarPlazo(plazoDias);
  return entregaDesde(sumarDias(fechaPedido, plazoDias), diasEntrega);
}

/** Las próximas `cantidad` entregas de un pedido hecho el día `fechaPedido`. */
export function siguientesEntregas(
  fechaPedido: FechaCivil,
  diasEntrega: readonly number[],
  plazoDias: number,
  cantidad: number,
): FechaCivil[] {
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    throw new Error('La cantidad de entregas debe ser un entero de 1 o más');
  }
  const lista = [proximaEntrega(fechaPedido, diasEntrega, plazoDias)];
  while (lista.length < cantidad) {
    const ultima = lista[lista.length - 1] as FechaCivil;
    lista.push(entregaPosteriorA(ultima, diasEntrega));
  }
  return lista;
}

/** Último día en que se puede pedir para recibir en `entrega`. */
export function ultimoDiaParaPedir(entrega: FechaCivil, plazoDias: number): FechaCivil {
  validarPlazo(plazoDias);
  return sumarDias(entrega, -plazoDias);
}

/** Días promedio entre entregas: 7 con un solo día a la semana, 3,5 con dos, etc. */
export function cicloPromedioDias(diasEntrega: readonly number[]): number {
  return 7 / normalizarDiasEntrega(diasEntrega).length;
}

/**
 * Día en que cuenta un pedido hecho a cierta hora: si se hace después de la
 * hora límite del proveedor, cuenta como hecho al día siguiente. Sin hora
 * límite, cuenta el mismo día.
 */
export function fechaEfectivaDePedido(
  fecha: FechaCivil,
  hora: string,
  horaLimite?: string | null,
): FechaCivil {
  if (!FORMATO_HORA.test(hora)) throw new Error(`Hora inválida: ${hora}`);
  if (horaLimite == null) return fecha;
  if (!FORMATO_HORA.test(horaLimite)) throw new Error(`Hora límite inválida: ${horaLimite}`);
  return hora > horaLimite ? sumarDias(fecha, 1) : fecha;
}
