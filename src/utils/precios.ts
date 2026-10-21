// Regla de precio de una materia prima (pura, sin base de datos).
//
// 1. Una oferta cuenta si está vigente, su proveedor está activo y su precio es mayor que cero.
// 2. De las presentaciones activas con al menos una oferta que cuente se toma la de mayor contenido.
// 3. De las ofertas de esa presentación se toma la de menor precio.
// Con empates el resultado no depende del orden en que llegan los datos (se desempata por id).

export interface OfertaPrecio {
  id: string;
  precio: number;
  vigente: boolean;
  proveedor_activo: boolean;
}

export interface PresentacionPrecio {
  id: string;
  contenido: number;
  activa: boolean;
  ofertas: OfertaPrecio[];
}

export interface PrecioElegido {
  presentacion_id: string;
  oferta_id: string;
  precio: number;
  contenido: number;
  costo_por_unidad_base: number;
}

export const ofertaCuenta = (o: OfertaPrecio) => o.vigente && o.proveedor_activo && o.precio > 0;

const porId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// La oferta que cuenta con menor precio de una lista, o null si ninguna cuenta
export function mejorOferta(ofertas: OfertaPrecio[]): OfertaPrecio | null {
  const validas = ofertas.filter(ofertaCuenta).sort((a, b) => a.precio - b.precio || porId(a, b));
  return validas[0] ?? null;
}

export function elegirPrecio(presentaciones: PresentacionPrecio[]): PrecioElegido | null {
  const candidatas = presentaciones
    .filter((p) => p.activa && p.contenido > 0)
    .sort((a, b) => b.contenido - a.contenido || porId(a, b));

  for (const p of candidatas) {
    const oferta = mejorOferta(p.ofertas);
    if (oferta) {
      return {
        presentacion_id: p.id,
        oferta_id: oferta.id,
        precio: oferta.precio,
        contenido: p.contenido,
        costo_por_unidad_base: oferta.precio / p.contenido,
      };
    }
  }
  return null;
}
