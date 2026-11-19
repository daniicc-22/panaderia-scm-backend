import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { Alert } from '../../components/ui/Alert';
import { ErrorState } from '../../components/feedback/ErrorState';
import { LoadingState } from '../../components/feedback/LoadingState';
import { formatoCantidad } from '../inventario/formatos';
import { getQueProducir } from '../../services/reposicionService';
import type { ItemProducible } from '../../types/reposicion.types';

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const VISIBLES_FALTANTES = 3;
const INICIAL = 6;

type Filtro = 'todas' | ItemProducible['estado'];
const ETIQUETA_FILTRO: Record<Filtro, string> = { todas: 'Todas', puede: 'Se pueden hacer', no_alcanza: 'No alcanzan', no_calculable: 'Sin calcular' };

function Faltantes({ items }: { items: ItemProducible['faltantes'] }) {
  const texto = (f: ItemProducible['faltantes'][number]) => `${f.nombre}: ${formatoCantidad(f.falta, f.unidad)}`;
  const primeros = items.slice(0, VISIBLES_FALTANTES);
  const resto = items.slice(VISIBLES_FALTANTES);
  return (
    <div className="mt-1 text-xs text-gris-texto">
      <p>
        <span className="font-semibold text-grafito">Falta:</span> {primeros.map(texto).join(' · ')}
        {resto.length === 0 && '.'}
      </p>
      {resto.length > 0 && (
        <details className="mt-0.5">
          <summary className="min-h-6 cursor-pointer font-semibold text-pizarra hover:underline">y {resto.length} {resto.length === 1 ? 'insumo más' : 'insumos más'}</summary>
          <p className="mt-0.5">{resto.map(texto).join(' · ')}.</p>
        </details>
      )}
    </div>
  );
}

function Fila({ i }: { i: ItemProducible }) {
  const borde = i.estado === 'puede' ? 'border-l-verde-bosque' : i.estado === 'no_alcanza' ? 'border-l-critico' : 'border-l-borde-campo';
  return (
    <li className={`rounded-tarjeta border border-l-4 border-linea bg-tabla p-3 ${borde}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-base font-semibold text-azul-noche">{i.producto}</p>
        {i.estado === 'puede' && <Badge color="green">Alcanza para {i.lotes_posibles} {i.lotes_posibles === 1 ? 'lote' : 'lotes'}</Badge>}
        {i.estado === 'no_alcanza' && <Badge color="red">No alcanza para un lote</Badge>}
        {i.estado === 'no_calculable' && <Badge color="gray">No se puede calcular</Badge>}
      </div>

      {i.estado === 'puede' && i.limitante && (
        <p className="mt-1 text-xs text-gris-texto">
          {i.cantidad_posible !== null && <span className="cifras font-semibold text-grafito">{numero.format(i.cantidad_posible)} unidades · </span>}
          Lo que primero se acaba: {i.limitante.nombre} (hay {formatoCantidad(i.limitante.disponible, i.limitante.unidad)}, cada lote gasta{' '}
          {formatoCantidad(i.limitante.por_lote, i.limitante.unidad)}).
        </p>
      )}
      {i.estado === 'no_alcanza' && i.faltantes.length > 0 && <Faltantes items={i.faltantes} />}
      {i.estado === 'no_calculable' && i.motivo && <p className="mt-1 text-xs text-gris-texto">{i.motivo}</p>}
      {/* Si la receta no se puede calcular, la lista de compra al uso saldría incompleta: no se muestra */}
      {i.estado !== 'no_calculable' && i.compra_al_uso.length > 0 && (
        <p className="mt-1 text-xs text-pizarra">
          Se compra para producir: {i.compra_al_uso.map((c) => `${c.nombre} (${formatoCantidad(c.por_lote, c.unidad)} por lote)`).join(', ')}.
        </p>
      )}
    </li>
  );
}

// Qué productos se pueden hacer con lo que hay hoy. Sin dinero: lo ven todos los roles.
export function QueProducir() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['produccion', 'que-producir'], queryFn: getQueProducir });
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [verTodas, setVerTodas] = useState(false);

  const items = data?.items ?? [];
  const cuenta = (f: Filtro) => (f === 'todas' ? items.length : items.filter((i) => i.estado === f).length);
  const filtradas = items.filter((i) => filtro === 'todas' || i.estado === filtro);
  const visibles = verTodas ? filtradas : filtradas.slice(0, INICIAL);

  return (
    <section className="flex flex-col gap-3 rounded-tarjeta border border-linea bg-tabla p-4 sm:p-5" aria-label="Qué se puede producir">
      <div>
        <h2 className="font-display text-lg font-semibold text-azul-noche">Qué se puede producir hoy</h2>
        <p className="text-sm text-gris-texto">Con las existencias vigentes (los lotes vencidos no cuentan).</p>
      </div>
      {isLoading && <LoadingState mensaje="Calculando..." />}
      {isError && <ErrorState onReintentar={() => refetch()} />}
      {data && (
        <>
          {data.resumen.pueden === 0 && data.resumen.no_alcanzan > 0 && (
            <Alert variant="warning">
              Con las existencias de hoy no alcanza para un lote de ninguna receta. Revisa o registra entradas en{' '}
              <Link to="/inventario" className="font-semibold underline">Existencias</Link>.
            </Alert>
          )}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por resultado">
            {(['todas', 'puede', 'no_alcanza', 'no_calculable'] as const).filter((f) => f === 'todas' || cuenta(f) > 0).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filtro === f}
                onClick={() => { setFiltro(f); setVerTodas(false); }}
                className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors ${filtro === f ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-white text-azul-noche hover:bg-arena'}`}
              >
                {ETIQUETA_FILTRO[f]}
                <span className="cifras text-xs opacity-80">{cuenta(f)}</span>
              </button>
            ))}
          </div>
          <ul className="grid gap-2 lg:grid-cols-2">
            {visibles.map((i) => (
              <Fila key={i.formulacion_id} i={i} />
            ))}
          </ul>
          {filtradas.length > INICIAL && (
            <button type="button" onClick={() => setVerTodas((v) => !v)} className="min-h-11 w-fit text-sm font-semibold text-pizarra hover:underline">
              {verTodas ? 'Ver menos' : `Ver las ${filtradas.length} recetas`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
