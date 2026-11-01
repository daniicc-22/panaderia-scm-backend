import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../../components/feedback/EmptyState';
import { ErrorState } from '../../components/feedback/ErrorState';
import { LoadingState } from '../../components/feedback/LoadingState';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { getLotesPorContar } from '../../services/conteosService';
import { formatoCantidad, formatoFecha } from '../inventario/formatos';
import type { DetalleConteo, LineaConteo, LoteContable } from '../../types/conteo.types';
import { LineaForm, type LoteElegido } from './LineaForm';

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
    const t = busqueda.trim().toLowerCase();
    return filas.filter(
      (f) =>
        (filtro === 'todos' || (filtro === 'contados') === f.contado) &&
        (!t || f.nombre.toLowerCase().includes(t) || f.codigo.toLowerCase().includes(t) || (f.codigo_lote ?? '').toLowerCase().includes(t)),
    );
  }, [filas, busqueda, filtro]);

  const total = filas.length;
  const contados = filas.filter((f) => f.contado).length;

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
          <div className="h-full bg-terracota transition-all" style={{ width: total === 0 ? '0%' : `${(contados / total) * 100}%` }} />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar insumo o lote"
          aria-label="Buscar insumo o lote"
          className="min-h-11 w-full rounded-md border border-borde-campo px-3 py-2 text-base sm:max-w-xs sm:text-sm"
        />
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar lotes">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              aria-pressed={filtro === f.valor}
              onClick={() => setFiltro(f.valor)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${
                filtro === f.valor ? 'border-azul-noche bg-info-fondo text-pizarra' : 'border-borde-campo bg-tabla text-gris-texto hover:bg-arena'
              }`}
            >
              {f.etiqueta}
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
                className="flex min-h-14 w-full items-start justify-between gap-3 rounded-lg border border-linea bg-tabla p-3 text-left active:bg-arena"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-grafito">{f.nombre}</span>
                  <span className="block text-xs text-gris-texto">
                    Lote {f.codigo_lote ?? 'sin código'}
                    {f.fecha_vencimiento ? ` · vence ${formatoFecha(f.fecha_vencimiento)}` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
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
