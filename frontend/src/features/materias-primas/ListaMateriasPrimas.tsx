import { useMemo, useState } from 'react';
import { Clock, Package, Pencil, Power, RotateCcw, Search, Tag, TriangleAlert, X } from 'lucide-react';
import { Esqueleto } from '../../components/feedback/Esqueleto';
import { Button } from '../../components/ui/Button';
import type { MateriaPrima } from '../../types/materiaPrima.types';

const formatoPrecio = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const formatoCosto = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface AccionesMateria {
  onEditar: (m: MateriaPrima) => void;
  onPrecios: (m: MateriaPrima) => void;
  onDesactivar: (m: MateriaPrima) => void;
  onReactivar: (m: MateriaPrima) => void;
  ocupado: boolean;
}

interface Props {
  materias: MateriaPrima[] | undefined;
  cargando: boolean;
  verPrecios: boolean;
  // Solo gestión ve inactivas y puede editar; el operario consulta
  puedeGestionar: boolean;
  acciones: AccionesMateria | null;
}

// Cada categoría tiene su color; el texto siempre dice cuál es
const TINTES = [
  { avatar: 'bg-azul-suave text-azul-noche', punto: 'bg-azul-noche' },
  { avatar: 'bg-trigo-suave text-atencion-texto', punto: 'bg-trigo' },
  { avatar: 'bg-verde-suave text-verde-bosque', punto: 'bg-verde-bosque' },
  { avatar: 'bg-terracota-suave text-terracota', punto: 'bg-terracota' },
];
const tinte = (categoria: string) => TINTES[[...categoria].reduce((s, c) => s + c.charCodeAt(0), 0) % TINTES.length];

const sinTildes = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const faltaPrecio = (m: MateriaPrima) => m.presentaciones.length === 0 || m.presentaciones.some((p) => p.precio == null);

// Una columna extra por el costo y otra por las acciones, según el rol
const COLUMNAS: Record<string, string> = {
  '00': 'lg:grid-cols-[auto_minmax(0,1fr)]',
  '10': 'lg:grid-cols-[auto_minmax(0,1fr)_9.5rem]',
  '01': 'lg:grid-cols-[auto_minmax(0,1fr)_auto]',
  '11': 'lg:grid-cols-[auto_minmax(0,1fr)_9.5rem_auto]',
};

function Fila({ m, verPrecios, acciones }: { m: MateriaPrima; verPrecios: boolean; acciones: AccionesMateria | null }) {
  const t = tinte(m.categoria ?? 'Sin categoría');
  const costo = m.presentaciones[0]?.costo_por_unidad_base;
  const sinPrecio = verPrecios && m.activa && faltaPrecio(m);
  const boton =
    'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde-campo bg-white px-3 text-sm font-semibold text-azul-noche transition-colors hover:bg-arena disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <li className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 p-4 ${COLUMNAS[`${verPrecios ? 1 : 0}${acciones ? 1 : 0}`]} ${m.activa ? '' : 'bg-hueso/60'}`}>
      <span
        aria-hidden="true"
        className={`grid size-11 shrink-0 place-items-center rounded-lg font-display text-lg font-semibold ${m.activa ? t.avatar : 'bg-arena text-gris-texto'}`}
      >
        {m.nombre.charAt(0).toUpperCase()}
      </span>

      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`text-base font-semibold ${m.activa ? 'text-grafito' : 'text-gris-texto'}`}>{m.nombre}</span>
          <span className="cifras text-xs font-medium text-gris-texto">{m.codigo}</span>
          {!m.activa && <span className="rounded-full bg-arena px-2 py-0.5 text-[11px] font-semibold text-grafito">Inactiva</span>}
          {!m.controla_inventario && <span className="rounded-full bg-info-fondo px-2 py-0.5 text-[11px] font-semibold text-pizarra">Sin inventario</span>}
          {sinPrecio && (
            <span className="inline-flex items-center gap-1 rounded-full bg-atencion-fondo px-2 py-0.5 text-[11px] font-semibold text-atencion-texto">
              <TriangleAlert size={11} aria-hidden="true" />
              Falta precio
            </span>
          )}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {m.presentaciones.length === 0 && <span className="text-xs text-gris-texto">Sin presentaciones</span>}
          {m.presentaciones.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-linea bg-white px-2.5 py-0.5 text-xs font-medium text-grafito">
              <Package size={12} aria-hidden="true" className="text-gris-texto" />
              {p.nombre}
              {verPrecios && p.precio != null && <span className="cifras font-semibold"> · {formatoPrecio.format(p.precio)}</span>}
            </span>
          ))}
        </div>
        {(m.lead_time_dias != null || (m.criterio_rotacion && m.criterio_rotacion !== 'ninguno')) && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-gris-texto">
            {m.lead_time_dias != null && (
              <span className="inline-flex items-center gap-1">
                <Clock size={13} aria-hidden="true" />
                Entrega en {m.lead_time_dias} {m.lead_time_dias === 1 ? 'día' : 'días'}
              </span>
            )}
            {m.criterio_rotacion && m.criterio_rotacion !== 'ninguno' && <span>Rotación {m.criterio_rotacion}</span>}
          </p>
        )}
      </div>

      {verPrecios && (
        <div className="col-span-2 lg:col-span-1 lg:text-right">
          {costo == null ? (
            <p className="text-sm text-gris-texto">Sin costo</p>
          ) : (
            <>
              <p className="cifras font-display text-xl font-semibold leading-tight text-azul-noche">{formatoCosto.format(costo)}</p>
              <p className="text-xs text-gris-texto">por {m.unidad}</p>
            </>
          )}
        </div>
      )}

      {acciones && (
        <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1 lg:justify-end">
          <button type="button" className={boton} disabled={acciones.ocupado} onClick={() => acciones.onEditar(m)}>
            <Pencil size={15} aria-hidden="true" />
            Editar
          </button>
          <button type="button" className={boton} disabled={acciones.ocupado} onClick={() => acciones.onPrecios(m)}>
            <Tag size={15} aria-hidden="true" />
            Precios
          </button>
          {m.activa ? (
            <button
              type="button"
              disabled={acciones.ocupado}
              onClick={() => acciones.onDesactivar(m)}
              aria-label={`Desactivar ${m.nombre}`}
              title="Desactivar"
              className="grid size-11 place-items-center rounded-lg border border-critico-texto/30 bg-white text-critico-texto transition-colors hover:bg-critico-fondo disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Power size={16} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              disabled={acciones.ocupado}
              onClick={() => acciones.onReactivar(m)}
              aria-label={`Reactivar ${m.nombre}`}
              title="Reactivar"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-exito-texto/30 bg-white px-3 text-sm font-semibold text-exito-texto transition-colors hover:bg-exito-fondo disabled:cursor-not-allowed disabled:opacity-50"
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

// Buscador, filtros por categoría y catálogo agrupado
export function ListaMateriasPrimas({ materias, cargando, verPrecios, puedeGestionar, acciones }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  const [soloSinPrecio, setSoloSinPrecio] = useState(false);
  const [mostrarInactivas, setMostrarInactivas] = useState(false);

  const base = useMemo(() => (mostrarInactivas ? (materias ?? []) : (materias ?? []).filter((m) => m.activa)), [materias, mostrarInactivas]);

  // Búsqueda y «falta precio» se aplican antes de contar, así los conteos de cada categoría son reales
  const conBusqueda = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    return base.filter((m) => (!soloSinPrecio || faltaPrecio(m)) && (!q || sinTildes(`${m.nombre} ${m.codigo}`).includes(q)));
  }, [base, busqueda, soloSinPrecio]);

  const categorias = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const m of base) cuenta.set(m.categoria ?? 'Sin categoría', cuenta.get(m.categoria ?? 'Sin categoría') ?? 0);
    for (const m of conBusqueda) cuenta.set(m.categoria ?? 'Sin categoría', (cuenta.get(m.categoria ?? 'Sin categoría') ?? 0) + 1);
    return [...cuenta.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [base, conBusqueda]);

  const filtradas = useMemo(() => conBusqueda.filter((m) => !categoria || (m.categoria ?? 'Sin categoría') === categoria), [conBusqueda, categoria]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, MateriaPrima[]>();
    for (const m of filtradas) {
      const c = m.categoria ?? 'Sin categoría';
      mapa.set(c, [...(mapa.get(c) ?? []), m]);
    }
    return [...mapa.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([nombre, lista]) => ({ nombre, lista: lista.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es')) }));
  }, [filtradas]);

  const sinPrecioN = verPrecios ? base.filter((m) => m.activa && faltaPrecio(m)).length : 0;
  const hayFiltros = busqueda.trim() !== '' || categoria !== '' || soloSinPrecio;
  const quitar = () => {
    setBusqueda('');
    setCategoria('');
    setSoloSinPrecio(false);
  };

  const chip = (activo: boolean) =>
    `inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors ${
      activo ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-white text-azul-noche hover:bg-arena'
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar por nombre o código</span>
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-texto" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código"
            className="min-h-11 w-full rounded-lg border border-borde-campo bg-white pl-10 pr-3 text-sm text-grafito placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo"
          />
        </label>
        {puedeGestionar && (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-grafito">
            <button
              type="button"
              role="switch"
              aria-checked={mostrarInactivas}
              onClick={() => setMostrarInactivas((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trigo ${mostrarInactivas ? 'bg-azul-noche' : 'bg-borde-campo'}`}
            >
              <span aria-hidden="true" className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${mostrarInactivas ? 'translate-x-5' : ''}`} />
            </button>
            Mostrar inactivas
          </label>
        )}
        {hayFiltros && (
          <button type="button" onClick={quitar} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-pizarra hover:underline">
            <X size={15} aria-hidden="true" />
            Quitar filtros
          </button>
        )}
        {materias && base.length > 0 && (
          <p className="text-sm text-gris-texto sm:ml-auto" aria-live="polite">
            {filtradas.length} de {base.length} {base.length === 1 ? 'materia prima' : 'materias primas'}
          </p>
        )}
      </div>

      {categorias.length > 1 && (
        <div role="group" aria-label="Filtrar por categoría" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" aria-pressed={categoria === ''} onClick={() => setCategoria('')} className={chip(categoria === '')}>
            Todas
            <span className="cifras text-xs opacity-80">{conBusqueda.length}</span>
          </button>
          {categorias.map(([nombre, n]) => (
            <button key={nombre} type="button" aria-pressed={categoria === nombre} onClick={() => setCategoria(categoria === nombre ? '' : nombre)} className={chip(categoria === nombre)}>
              {nombre}
              <span className="cifras text-xs opacity-80">{n}</span>
            </button>
          ))}
          {sinPrecioN > 0 && (
            <button
              type="button"
              aria-pressed={soloSinPrecio}
              onClick={() => setSoloSinPrecio((v) => !v)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors ${
                soloSinPrecio ? 'border-atencion-texto bg-atencion-texto text-white' : 'border-[#f1d9a6] bg-atencion-fondo text-atencion-texto hover:bg-[#f8e3b8]'
              }`}
            >
              <TriangleAlert size={15} aria-hidden="true" />
              Falta precio
              <span className="cifras text-xs opacity-80">{sinPrecioN}</span>
            </button>
          )}
        </div>
      )}

      {cargando ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Cargando materias primas">
          <Esqueleto className="h-20" />
          <Esqueleto className="h-20" />
          <Esqueleto className="h-20" />
          <Esqueleto className="h-20" />
        </div>
      ) : base.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-tarjeta border border-linea bg-tabla px-4 py-12 text-center">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-azul-suave text-azul-noche">
            <Package size={28} />
          </span>
          <p className="font-display text-lg font-semibold text-azul-noche">Aún no hay materias primas</p>
          <p className="max-w-sm text-sm text-gris-texto">Cuando se registren los insumos de la panadería, aparecerán aquí agrupados por categoría.</p>
        </div>
      ) : grupos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-tarjeta border border-linea bg-tabla px-4 py-12 text-center">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-arena text-gris-texto">
            <Search size={26} />
          </span>
          <p className="font-semibold text-azul-noche">Ninguna materia prima coincide con lo que buscas</p>
          <Button type="button" variant="secondary" onClick={quitar}>
            Quitar filtros
          </Button>
        </div>
      ) : (
        grupos.map((g) => (
          <section key={g.nombre} aria-labelledby={`cat-${g.nombre}`}>
            <h3 id={`cat-${g.nombre}`} className="mb-2 flex items-center gap-2 text-sm font-semibold text-azul-noche">
              <span aria-hidden="true" className={`size-2.5 rounded-full ${tinte(g.nombre).punto}`} />
              {g.nombre}
              <span className="font-normal text-gris-texto">· {g.lista.length}</span>
            </h3>
            <ul className="divide-y divide-linea overflow-hidden rounded-tarjeta border border-linea bg-tabla">
              {g.lista.map((m) => (
                <Fila key={m.id} m={m} verPrecios={verPrecios} acciones={acciones} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
