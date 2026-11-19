import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';
import { EmptyState } from '../../components/feedback/EmptyState';
import { ErrorState } from '../../components/feedback/ErrorState';
import { LoadingState } from '../../components/feedback/LoadingState';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { getLotesPorContar } from '../../services/conteosService';
import { formatoCantidad, formatoFecha } from '../inventario/formatos';
import type { DetalleConteo, LineaConteo, LoteContable } from '../../types/conteo.types';
import { LineaForm, type LoteElegido } from './LineaForm';

const sinTildes = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
type Filtro = 'pendientes' | 'contados' | 'todos';
type Fila = LoteContable & { linea?: LineaConteo };

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'pendientes', etiqueta: 'Por contar' },
  { valor: 'contados', etiqueta: 'Contados' },
  { valor: 'todos', etiqueta: 'Todos' },
];

export function ContarLotes({ detalle }: { detalle: DetalleConteo }) {
  const lotes = useQuery({ queryKey: ['conteos', detalle.id, 'lotes'], queryFn: () => getLotesPorContar(detalle.id) });
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [elegida, setElegida] = useState<Fila | null>(null);

  const filas = useMemo<Fila[]>(() => {
    const porLote = new Map(detalle.lineas.map((l) => [l.lote_id, l]));
    const base: Fila[] = (lotes.data?.items ?? []).map((i) => ({ ...i, contado: porLote.has(i.lote_id), linea: porLote.get(i.lote_id) }));
    // Un lote contado que luego se agotó sigue en la lista para poder corregirlo
    for (const l of detalle.lineas) {
      if (!base.some((b) => b.lote_id === l.lote_id)) {
        base.push({
          lote_id: l.lote_id,
          codigo_lote: l.codigo_lote,
          fecha_vencimiento: l.fecha_vencimiento,
          materia_prima_id: l.materia_prima_id ?? '',
          codigo: l.codigo,
          nombre: l.nombre,
          unidad: l.unidad,
          contado: true,
          linea: l,
        });
      }
    }
    return base;
  }, [lotes.data, detalle.lineas]);

  const visibles = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    return filas.filter(
      (f) =>
        (filtro === 'todos' || (filtro === 'contados') === f.contado) &&
        (!t || sinTildes(f.nombre).includes(t) || sinTildes(f.codigo).includes(t) || sinTildes(f.codigo_lote ?? '').includes(t)),
    );
  }, [filas, busqueda, filtro]);

  const total = filas.length;
  const contados = filas.filter((f) => f.contado).length;
  const cuenta = (f: Filtro) => (f === 'todos' ? total : f === 'contados' ? contados : total - contados);

  if (lotes.isLoading) return <LoadingState mensaje="Cargando lotes..." />;
  if (lotes.isError) return <ErrorState onReintentar={() => lotes.refetch()} />;

  const elegido: LoteElegido | null = elegida;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium text-grafito">
            {contados} de {total} lotes contados
          </span>
          {total > 0 && <span className="text-gris-texto">{Math.round((contados / total) * 100)} %</span>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-arena" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={contados}>
          <div className={`h-full transition-all ${total > 0 && contados === total ? 'bg-verde-bosque' : 'bg-terracota'}`} style={{ width: total === 0 ? '0%' : `${(contados / total) * 100}%` }} />
        </div>
      </div>

      <p className="text-sm text-gris-texto">Toca un lote, cuenta lo que hay físicamente en la bodega y escribe la cantidad.</p>

      <div className="flex flex-col gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-texto" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar insumo o lote"
            aria-label="Buscar insumo o lote"
            className="min-h-11 w-full rounded-lg border border-borde-campo bg-white pl-9 pr-3 text-base placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo sm:text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar lotes">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              aria-pressed={filtro === f.valor}
              onClick={() => setFiltro(f.valor)}
              className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors ${
                filtro === f.valor ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-white text-azul-noche hover:bg-arena'
              }`}
            >
              {f.etiqueta}
              <span className="cifras text-xs opacity-80">{cuenta(f.valor)}</span>
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <EmptyState
          titulo={total === 0 ? 'No hay lotes con existencias' : filtro === 'pendientes' && !busqueda ? '¡Todo contado!' : 'Sin resultados'}
          mensaje={
            total === 0
              ? 'Registra una entrada en Inventario para poder contar.'
              : filtro === 'pendientes' && !busqueda
                ? 'Ya contaste todos los lotes. Revisa y envía el conteo.'
                : 'Ningún lote coincide con la búsqueda o el filtro.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((f) => (
            <li key={f.lote_id}>
              <button
                type="button"
                onClick={() => setElegida(f)}
                className={`group flex min-h-16 w-full items-center justify-between gap-3 rounded-tarjeta border border-l-4 border-linea bg-tabla p-3 text-left hover:bg-arena active:bg-arena focus-visible:outline-2 focus-visible:outline-trigo ${f.linea ? (f.linea.diferencia === 0 ? 'border-l-verde-bosque' : 'border-l-trigo') : 'border-l-borde-campo'}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-display text-base font-semibold text-azul-noche">{f.nombre}</span>
                  <span className="block text-xs text-gris-texto">
                    Lote {f.codigo_lote ?? 'sin código'}
                    {f.fecha_vencimiento ? ` · vence ${formatoFecha(f.fecha_vencimiento)}` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                <span className="flex flex-col items-end gap-1">
                  {f.linea ? (
                    <>
                      <span className="text-sm font-semibold text-grafito">{formatoCantidad(f.linea.cantidad_contada, f.unidad)}</span>
                      {f.linea.diferencia === 0 ? (
                        <Badge color="green">Exacto</Badge>
                      ) : (
                        <Badge color={f.linea.diferencia < 0 ? 'red' : 'yellow'}>
                          {f.linea.diferencia > 0 ? '+' : '−'}
                          {formatoCantidad(Math.abs(f.linea.diferencia), f.unidad)}
                        </Badge>
                      )}
                    </>
                  ) : (
                    <Badge color="gray">Por contar</Badge>
                  )}
                </span>
                <ChevronRight size={18} aria-hidden="true" className="text-gris-texto transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={elegido !== null} onClose={() => setElegida(null)} title={elegido ? elegido.nombre : 'Contar lote'}>
        {elegido && <LineaForm key={elegido.lote_id} conteoId={detalle.id} lote={elegido} linea={elegida?.linea} onTerminar={() => setElegida(null)} />}
      </Modal>
    </div>
  );
}
