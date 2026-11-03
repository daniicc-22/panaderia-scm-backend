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
  const [resultado, setResultado] = useState<ProduccionFinalizada | null>(null);

  return (
    <section className="flex flex-col gap-3" aria-label="Producciones recientes">
      <h2 className="text-lg font-semibold text-grafito">Producciones recientes</h2>

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
      ) : (lista.data ?? []).length === 0 ? (
        <EmptyState mensaje="Todavía no hay producciones registradas." />
      ) : (
        <ul className="flex flex-col gap-2">
          {(lista.data ?? []).map((p) => (
            <li key={p.id} className="rounded-lg border border-linea bg-tabla p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="font-medium text-grafito">{p.producto}</span>
                  <p className="text-xs text-gris-texto">
                    {formatoFechaIso(p.fecha)} · {hora(p.fecha)} · {p.usuario}
                  </p>
                </div>
                <Badge color={COLOR[p.estado]}>{ETIQUETA[p.estado]}</Badge>
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
    </section>
  );
}
