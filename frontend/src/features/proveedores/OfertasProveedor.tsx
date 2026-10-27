import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '../../components/feedback/ErrorState';
import { LoadingState } from '../../components/feedback/LoadingState';
import { Badge } from '../../components/ui/Badge';
import { getOfertasProveedor } from '../../services/proveedoresService';
import type { OfertaProveedor } from '../../types/proveedor.types';
import { formatoPesos } from '../precios/numeros';

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });
const pct = (n: number) => `${n.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;

// El costo base está por gramo: por kilo se lee mucho mejor
function costoLegible(o: OfertaProveedor): string {
  if (o.costo_por_unidad_base === null) return '—';
  if (o.unidad === 'g') return `${formatoPesos.format(o.costo_por_unidad_base * 1000)} / kg`;
  return `${formatoPesos.format(o.costo_por_unidad_base)} / ${o.unidad}`;
}

function contenidoLegible(o: OfertaProveedor): string {
  if (o.unidad === 'g' && o.contenido >= 1000) return `${numero.format(o.contenido / 1000)} kg`;
  return `${numero.format(o.contenido)} ${o.unidad}`;
}

function motivoNoCuenta(o: OfertaProveedor): string {
  if (!o.vigente) return 'No vigente';
  if (!o.presentacion_activa) return 'Presentación inactiva';
  if (o.precio <= 0) return 'Sin precio';
  return 'No cuenta';
}

function Estado({ o }: { o: OfertaProveedor }) {
  if (o.aplicado) return <Badge color="green">Precio aplicado</Badge>;
  if (o.cuenta) return <Badge color="gray">Disponible</Badge>;
  return <Badge color="yellow">{motivoNoCuenta(o)}</Badge>;
}

function Comparacion({ o }: { o: OfertaProveedor }) {
  if (!o.cuenta) return <span className="text-gray-400">—</span>;
  if (o.mejor_precio) {
    return o.otros_proveedores === 0 ? (
      <span className="text-gray-500">Único proveedor</span>
    ) : (
      <Badge color="green">Mejor precio</Badge>
    );
  }
  return (
    <span className={`font-medium ${o.sobre_mejor_pct !== null && o.sobre_mejor_pct >= 10 ? 'text-red-700' : 'text-yellow-700'}`}>
      +{o.sobre_mejor_pct !== null ? pct(o.sobre_mejor_pct) : '—'} sobre el mejor
    </span>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{etiqueta}</p>
      <p className="text-lg font-semibold text-gray-900">{valor}</p>
    </div>
  );
}

// Lo que ofrece un proveedor: presentaciones, precios y cómo se comparan con los demás proveedores del insumo
export function OfertasProveedor({ proveedorId }: { proveedorId: string }) {
  // Cuelga de 'precios' para refrescarse cuando se cambia un precio desde Materias primas
  const consulta = useQuery({ queryKey: ['precios', 'proveedor', proveedorId], queryFn: () => getOfertasProveedor(proveedorId) });
  const [busqueda, setBusqueda] = useState('');
  const [soloCuentan, setSoloCuentan] = useState(false);

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (consulta.data?.items ?? []).filter(
      (o) => (!soloCuentan || o.cuenta) && (!texto || o.materia.toLowerCase().includes(texto) || o.presentacion.toLowerCase().includes(texto)),
    );
  }, [consulta.data, busqueda, soloCuentan]);

  if (consulta.isLoading) return <LoadingState mensaje="Cargando oferta..." />;
  if (consulta.isError || !consulta.data) return <ErrorState onReintentar={() => consulta.refetch()} />;

  const { resumen, items, proveedor } = consulta.data;

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        {proveedor.nombre} todavía no tiene precios registrados. Agrégalos desde{' '}
        <Link to="/materias-primas" className="font-medium text-blue-600 hover:underline">
          Materias primas
        </Link>
        , en la sección de precios de cada insumo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Dato etiqueta="Insumos y presentaciones" valor={String(resumen.ofertas)} />
        <Dato etiqueta="Cuentan en los costos" valor={`${resumen.cuentan} de ${resumen.ofertas}`} />
        <Dato etiqueta="Mejor precio" valor={String(resumen.mejor_precio)} />
        <Dato etiqueta="Entrega promedio" valor={resumen.entrega_promedio_dias !== null ? `${numero.format(resumen.entrega_promedio_dias)} días` : '—'} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar insumo"
          className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-base sm:max-w-xs sm:text-sm"
        />
        <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={soloCuentan} onChange={(e) => setSoloCuentan(e.target.checked)} />
          Solo las que cuentan en los costos
        </label>
      </div>

      {filtradas.length === 0 ? (
        <p className="text-sm text-gray-500">Ningún precio coincide con el filtro.</p>
      ) : (
        <>
          {/* Pantallas grandes: tabla para comparar de un vistazo */}
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 md:block">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Insumo</th>
                  <th className="px-3 py-2">Presentación</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Costo por unidad</th>
                  <th className="px-3 py-2">Entrega</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Frente a otros</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtradas.map((o) => (
                  <tr key={o.oferta_id} className={o.cuenta ? '' : 'text-gray-400'}>
                    <td className="px-3 py-2 font-medium text-gray-900">{o.materia}</td>
                    <td className="px-3 py-2">
                      {o.presentacion} <span className="text-gray-500">({contenidoLegible(o)})</span>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatoPesos.format(o.precio)}</td>
                    <td className="px-3 py-2 text-right">{costoLegible(o)}</td>
                    <td className="px-3 py-2">{o.tiempo_entrega_dias !== null ? `${numero.format(o.tiempo_entrega_dias)} d` : '—'}</td>
                    <td className="px-3 py-2">
                      <Estado o={o} />
                    </td>
                    <td className="px-3 py-2">
                      <Comparacion o={o} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: una tarjeta por oferta */}
          <ul className="flex flex-col gap-2 md:hidden">
            {filtradas.map((o) => (
              <li key={o.oferta_id} className={`rounded-lg border border-gray-200 bg-white p-3 ${o.cuenta ? '' : 'opacity-70'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">{o.materia}</p>
                    <p className="text-xs text-gray-500">
                      {o.presentacion} ({contenidoLegible(o)})
                    </p>
                  </div>
                  <Estado o={o} />
                </div>
                <p className="mt-1 text-lg font-semibold text-gray-900">{formatoPesos.format(o.precio)}</p>
                <p className="text-sm text-gray-600">
                  {costoLegible(o)}
                  {o.tiempo_entrega_dias !== null ? ` · Entrega ${numero.format(o.tiempo_entrega_dias)} d` : ''}
                </p>
                <p className="mt-1 text-sm">
                  <Comparacion o={o} />
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="text-xs text-gray-500">
        «Precio aplicado» es el que usan hoy los costos del insumo: la presentación de mayor contenido y, dentro de ella, el menor precio.
        «Frente a otros» compara el costo por unidad con los demás proveedores. Para cambiar precios, abre el insumo en{' '}
        <Link to="/materias-primas" className="font-medium text-blue-600 hover:underline">
          Materias primas
        </Link>
        .
      </p>
    </div>
  );
}
