// "Qué se puede producir con lo que hay" (Sprint 7: HU-24). Sin dinero y sin acceso a base de datos.
import { capacidadProduccion } from './reposicion';

export interface ProductoProducible {
  producto_id: string;
  producto: string;
  formulacion_id: string;
  version: number;
  /** Cuánto rinde un lote (en la unidad de la receta). */
  rendimiento: number | null;
  /** Lo que gasta un lote de cada insumo con inventario, ya con los intermedios repartidos. */
  necesidades: ReadonlyMap<string, number>;
  /** Lo que gasta un lote de los insumos que se compran al uso: no limitan, solo se avisan. */
  compra_al_uso?: ReadonlyMap<string, number>;
  /** Si no se puede calcular (receta incompleta, unidades distintas...), el motivo en palabras. */
  bloqueo: string | null;
}

export interface InfoInsumo {
  nombre: string;
  unidad: string;
}

export type EstadoProducible = 'puede' | 'no_alcanza' | 'no_calculable';

export interface ItemProducible {
  producto_id: string;
  producto: string;
  formulacion_id: string;
  version: number;
  estado: EstadoProducible;
  motivo: string | null;
  lotes_posibles: number | null;
  /** Con fracción: el 1,5 de "alcanza para 1,5 lotes". */
  lotes_exactos: number | null;
  rendimiento_por_lote: number | null;
  cantidad_posible: number | null;
  limitante: { materia_prima_id: string; nombre: string; unidad: string; disponible: number; por_lote: number } | null;
  faltantes: { materia_prima_id: string; nombre: string; unidad: string; falta: number }[];
  /** Insumos que se compran según la producción (no cuentan para saber si alcanza). */
  compra_al_uso: { materia_prima_id: string; nombre: string; unidad: string; por_lote: number }[];
}

const redondear = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const ORDEN: Record<EstadoProducible, number> = { puede: 0, no_alcanza: 1, no_calculable: 2 };
const nombreDe = (m: ReadonlyMap<string, InfoInsumo>, id: string): InfoInsumo => m.get(id) ?? { nombre: 'Insumo desconocido', unidad: '' };

export function queSePuedeProducir(
  productos: readonly ProductoProducible[],
  existencias: ReadonlyMap<string, number>,
  insumos: ReadonlyMap<string, InfoInsumo>,
): ItemProducible[] {
  const existenciasObj: Record<string, number> = Object.fromEntries(existencias);
  const items = productos.map((p): ItemProducible => {
    const base = {
      producto_id: p.producto_id,
      producto: p.producto,
      formulacion_id: p.formulacion_id,
      version: p.version,
      rendimiento_por_lote: p.rendimiento,
      compra_al_uso: [...(p.compra_al_uso ?? [])]
        .map(([id, porLote]) => ({ materia_prima_id: id, ...nombreDe(insumos, id), por_lote: redondear(porLote, 3) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    };
    const sinCalculo = (motivo: string): ItemProducible => ({
      ...base,
      estado: 'no_calculable',
      motivo,
      lotes_posibles: null,
      lotes_exactos: null,
      cantidad_posible: null,
      limitante: null,
      faltantes: [],
    });
    if (p.bloqueo !== null) return sinCalculo(p.bloqueo);

    const cap = capacidadProduccion(
      [...p.necesidades].map(([materiaPrimaId, cantidad]) => ({ materiaPrimaId, cantidad })),
      existenciasObj,
    );
    if (cap.lotesPosibles === null || cap.limitante === null) {
      return sinCalculo('La receta no tiene insumos con inventario.');
    }
    const info = nombreDe(insumos, cap.limitante.materiaPrimaId);
    const exactos = cap.limitante.disponible / cap.limitante.porLote;
    return {
      ...base,
      estado: cap.lotesPosibles >= 1 ? 'puede' : 'no_alcanza',
      motivo: null,
      lotes_posibles: cap.lotesPosibles,
      lotes_exactos: redondear(exactos, 2),
      cantidad_posible: p.rendimiento === null ? null : redondear(cap.lotesPosibles * p.rendimiento, 3),
      limitante: {
        materia_prima_id: cap.limitante.materiaPrimaId,
        nombre: info.nombre,
        unidad: info.unidad,
        disponible: redondear(cap.limitante.disponible, 3),
        por_lote: redondear(cap.limitante.porLote, 3),
      },
      faltantes: cap.faltaParaUnLote
        .map((f) => ({ materia_prima_id: f.materiaPrimaId, ...nombreDe(insumos, f.materiaPrimaId), falta: redondear(f.falta, 3) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    };
  });
  return items.sort(
    (a, b) =>
      ORDEN[a.estado] - ORDEN[b.estado] ||
      a.producto.localeCompare(b.producto, 'es') ||
      (a.producto_id < b.producto_id ? -1 : a.producto_id > b.producto_id ? 1 : 0),
  );
}
