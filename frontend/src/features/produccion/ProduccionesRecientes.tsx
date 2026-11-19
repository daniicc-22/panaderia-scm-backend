import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../../components/feedback/EmptyState';
import { ErrorState } from '../../components/feedback/ErrorState';
import { LoadingState } from '../../components/feedback/LoadingState';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { getProducciones } from '../../services/produccionService';
import type { EstadoProduccion, ProduccionFinalizada } from '../../types/produccion.types';
import { formatoFechaIso } from '../inventario/formatos';
import { DetalleProduccion } from './DetalleProduccion';
import { FinalizarProduccion } from './FinalizarProduccion';

const ETIQUETA: Record<EstadoProduccion, string> = {
  planificada: 'Planificada',
  en_curso: 'En curso',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};
const COLOR: Record<EstadoProduccion, 'gray' | 'blue' | 'green' | 'red'> = {
  planificada: 'gray',
  en_curso: 'blue',
  finalizada: 'green',
  cancelada: 'red',
};

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

// Historial de producciones con el cierre (cuántas unidades salieron) y el detalle de cada una
export function ProduccionesRecientes() {
  const lista = useQuery({ queryKey: ['produccion', 'lista'], queryFn: () => getProducciones() });
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todas' | EstadoProduccion>('todas');
  const [verTodas, setVerTodas] = useState(false);
  const [resultado, setResultado] = useState<ProduccionFinalizada | null>(null);

  const todas = lista.data ?? [];
  const filtradas = todas.filter((p) => filtro === 'todas' || p.estado === filtro);
  const visibles = verTodas ? filtradas : filtradas.slice(0, 8);
  const cuenta = (f: 'todas' | EstadoProduccion) => (f === 'todas' ? todas.length : todas.filter((p) => p.estado === f).length);
  const colorRend = (r: number) => (Math.abs(r - 100) <= 5 ? 'bg-exito-fondo text-exito-texto' : Math.abs(r - 100) <= 10 ? 'bg-atencion-fondo text-atencion-texto' : 'bg-critico-fondo text-critico-texto');
  const BORDE: Record<EstadoProduccion, string> = { planificada: 'border-l-borde-campo', en_curso: 'border-l-trigo', finalizada: 'border-l-verde-bosque', cancelada: 'border-l-critico' };

  return (
    <section className="flex flex-col gap-3" aria-label="Producciones recientes">
      <h2 className="font-display text-lg font-semibold text-azul-noche">Producciones recientes</h2>
      {todas.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
          {(['todas', 'en_curso', 'finalizada', 'cancelada'] as const).filter((f) => f === 'todas' || cuenta(f) > 0).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => { setFiltro(f); setVerTodas(false); }}
              className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors ${filtro === f ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-white text-azul-noche hover:bg-arena'}`}
            >
              {f === 'todas' ? 'Todas' : ETIQUETA[f]}
              <span className="cifras text-xs opacity-80">{cuenta(f)}</span>
            </button>
          ))}
        </div>
      )}

      {resultado && (
        <Alert variant={resultado.aviso ? 'warning' : 'success'}>
          Producción cerrada: salieron {numero.format(resultado.cantidad_producida)} unidades
          {resultado.rendimiento_pct !== null ? ` (${resultado.rendimiento_pct.toLocaleString('es-CO')} % de lo planificado)` : ''}.
          {resultado.aviso ? ` ${resultado.aviso}` : ''}
        </Alert>
      )}

      {lista.isLoading ? (
        <LoadingState mensaje="Cargando producciones..." />
      ) : lista.isError ? (
        <ErrorState onReintentar={() => lista.refetch()} />
      ) : todas.length === 0 ? (
        <EmptyState mensaje="Todavía no hay producciones registradas." />
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((p) => (
            <li key={p.id} className={`rounded-tarjeta border border-l-4 border-linea bg-tabla p-3 ${BORDE[p.estado]}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="font-display text-base font-semibold text-azul-noche">{p.producto}</span>
                  <p className="text-xs text-gris-texto">
                    {formatoFechaIso(p.fecha)} · {hora(p.fecha)} · {p.usuario}
                  </p>
                </div>
                <span className="flex flex-wrap items-center gap-2">
                  {p.rendimiento_pct !== null && p.estado === 'finalizada' && (
                    <span className={`cifras rounded-full px-2 py-0.5 text-xs font-bold ${colorRend(p.rendimiento_pct)}`} title="Lo que salió frente a lo planificado">
                      {p.rendimiento_pct.toLocaleString('es-CO')} %
                    </span>
                  )}
                  <Badge color={COLOR[p.estado]}>{ETIQUETA[p.estado]}</Badge>
                </span>
              </div>
              <p className="mt-1 text-sm text-grafito">
                {p.lotes !== null ? `${numero.format(p.lotes)} ${p.lotes === 1 ? 'lote' : 'lotes'} · ` : ''}
                {p.cantidad_planificada !== null ? `Planificadas ${numero.format(p.cantidad_planificada)}` : 'Sin rendimiento planificado'}
                {p.cantidad_producida !== null
                  ? ` · Producidas ${numero.format(p.cantidad_producida)}${p.rendimiento_pct !== null ? ` (${p.rendimiento_pct.toLocaleString('es-CO')} %)` : ''}`
                  : ''}
              </p>
              <p className="text-xs text-gris-texto">
                {p.insumos_total === 0 ? 'Sin dato de pesaje' : `${p.insumos_pesados} de ${p.insumos_total} insumos pesados`}
              </p>

              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                {p.estado === 'en_curso' && cerrando !== p.id && (
                  <Button type="button" className="min-h-11" onClick={() => { setResultado(null); setCerrando(p.id); }}>
                    Cerrar producción
                  </Button>
                )}
                <Button type="button" variant="secondary" className="min-h-11" onClick={() => setAbierta(abierta === p.id ? null : p.id)}>
                  {abierta === p.id ? 'Ocultar detalle' : 'Ver detalle'}
                </Button>
              </div>

              {cerrando === p.id && (
                <FinalizarProduccion
                  id={p.id}
                  planificada={p.cantidad_planificada}
                  onCerrar={() => setCerrando(null)}
                  onFinalizada={(r) => {
                    setCerrando(null);
                    setResultado(r);
                  }}
                />
              )}
              {abierta === p.id && <DetalleProduccion id={p.id} />}
            </li>
          ))}
        </ul>
      )}
      {filtradas.length > 8 && (
        <button type="button" onClick={() => setVerTodas((v) => !v)} className="min-h-11 w-fit text-sm font-semibold text-pizarra hover:underline">
          {verTodas ? 'Ver menos' : `Ver las ${filtradas.length} producciones`}
        </button>
      )}
    </section>
  );
}
