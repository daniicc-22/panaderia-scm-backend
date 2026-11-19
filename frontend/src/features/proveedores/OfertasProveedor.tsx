import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Pencil, Plus, Tag } from 'lucide-react';
import { ErrorState } from '../../components/feedback/ErrorState';
import { LoadingState } from '../../components/feedback/LoadingState';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { getOfertasProveedor } from '../../services/proveedoresService';
import { editarOferta } from '../../services/preciosService';
import { mensajeDeError } from '../../services/errores';
import type { OfertaProveedor } from '../../types/proveedor.types';
import { formatoPesos, leerNumero } from '../precios/numeros';
import { NuevoPrecioProveedor } from './NuevoPrecioProveedor';
import { useRefrescarPrecios } from './refrescarPrecios';

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
  if (!o.cuenta) return <span className="text-gris-texto">—</span>;
  if (o.mejor_precio) {
    return o.otros_proveedores === 0 ? (
      <span className="text-gris-texto">Único proveedor</span>
    ) : (
      <Badge color="green">Mejor precio</Badge>
    );
  }
  return (
    <span className={`font-medium ${o.sobre_mejor_pct !== null && o.sobre_mejor_pct >= 10 ? 'text-critico-texto' : 'text-atencion-texto'}`}>
      +{o.sobre_mejor_pct !== null ? pct(o.sobre_mejor_pct) : '—'} sobre el mejor
    </span>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-lg border border-linea bg-white px-3 py-2.5">
      <p className="text-xs font-medium text-gris-texto">{etiqueta}</p>
      <p className="cifras font-display text-xl font-semibold text-azul-noche">{valor}</p>
    </div>
  );
}

const campo =
  'min-h-11 w-full rounded-lg border border-borde-campo bg-white px-3 text-sm text-grafito placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo';

// Cambia el precio y la entrega de una oferta, o la deja de usar, sin salir de la lista
function EditarOferta({ o, onTerminar }: { o: OfertaProveedor; onTerminar: () => void }) {
  const refrescar = useRefrescarPrecios();
  const [precio, setPrecio] = useState(String(o.precio));
  const [entrega, setEntrega] = useState(o.tiempo_entrega_dias === null ? '' : String(o.tiempo_entrega_dias));
  const [error, setError] = useState<string | null>(null);

  const cambiar = useMutation({
    mutationFn: (cambios: { precio_referencia?: number; tiempo_entrega_dias?: number | null; vigente?: boolean }) => editarOferta(o.oferta_id, cambios),
    onSuccess: async () => {
      await refrescar();
      onTerminar();
    },
    onError: (e) => setError(mensajeDeError(e, 'No se pudo guardar el cambio.')),
  });

  const nuevo = leerNumero(precio);
  const variacion = nuevo !== null && nuevo > 0 && o.precio > 0 ? ((nuevo - o.precio) / o.precio) * 100 : null;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const d = entrega.trim() === '' ? null : leerNumero(entrega);
    if (nuevo === null || nuevo <= 0) return setError('El precio debe ser un número mayor que 0 (usa coma o punto para decimales, sin separador de miles).');
    if (entrega.trim() !== '' && (d === null || d > 365)) return setError('La entrega debe ser de 0 a 365 días.');
    cambiar.mutate({ precio_referencia: nuevo, tiempo_entrega_dias: d });
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-3 rounded-lg border border-linea bg-hueso p-3" noValidate>
      <p className="text-sm font-semibold text-grafito">
        {o.materia} · {o.presentacion}
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs font-semibold text-grafito">
          Precio
          <span className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gris-texto">
              $
            </span>
            <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" autoFocus className={`${campo} cifras pl-8`} />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-grafito">
          Entrega, en días
          <input value={entrega} onChange={(e) => setEntrega(e.target.value)} inputMode="decimal" placeholder="Opcional" className={`${campo} cifras`} />
        </label>
        {variacion !== null && Math.abs(variacion) >= 0.05 && (
          <p className={`cifras pb-2.5 text-sm font-bold ${variacion > 0 ? 'text-critico-texto' : 'text-exito-texto'}`}>
            {variacion > 0 ? '▲ +' : '▼ '}
            {pct(variacion)}
          </p>
        )}
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" isLoading={cambiar.isPending}>
          <Check size={16} aria-hidden="true" />
          Guardar
        </Button>
        <Button type="button" variant="secondary" onClick={onTerminar} disabled={cambiar.isPending}>
          Cancelar
        </Button>
        <button
          type="button"
          disabled={cambiar.isPending}
          onClick={() => cambiar.mutate({ vigente: !o.vigente })}
          className="ml-auto min-h-11 text-sm font-semibold text-pizarra hover:underline disabled:opacity-50"
        >
          {o.vigente ? 'Dejar de usar este precio' : 'Volver a usar este precio'}
        </button>
      </div>
    </form>
  );
}

// Lo que ofrece un proveedor: presentaciones, precios y cómo se comparan con los demás proveedores del insumo
export function OfertasProveedor({ proveedorId, puedeEditar = true }: { proveedorId: string; puedeEditar?: boolean }) {
  // Cuelga de 'precios' para refrescarse cuando se cambia un precio desde Materias primas
  const consulta = useQuery({ queryKey: ['precios', 'proveedor', proveedorId], queryFn: () => getOfertasProveedor(proveedorId) });
  const [busqueda, setBusqueda] = useState('');
  const [soloCuentan, setSoloCuentan] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (consulta.data?.items ?? []).filter(
      (o) => (!soloCuentan || o.cuenta) && (!texto || o.materia.toLowerCase().includes(texto) || o.presentacion.toLowerCase().includes(texto)),
    );
  }, [consulta.data, busqueda, soloCuentan]);

  if (consulta.isLoading) return <LoadingState mensaje="Cargando oferta..." />;
  if (consulta.isError || !consulta.data) return <ErrorState onReintentar={() => consulta.refetch()} />;

  const { resumen, items, proveedor } = consulta.data;
  // Los proveedores del grupo y los inactivos solo se consultan
  const editable = puedeEditar && proveedor.alcance === 'panaderia' && proveedor.activo;

  const botonAgregar = editable && !agregando && (
    <Button type="button" onClick={() => setAgregando(true)}>
      <Plus size={16} aria-hidden="true" />
      Agregar precio
    </Button>
  );

  const formularioNuevo = agregando && <NuevoPrecioProveedor proveedorId={proveedorId} nombreProveedor={proveedor.nombre} onTerminar={() => setAgregando(false)} />;

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {formularioNuevo || (
          <div className="flex flex-col items-center gap-3 rounded-tarjeta border border-linea bg-tabla px-4 py-10 text-center">
            <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-azul-suave text-azul-noche">
              <Tag size={26} />
            </span>
            <p className="font-display text-lg font-semibold text-azul-noche">{proveedor.nombre} aún no tiene precios</p>
            <p className="max-w-sm text-sm text-gris-texto">Registra lo que cobra por cada insumo para que cuente en los costos y en las compras sugeridas.</p>
            {botonAgregar}
          </div>
        )}
      </div>
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

      {formularioNuevo}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar insumo"
          className="min-h-11 w-full rounded-lg border border-borde-campo bg-white px-3 py-2 text-base placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo sm:max-w-xs sm:text-sm"
        />
        <button
          type="button"
          aria-pressed={soloCuentan}
          onClick={() => setSoloCuentan((v) => !v)}
          className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors ${soloCuentan ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-white text-azul-noche hover:bg-arena'}`}
        >
          Solo las que cuentan en los costos
        </button>
        <span className="sm:ml-auto">{botonAgregar}</span>
      </div>

      {filtradas.length === 0 ? (
        <p className="text-sm text-gris-texto">Ningún precio coincide con el filtro.</p>
      ) : (
        <>
          {/* Pantallas grandes: tabla para comparar de un vistazo */}
          <div className="hidden overflow-x-auto rounded-lg border border-linea md:block">
            <table className="min-w-full divide-y divide-linea text-sm">
              <thead className="bg-arena/60 text-left text-xs font-bold uppercase tracking-wide text-gris-texto">
                <tr>
                  <th className="px-3 py-3">Insumo</th>
                  <th className="px-3 py-2">Presentación</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Costo por unidad</th>
                  <th className="px-3 py-2">Entrega</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Frente a otros</th>
                  {editable && <th className="px-3 py-2">
                    <span className="sr-only">Acciones</span>
                  </th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-linea bg-tabla">
                {filtradas.map((o) => (
                  <Fragment key={o.oferta_id}>
                    <tr className={o.cuenta ? (o.mejor_precio && o.otros_proveedores > 0 ? 'bg-exito-fondo/40' : '') : 'text-gris-texto'}>
                      <td className="px-3 py-2 font-medium text-grafito">{o.materia}</td>
                      <td className="px-3 py-2">
                        {o.presentacion} <span className="text-gris-texto">({contenidoLegible(o)})</span>
                      </td>
                      <td className="cifras px-3 py-2 text-right font-semibold">{formatoPesos.format(o.precio)}</td>
                      <td className="cifras px-3 py-2 text-right">{costoLegible(o)}</td>
                      <td className="px-3 py-2">{o.tiempo_entrega_dias !== null ? `${numero.format(o.tiempo_entrega_dias)} d` : '—'}</td>
                      <td className="px-3 py-2">
                        <Estado o={o} />
                      </td>
                      <td className="px-3 py-2">
                        <Comparacion o={o} />
                      </td>
                      {editable && (
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => setEditandoId(editandoId === o.oferta_id ? null : o.oferta_id)}
                            aria-expanded={editandoId === o.oferta_id}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-borde-campo bg-white px-3 text-sm font-semibold text-azul-noche hover:bg-arena"
                          >
                            <Pencil size={14} aria-hidden="true" />
                            Cambiar
                          </button>
                        </td>
                      )}
                    </tr>
                    {editable && editandoId === o.oferta_id && (
                      <tr>
                        <td colSpan={8} className="bg-white p-3">
                          <EditarOferta o={o} onTerminar={() => setEditandoId(null)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: una tarjeta por oferta */}
          <ul className="flex flex-col gap-2 md:hidden">
            {filtradas.map((o) => (
              <li key={o.oferta_id} className={`rounded-tarjeta border border-linea bg-tabla p-3 ${o.cuenta ? '' : 'opacity-70'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-grafito">{o.materia}</p>
                    <p className="text-xs text-gris-texto">
                      {o.presentacion} ({contenidoLegible(o)})
                    </p>
                  </div>
                  <Estado o={o} />
                </div>
                <p className="cifras mt-1 text-lg font-semibold text-grafito">{formatoPesos.format(o.precio)}</p>
                <p className="text-sm text-gris-texto">
                  {costoLegible(o)}
                  {o.tiempo_entrega_dias !== null ? ` · Entrega ${numero.format(o.tiempo_entrega_dias)} d` : ''}
                </p>
                <p className="mt-1 text-sm">
                  <Comparacion o={o} />
                </p>
                {editable &&
                  (editandoId === o.oferta_id ? (
                    <div className="mt-3">
                      <EditarOferta o={o} onTerminar={() => setEditandoId(null)} />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditandoId(o.oferta_id)}
                      className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde-campo bg-white px-3 text-sm font-semibold text-azul-noche hover:bg-arena"
                    >
                      <Pencil size={14} aria-hidden="true" />
                      Cambiar precio
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="text-xs text-gris-texto">
        «Precio aplicado» es el que usan hoy los costos del insumo: la presentación de mayor contenido y, dentro de ella, el menor precio.
        «Frente a otros» compara el costo por unidad con los demás proveedores. También puedes editar los precios de cada insumo en{' '}
        <Link to="/materias-primas" className="font-medium text-pizarra hover:underline">
          Materias primas
        </Link>
        .
      </p>
    </div>
  );
}
