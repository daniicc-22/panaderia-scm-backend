import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { PageHeader } from '../components/layout/PageHeader';
import { BotonImprimir } from '../components/ui/BotonImprimir';
import { EmptyState } from '../components/feedback/EmptyState';
import { useAuth } from '../features/auth/useAuth';
import { formatoCantidad, formatoDinero, formatoFecha } from '../features/inventario/formatos';
import { getMiPanaderia } from '../services/panaderiaService';
import { getRecomendaciones } from '../services/reposicionService';

const num = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 2 });

// Orden de pedido de un proveedor, lista para imprimir o guardar en PDF y entregar o enviar.
// Sale de las recomendaciones de reposición; las observaciones se escriben aquí y se imprimen con la orden.
export function OrdenPedidoPage() {
  const { proveedorId } = useParams();
  const { usuario } = useAuth();
  const [notas, setNotas] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['reposicion', 'recomendaciones'], queryFn: getRecomendaciones });
  const panaderia = useQuery({ queryKey: ['mi-panaderia', usuario?.id], queryFn: getMiPanaderia, enabled: !!usuario, staleTime: 5 * 60 * 1000 });

  const pedido = data?.pedidos.find((p) => p.proveedor.id === proveedorId);
  const detalle = new Map((data?.items ?? []).map((i) => [i.materia_prima_id, i]));
  const lineas = [...(pedido?.items ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <div className="ficha-impresion flex flex-col gap-4">
      <PageHeader
        ocultarAlImprimir
        titulo="Orden de pedido"
        subtitulo={pedido ? pedido.proveedor.nombre : 'Reposición'}
        acciones={
          <>
            <Link
              to="/reposicion"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/40 px-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              <ArrowLeft size={16} aria-hidden="true" /> Volver
            </Link>
            {pedido && <BotonImprimir etiqueta="Imprimir orden" />}
          </>
        }
      />

      {isLoading && <LoadingState mensaje="Cargando el pedido..." />}
      {isError && <ErrorState onReintentar={() => refetch()} />}
      {data && !pedido && <EmptyState titulo="Pedido no encontrado" mensaje="Ese proveedor ya no tiene un pedido pendiente. Vuelve a Reposición para ver el cálculo de hoy." />}

      {data && pedido && (
        <article className="mx-auto w-full max-w-3xl rounded-tarjeta border border-linea bg-white p-6 sm:p-8 print:max-w-none print:border-0 print:p-0">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-grafito pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gris-texto">{panaderia.data?.nombre ?? ''}</p>
              <h2 className="font-display text-2xl font-semibold text-azul-noche">Orden de pedido</h2>
            </div>
            <p className="text-right text-sm text-gris-texto">
              Fecha: <span className="font-medium text-grafito">{formatoFecha(data.fecha)}</span>
            </p>
          </header>

          <dl className="mt-4 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex gap-2"><dt className="text-gris-texto">Proveedor:</dt><dd className="font-medium text-grafito">{pedido.proveedor.nombre}</dd></div>
            {pedido.fecha_limite_pedido && <div className="flex gap-2"><dt className="text-gris-texto">Pedir a más tardar:</dt><dd className="font-medium text-grafito">{formatoFecha(pedido.fecha_limite_pedido)}</dd></div>}
            {pedido.proxima_entrega && <div className="flex gap-2"><dt className="text-gris-texto">Entrega esperada:</dt><dd className="font-medium text-grafito">{formatoFecha(pedido.proxima_entrega)}</dd></div>}
          </dl>

          <table className="mt-5 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-grafito text-left text-xs uppercase tracking-wide text-azul-noche">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Insumo</th>
                <th className="py-2 pr-2">Presentación</th>
                <th className="py-2 pr-2 text-right">Cantidad</th>
                <th className="py-2 pr-2 text-right">Total</th>
                <th className="py-2 text-right">Valor estimado</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, n) => {
                const d = detalle.get(l.materia_prima_id);
                return (
                  <tr key={l.materia_prima_id} className="border-b border-linea align-top">
                    <td className="cifras py-1.5 pr-2 text-gris-texto">{n + 1}</td>
                    <td className="py-1.5 pr-2 text-grafito">{l.nombre}</td>
                    <td className="py-1.5 pr-2 text-gris-texto">{d?.presentacion ?? '—'}</td>
                    <td className="cifras py-1.5 pr-2 text-right font-semibold text-grafito">{num(l.presentaciones)}</td>
                    <td className="cifras py-1.5 pr-2 text-right text-gris-texto">{d ? formatoCantidad(d.cantidad_recomendada, d.unidad) : '—'}</td>
                    <td className="cifras py-1.5 text-right text-grafito">{formatoDinero(l.valor)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="pt-3 text-right text-sm font-semibold text-azul-noche">Total estimado</td>
                <td className="cifras pt-3 text-right font-display text-lg font-semibold text-azul-noche">{formatoDinero(pedido.costos.total)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-1 text-right text-xs text-gris-texto">Los valores son estimados con el último precio registrado.</p>

          <div className="mt-6">
            <label htmlFor="orden-notas" className="text-sm font-medium text-grafito print:hidden">Observaciones (se imprimen con la orden)</label>
            <textarea
              id="orden-notas"
              rows={3}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Por ejemplo: entregar en la mañana, confirmar precios antes de despachar..."
              className="mt-1 w-full rounded-md border border-borde-campo px-3 py-2 text-base focus:outline-hidden focus:ring-2 focus:ring-trigo sm:text-sm print:hidden"
            />
            {notas.trim() !== '' && (
              <div className="hidden print:block">
                <p className="text-xs font-semibold uppercase tracking-wide text-gris-texto">Observaciones</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-grafito">{notas}</p>
              </div>
            )}
          </div>

          <div className="mt-10 hidden grid-cols-2 gap-10 text-xs text-gris-texto print:grid">
            {['Elaboró', 'Aprobó'].map((rol) => (
              <div key={rol} className="border-t border-grafito pt-1.5">
                <p className="font-semibold text-grafito">{rol}</p>
                <p>Nombre y firma</p>
              </div>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}
