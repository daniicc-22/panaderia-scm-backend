import { describe, it, expect } from 'vitest';
import {
  cicloPromedioDias,
  diaDeLaSemana,
  diasEntre,
  entregaDesde,
  entregaPosteriorA,
  fechaEfectivaDePedido,
  normalizarDiasEntrega,
  proximaEntrega,
  siguientesEntregas,
  sumarDias,
  ultimoDiaParaPedir,
} from '../src/utils/calendarioEntrega';

// Fechas de referencia (2026): martes 27/10, miércoles 28/10, jueves 29/10,
// domingo 1/11, martes 3/11, miércoles 4/11. Ninguna prueba usa el reloj.
const MARTES = '2026-10-27';
const MIERCOLES = '2026-10-28';
const JUEVES = '2026-10-29';

describe('sumarDias', () => {
  it('suma un día', () => {
    expect(sumarDias(MARTES, 1)).toBe(MIERCOLES);
  });

  it('cruza el fin de mes y el fin de año', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('respeta los años bisiestos', () => {
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDias('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('resta con números negativos y con cero no cambia', () => {
    expect(sumarDias('2026-11-01', -1)).toBe('2026-10-31');
    expect(sumarDias(MARTES, 0)).toBe(MARTES);
  });

  it('rechaza días no enteros y fechas inválidas', () => {
    expect(() => sumarDias(MARTES, 1.5)).toThrow('entero');
    expect(() => sumarDias('2026-02-30', 1)).toThrow('Fecha inválida');
    expect(() => sumarDias('27/10/2026', 1)).toThrow('Fecha inválida');
    expect(() => sumarDias('2026-13-01', 1)).toThrow('Fecha inválida');
  });
});

describe('diasEntre y diaDeLaSemana', () => {
  it('cuenta los días entre dos fechas, con signo', () => {
    expect(diasEntre(MARTES, '2026-11-04')).toBe(8);
    expect(diasEntre('2026-11-04', MARTES)).toBe(-8);
    expect(diasEntre(MARTES, MARTES)).toBe(0);
  });

  it('da el día de la semana (0 = domingo)', () => {
    expect(diaDeLaSemana(MARTES)).toBe(2);
    expect(diaDeLaSemana(MIERCOLES)).toBe(3);
    expect(diaDeLaSemana('2026-11-01')).toBe(0);
    expect(diaDeLaSemana('2026-10-31')).toBe(6);
  });
});

describe('normalizarDiasEntrega', () => {
  it('quita repetidos y ordena', () => {
    expect(normalizarDiasEntrega([3, 1, 3])).toEqual([1, 3]);
  });

  it('rechaza listas vacías y días fuera de 0 a 6 o no enteros', () => {
    expect(() => normalizarDiasEntrega([])).toThrow('al menos un día');
    expect(() => normalizarDiasEntrega([7])).toThrow('0 (domingo) a 6');
    expect(() => normalizarDiasEntrega([-1])).toThrow('0 (domingo) a 6');
    expect(() => normalizarDiasEntrega([1.5])).toThrow('0 (domingo) a 6');
  });
});

describe('entregaDesde y entregaPosteriorA', () => {
  it('desde el martes con entrega los miércoles, es el miércoles', () => {
    expect(entregaDesde(MARTES, [3])).toBe(MIERCOLES);
  });

  it('si la fecha ya es de entrega, cuenta ese mismo día', () => {
    expect(entregaDesde(MIERCOLES, [3])).toBe(MIERCOLES);
  });

  it('desde el jueves, la siguiente entrega es el miércoles de la semana siguiente', () => {
    expect(entregaDesde(JUEVES, [3])).toBe('2026-11-04');
  });

  it('con dos días de entrega elige el más cercano', () => {
    expect(entregaDesde(MARTES, [1, 4])).toBe(JUEVES);
  });

  it('la posterior es estrictamente después', () => {
    expect(entregaPosteriorA(MIERCOLES, [3])).toBe('2026-11-04');
    expect(entregaPosteriorA('2026-10-26', [1, 4])).toBe(JUEVES);
    expect(entregaPosteriorA(JUEVES, [1, 4])).toBe('2026-11-02');
  });
});

describe('proximaEntrega', () => {
  it('un pedido del martes con 1 día de plazo llega el miércoles', () => {
    expect(proximaEntrega(MARTES, [3], 1)).toBe(MIERCOLES);
  });

  it('un pedido del lunes también llega el miércoles', () => {
    expect(proximaEntrega('2026-10-26', [3], 1)).toBe(MIERCOLES);
  });

  it('un pedido del miércoles llega hasta el miércoles siguiente', () => {
    expect(proximaEntrega(MIERCOLES, [3], 1)).toBe('2026-11-04');
  });

  it('con plazo 0 y día de entrega, llega el mismo día', () => {
    expect(proximaEntrega(MIERCOLES, [3], 0)).toBe(MIERCOLES);
  });

  it('rechaza plazos negativos o no enteros', () => {
    expect(() => proximaEntrega(MARTES, [3], -1)).toThrow('tiempo de entrega');
    expect(() => proximaEntrega(MARTES, [3], 1.5)).toThrow('tiempo de entrega');
  });
});

describe('siguientesEntregas', () => {
  it('lista las próximas entregas semanales', () => {
    expect(siguientesEntregas(MARTES, [3], 1, 3)).toEqual([MIERCOLES, '2026-11-04', '2026-11-11']);
  });

  it('con dos días a la semana alterna', () => {
    expect(siguientesEntregas(MARTES, [1, 4], 1, 3)).toEqual([JUEVES, '2026-11-02', '2026-11-05']);
  });

  it('rechaza cantidades menores que 1', () => {
    expect(() => siguientesEntregas(MARTES, [3], 1, 0)).toThrow('1 o más');
  });
});

describe('ultimoDiaParaPedir', () => {
  it('resta el plazo a la fecha de entrega', () => {
    expect(ultimoDiaParaPedir(MIERCOLES, 1)).toBe(MARTES);
    expect(ultimoDiaParaPedir(MIERCOLES, 0)).toBe(MIERCOLES);
    expect(ultimoDiaParaPedir(MIERCOLES, 2)).toBe('2026-10-26');
  });

  it('rechaza plazos inválidos', () => {
    expect(() => ultimoDiaParaPedir(MIERCOLES, -1)).toThrow('tiempo de entrega');
  });
});

describe('cicloPromedioDias', () => {
  it('es 7 con un día, 3,5 con dos y 7/3 con tres', () => {
    expect(cicloPromedioDias([3])).toBe(7);
    expect(cicloPromedioDias([1, 4])).toBe(3.5);
    expect(cicloPromedioDias([1, 3, 5])).toBeCloseTo(7 / 3, 6);
  });
});

describe('fechaEfectivaDePedido', () => {
  it('antes o justo a la hora límite cuenta el mismo día', () => {
    expect(fechaEfectivaDePedido(MARTES, '15:00', '16:00')).toBe(MARTES);
    expect(fechaEfectivaDePedido(MARTES, '16:00', '16:00')).toBe(MARTES);
  });

  it('después de la hora límite cuenta como el día siguiente', () => {
    expect(fechaEfectivaDePedido(MARTES, '16:01', '16:00')).toBe(MIERCOLES);
  });

  it('sin hora límite cuenta el mismo día', () => {
    expect(fechaEfectivaDePedido(MARTES, '23:59', null)).toBe(MARTES);
    expect(fechaEfectivaDePedido(MARTES, '23:59')).toBe(MARTES);
  });

  it('rechaza horas mal escritas', () => {
    expect(() => fechaEfectivaDePedido(MARTES, '25:00', '16:00')).toThrow('Hora inválida');
    expect(() => fechaEfectivaDePedido(MARTES, '9:00', '16:00')).toThrow('Hora inválida');
    expect(() => fechaEfectivaDePedido(MARTES, '10:00', '4pm')).toThrow('Hora límite inválida');
  });
});
