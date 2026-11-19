import { useMemo, useState } from 'react';
import { CalendarClock, ChevronRight, MapPin, Pencil, Phone, Power, RotateCcw, Search, Tag, TriangleAlert, Truck, User, Users, X } from 'lucide-react';
import { Esqueleto } from '../../components/feedback/Esqueleto';
import { Button } from '../../components/ui/Button';
import type { Proveedor } from '../../types/proveedor.types';
import { NOMBRE_DIA, ORDEN_SEMANA } from '../reposicion/etiquetas';

const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const INICIAL_DIA: Record<number, string> = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };
const sinTildes = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export interface AccionesProveedor {
  onVerOferta: (p: Proveedor) => void;
  onEntrega: (p: Proveedor) => void;
  onEditar: (p: Proveedor) => void;
  onDesactivar: (p: Proveedor) => void;
  onReactivar: (p: Proveedor) => void;
  ocupado: boolean;
}

type Filtro = 'todos' | 'sin-calendario' | 'grupo';

function Tarjeta({ p, acciones }: { p: Proveedor; acciones: AccionesProveedor }) {
  const soloConsulta = p.alcance === 'grupo';
  const sinCalendario = p.dias_entrega.length === 0;
  const boton =
    'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde-campo bg-white px-3 text-sm font-semibold text-azul-noche transition-colors hover:bg-arena disabled:cursor-not-allowed disabled:opacity-50';
  const hayContacto = p.contacto || p.telefono || p.direccion;
  return (
    <li className={`flex animate-entra flex-col gap-4 rounded-tarjeta border border-linea p-4 sm:p-5 ${p.activo ? 'bg-tabla' : 'bg-hueso/60'}`}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`grid size-12 shrink-0 place-items-center rounded-lg font-display text-xl font-semibold ${p.activo ? 'bg-verde-suave text-verde-bosque' : 'bg-arena text-gris-texto'}`}
        >
          {p.nombre.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={`text-base font-semibold leading-tight ${p.activo ? 'text-grafito' : 'text-gris-texto'}`}>{p.nombre}</h3>
          <p className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            {!p.activo && <span className="rounded-full bg-arena px-2 py-0.5 text-grafito">Inactivo</span>}
            {soloConsulta && (
              <span className="inline-flex items-center gap-1 rounded-full bg-info-fondo px-2 py-0.5 text-pizarra">
                <Users size={11} aria-hidden="true" />
                Del grupo · solo consulta
              </span>
            )}
          </p>
        </div>
      </div>

      {hayContacto ? (
        <ul className="flex flex-col gap-1.5 text-sm text-grafito">
          {p.contacto && (
            <li className="flex items-center gap-2">
              <User size={15} aria-hidden="true" className="shrink-0 text-gris-texto" />
              {p.contacto}
            </li>
          )}
          {p.telefono && (
            <li className="flex items-center gap-2">
              <Phone size={15} aria-hidden="true" className="shrink-0 text-gris-texto" />
              <a href={`tel:${p.telefono.replace(/\s+/g, '')}`} className="font-medium text-pizarra hover:underline">
                {p.telefono}
              </a>
            </li>
          )}
          {p.direccion && (
            <li className="flex items-start gap-2">
              <MapPin size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-gris-texto" />
              {p.direccion}
            </li>
          )}
        </ul>
      ) : (
        <p className="text-sm text-gris-texto">Sin datos de contacto.</p>
      )}

      {/* Calendario de entrega: los días que llega el pedido, de un vistazo */}
      <div className={`rounded-lg border p-3 ${sinCalendario ? 'border-[#f1d9a6] bg-atencion-fondo' : 'border-linea bg-white'}`}>
        <div className="flex items-center justify-between gap-2">
          <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${sinCalendario ? 'text-atencion-texto' : 'text-gris-texto'}`}>
            {sinCalendario ? <TriangleAlert size={13} aria-hidden="true" /> : <Truck size={13} aria-hidden="true" />}
            Entrega
          </p>
          {sinCalendario && !soloConsulta && (
            <button type="button" onClick={() => acciones.onEntrega(p)} className="text-xs font-semibold text-atencion-texto underline">
              Definir días
            </button>
          )}
        </div>
        <ol className="mt-2 flex gap-1.5" aria-label="Días de entrega">
          {ORDEN_SEMANA.map((d) => {
            const entrega = p.dias_entrega.includes(d);
            return (
              <li
                key={d}
                title={NOMBRE_DIA[d]}
                className={`grid size-8 place-items-center rounded-full text-xs font-bold ${entrega ? 'bg-verde-bosque text-white' : 'bg-arena text-gris-texto'}`}
              >
                <span aria-hidden="true">{INICIAL_DIA[d]}</span>
                <span className="sr-only">
                  {NOMBRE_DIA[d]}: {entrega ? 'entrega' : 'no entrega'}
                </span>
              </li>
            );
          })}
        </ol>
        {(p.hora_limite_pedido || p.pedido_minimo !== null) && (
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gris-texto">
            {p.hora_limite_pedido && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock size={13} aria-hidden="true" />
                Pedir antes de las {p.hora_limite_pedido.slice(0, 5)}
              </span>
            )}
            {p.pedido_minimo !== null && <span>Pedido mínimo {pesos.format(p.pedido_minimo)}</span>}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => acciones.onVerOferta(p)}
        className="group flex min-h-11 items-center justify-between gap-2 rounded-lg bg-azul-suave px-3 text-left text-sm font-semibold text-azul-noche transition-colors hover:bg-niebla"
      >
        <span className="inline-flex items-center gap-2">
          <Tag size={16} aria-hidden="true" />
          {p.ofertas_vigentes === 0 ? 'Oferta y precios' : p.ofertas_vigentes === 1 ? '1 precio vigente' : `${p.ofertas_vigentes} precios vigentes`}
        </span>
        <span className="inline-flex items-center gap-0.5 text-pizarra">
          Ver oferta
          <ChevronRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>

      {!soloConsulta && (
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-linea pt-3">
          <button type="button" className={boton} disabled={acciones.ocupado} onClick={() => acciones.onEditar(p)}>
            <Pencil size={15} aria-hidden="true" />
            Editar
          </button>
          <button type="button" className={boton} disabled={acciones.ocupado} onClick={() => acciones.onEntrega(p)}>
            <Truck size={15} aria-hidden="true" />
            Entrega
          </button>
          {p.activo ? (
            <button
              type="button"
              disabled={acciones.ocupado}
              onClick={() => acciones.onDesactivar(p)}
              aria-label={`Desactivar ${p.nombre}`}
              title="Desactivar"
              className="ml-auto grid size-11 place-items-center rounded-lg border border-critico-texto/30 bg-white text-critico-texto transition-colors hover:bg-critico-fondo disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Power size={16} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              disabled={acciones.ocupado}
              onClick={() => acciones.onReactivar(p)}
              className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-exito-texto/30 bg-white px-3 text-sm font-semibold text-exito-texto transition-colors hover:bg-exito-fondo disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw size={15} aria-hidden="true" />
              Reactivar
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// Buscador, filtros y proveedores como tarjetas
export function ListaProveedores({ proveedores, cargando, acciones }: { proveedores: Proveedor[] | undefined; cargando: boolean; acciones: AccionesProveedor }) {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  const base = useMemo(() => (mostrarInactivos ? (proveedores ?? []) : (proveedores ?? []).filter((p) => p.activo)), [proveedores, mostrarInactivos]);
  const conBusqueda = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    return base.filter((p) => !q || sinTildes(`${p.nombre} ${p.contacto ?? ''} ${p.telefono ?? ''}`).includes(q));
  }, [base, busqueda]);

  const nSinCalendario = conBusqueda.filter((p) => p.activo && p.dias_entrega.length === 0).length;
  const nGrupo = conBusqueda.filter((p) => p.alcance === 'grupo').length;
  const visibles = useMemo(
    () =>
      conBusqueda
        .filter((p) => (filtro === 'sin-calendario' ? p.activo && p.dias_entrega.length === 0 : filtro === 'grupo' ? p.alcance === 'grupo' : true))
        .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es')),
    [conBusqueda, filtro],
  );

  const hayFiltros = busqueda.trim() !== '' || filtro !== 'todos';
  const quitar = () => {
    setBusqueda('');
    setFiltro('todos');
  };
  const chip = (activo: boolean) =>
    `inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors ${
      activo ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-white text-azul-noche hover:bg-arena'
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar por nombre, contacto o teléfono</span>
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-texto" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, contacto o teléfono"
            className="min-h-11 w-full rounded-lg border border-borde-campo bg-white pl-10 pr-3 text-sm text-grafito placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo"
          />
        </label>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-grafito">
          <button
            type="button"
            role="switch"
            aria-checked={mostrarInactivos}
            onClick={() => setMostrarInactivos((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trigo ${mostrarInactivos ? 'bg-azul-noche' : 'bg-borde-campo'}`}
          >
            <span aria-hidden="true" className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${mostrarInactivos ? 'translate-x-5' : ''}`} />
          </button>
          Mostrar inactivos
        </label>
        {hayFiltros && (
          <button type="button" onClick={quitar} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-pizarra hover:underline">
            <X size={15} aria-hidden="true" />
            Quitar filtros
          </button>
        )}
        {proveedores && base.length > 0 && (
          <p className="text-sm text-gris-texto sm:ml-auto" aria-live="polite">
            {visibles.length} de {base.length} {base.length === 1 ? 'proveedor' : 'proveedores'}
          </p>
        )}
      </div>

      {(nSinCalendario > 0 || nGrupo > 0) && (
        <div role="group" aria-label="Filtrar proveedores" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={filtro === 'todos'} onClick={() => setFiltro('todos')} className={chip(filtro === 'todos')}>
            Todos
            <span className="cifras text-xs opacity-80">{conBusqueda.length}</span>
          </button>
          {nSinCalendario > 0 && (
            <button
              type="button"
              aria-pressed={filtro === 'sin-calendario'}
              onClick={() => setFiltro(filtro === 'sin-calendario' ? 'todos' : 'sin-calendario')}
              className={`inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors ${
                filtro === 'sin-calendario' ? 'border-atencion-texto bg-atencion-texto text-white' : 'border-[#f1d9a6] bg-atencion-fondo text-atencion-texto hover:bg-[#f8e3b8]'
              }`}
            >
              <TriangleAlert size={15} aria-hidden="true" />
              Sin calendario de entrega
              <span className="cifras text-xs opacity-80">{nSinCalendario}</span>
            </button>
          )}
          {nGrupo > 0 && (
            <button type="button" aria-pressed={filtro === 'grupo'} onClick={() => setFiltro(filtro === 'grupo' ? 'todos' : 'grupo')} className={chip(filtro === 'grupo')}>
              <Users size={15} aria-hidden="true" />
              Del grupo
              <span className="cifras text-xs opacity-80">{nGrupo}</span>
            </button>
          )}
        </div>
      )}

      {cargando ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Cargando proveedores">
          <Esqueleto className="h-72" />
          <Esqueleto className="h-72" />
          <Esqueleto className="hidden h-72 xl:block" />
        </div>
      ) : base.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-tarjeta border border-linea bg-tabla px-4 py-12 text-center">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-verde-suave text-verde-bosque">
            <Truck size={28} />
          </span>
          <p className="font-display text-lg font-semibold text-azul-noche">Aún no hay proveedores</p>
          <p className="max-w-sm text-sm text-gris-texto">Registra a quién le compras los insumos para guardar sus precios y su calendario de entrega.</p>
        </div>
      ) : visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-tarjeta border border-linea bg-tabla px-4 py-12 text-center">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-arena text-gris-texto">
            <Search size={26} />
          </span>
          <p className="font-semibold text-azul-noche">Ningún proveedor coincide con lo que buscas</p>
          <Button type="button" variant="secondary" onClick={quitar}>
            Quitar filtros
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibles.map((p) => (
            <Tarjeta key={p.id} p={p} acciones={acciones} />
          ))}
        </ul>
      )}
    </div>
  );
}
