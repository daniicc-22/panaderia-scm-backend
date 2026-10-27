import { elegirPrecio, ofertaCuenta } from './precios';

// Lo que ofrece un proveedor, comparado con los demás proveedores del mismo insumo (puro, sin base de datos).

export interface OfertaDato {
  id: string;
  proveedor_id: string;
  precio: number;
  vigente: boolean;
  proveedor_activo: boolean;
  tiempo_entrega_dias: number | null;
}

export interface PresentacionDato {
  id: string;
  materia_prima_id: string;
  nombre: string;
  contenido: number;
  activa: boolean;
  ofertas: OfertaDato[];
}

export interface MateriaDato {
  id: string;
  codigo: string | null;
  nombre: string;
  unidad: string;
}

export interface OfertaProveedorItem {
  oferta_id: string;
  materia_prima_id: string;
  codigo: string | null;
  materia: string;
  unidad: string;
  presentacion_id: string;
  presentacion: string;
  contenido: number;
  precio: number;
  costo_por_unidad_base: number | null;
  tiempo_entrega_dias: number | null;
  vigente: boolean;
  presentacion_activa: boolean;
  // Cumple las reglas para contar en los costos (vigente, proveedor activo, precio > 0 y presentación activa)
  cuenta: boolean;
  // Es el precio que hoy usan los costos de este insumo
  aplicado: boolean;
  // Es el más barato por unidad entre todos los proveedores que cuentan
  mejor_precio: boolean;
  // Cuánto más caro que el mejor, en %, solo si cuenta y no es el mejor
  sobre_mejor_pct: number | null;
  otros_proveedores: number;
}

export interface ResumenOfertas {
  ofertas: number;
  cuentan: number;
  aplicadas: number;
  mejor_precio: number;
  entrega_promedio_dias: number | null;
}

const redondear1 = (n: number) => Math.round(n * 10) / 10;
const casiIgual = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

export function armarOfertasProveedor(
  proveedorId: string,
  materias: readonly MateriaDato[],
  presentaciones: readonly PresentacionDato[],
): { items: OfertaProveedorItem[]; resumen: ResumenOfertas } {
  const materiaPorId = new Map(materias.map((m) => [m.id, m]));
  const porMateria = new Map<string, PresentacionDato[]>();
  for (const p of presentaciones) {
    const lista = porMateria.get(p.materia_prima_id) ?? [];
    lista.push(p);
    porMateria.set(p.materia_prima_id, lista);
  }

  const items: OfertaProveedorItem[] = [];
  for (const [materiaId, lista] of porMateria) {
    const materia = materiaPorId.get(materiaId);
    if (!materia) continue;

    // Costo por unidad base de cada oferta que cuenta, de cualquier proveedor
    const cuentan = lista.flatMap((p) =>
      p.activa && p.contenido > 0
        ? p.ofertas.filter(ofertaCuenta).map((o) => ({ oferta: o, costo: o.precio / p.contenido }))
        : [],
    );
    const mejor = cuentan.length > 0 ? Math.min(...cuentan.map((c) => c.costo)) : null;
    const elegido = elegirPrecio(lista.map((p) => ({ id: p.id, contenido: p.contenido, activa: p.activa, ofertas: p.ofertas })));

    for (const p of lista) {
      for (const o of p.ofertas) {
        if (o.proveedor_id !== proveedorId) continue;
        const costo = p.contenido > 0 ? o.precio / p.contenido : null;
        const cuenta = p.activa && ofertaCuenta(o);
        const esMejor = cuenta && costo !== null && mejor !== null && casiIgual(costo, mejor);
        items.push({
          oferta_id: o.id,
          materia_prima_id: materiaId,
          codigo: materia.codigo,
          materia: materia.nombre,
          unidad: materia.unidad,
          presentacion_id: p.id,
          presentacion: p.nombre,
          contenido: p.contenido,
          precio: o.precio,
          costo_por_unidad_base: costo,
          tiempo_entrega_dias: o.tiempo_entrega_dias,
          vigente: o.vigente,
          presentacion_activa: p.activa,
          cuenta,
          aplicado: elegido?.oferta_id === o.id,
          mejor_precio: esMejor,
          sobre_mejor_pct:
            cuenta && !esMejor && costo !== null && mejor !== null && mejor > 0 ? redondear1((costo / mejor - 1) * 100) : null,
          otros_proveedores: new Set(cuentan.filter((c) => c.oferta.proveedor_id !== proveedorId).map((c) => c.oferta.proveedor_id)).size,
        });
      }
    }
  }

  items.sort(
    (a, b) =>
      a.materia.localeCompare(b.materia, 'es') ||
      b.contenido - a.contenido ||
      a.precio - b.precio ||
      (a.oferta_id < b.oferta_id ? -1 : a.oferta_id > b.oferta_id ? 1 : 0),
  );

  const entregas = items.filter((i) => i.cuenta && i.tiempo_entrega_dias !== null).map((i) => i.tiempo_entrega_dias as number);
  return {
    items,
    resumen: {
      ofertas: items.length,
      cuentan: items.filter((i) => i.cuenta).length,
      aplicadas: items.filter((i) => i.aplicado).length,
      mejor_precio: items.filter((i) => i.mejor_precio).length,
      entrega_promedio_dias: entregas.length > 0 ? redondear1(entregas.reduce((s, n) => s + n, 0) / entregas.length) : null,
    },
  };
}
