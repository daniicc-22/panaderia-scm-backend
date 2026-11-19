import { Link } from 'react-router-dom';
import { ArrowRight, FileCheck2, FileX2, Layers, Scale, TriangleAlert, Wheat } from 'lucide-react';
import { Esqueleto } from '../../components/feedback/Esqueleto';
import type { FormulacionResumen } from '../../types/formulacion.types';

const pesos0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const pesos2 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kg = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

function Tarjeta({ f, indice, mostrarFicha }: { f: FormulacionResumen; indice: number; mostrarFicha: boolean }) {
  const conCosto = f.costo_lote !== null;
  return (
    <li className="animate-entra" style={{ animationDelay: `${Math.min(indice, 8) * 40}ms` }}>
      <Link
        to={`/formulaciones/${f.id}`}
        className={`group flex h-full flex-col gap-3 rounded-tarjeta border bg-tabla p-4 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-trigo ${f.costo_incompleto ? 'border-trigo' : 'border-linea'} ${f.producto_activo ? '' : 'opacity-75'}`}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`grid size-11 shrink-0 place-items-center rounded-lg ${f.es_intermedio ? 'bg-verde-suave text-verde-bosque' : 'bg-trigo-suave text-atencion-texto'}`}
          >
            {f.es_intermedio ? <Layers size={20} /> : <Wheat size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-lg font-semibold leading-tight text-azul-noche">{f.producto}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="rounded-full bg-azul-suave px-2 py-0.5 font-semibold text-azul-noche">v{f.version}</span>
              {f.es_intermedio && <span className="rounded-full bg-verde-suave px-2 py-0.5 font-semibold text-verde-bosque">Intermedio</span>}
              {!f.producto_activo && <span className="rounded-full bg-arena px-2 py-0.5 font-semibold text-gris-texto">Dado de baja</span>}
              {mostrarFicha && (f.ficha_completa
                ? <span className="inline-flex items-center gap-1 rounded-full bg-exito-fondo px-2 py-0.5 font-semibold text-exito-texto"><FileCheck2 size={12} aria-hidden="true" />Ficha completa</span>
                : <span className="inline-flex items-center gap-1 rounded-full bg-atencion-fondo px-2 py-0.5 font-semibold text-atencion-texto"><FileX2 size={12} aria-hidden="true" />Falta ficha</span>)}
            </div>
          </div>
          <ArrowRight size={18} aria-hidden="true" className="mt-1 shrink-0 text-gris-texto transition-transform group-hover:translate-x-0.5" />
        </div>

        <dl className="grid grid-cols-3 gap-2 rounded-lg bg-hueso px-3 py-2 text-center">
          <div>
            <dt className="text-[11px] font-medium text-gris-texto">Rinde</dt>
            <dd className="cifras text-sm font-semibold text-grafito">{f.rendimiento ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium text-gris-texto">Peso lote</dt>
            <dd className="cifras text-sm font-semibold text-grafito">{kg.format(f.peso_lote_g / 1000)} kg</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium text-gris-texto">Ingredientes</dt>
            <dd className="cifras text-sm font-semibold text-grafito">{f.ingredientes}</dd>
          </div>
        </dl>

        {conCosto && (
          <div className="mt-auto flex items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium text-gris-texto">Costo por unidad</p>
              <p className="cifras font-display text-xl font-semibold text-azul-noche">{f.costo_unidad == null ? '—' : pesos2.format(f.costo_unidad)}</p>
            </div>
            <div className="text-right">
              {f.margen_pct !== null && (
                <p className={`cifras mb-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${f.margen_pct < 0 ? 'bg-critico-fondo text-critico-texto' : 'bg-exito-fondo text-exito-texto'}`} title={f.precio_venta !== null ? `Precio de venta ${pesos0.format(f.precio_venta)}` : undefined}>
                  Margen {kg.format(f.margen_pct)} %
                </p>
              )}
              <p className="text-[11px] font-medium text-gris-texto">Por lote</p>
              <p className="cifras text-sm font-semibold text-grafito">{pesos0.format(f.costo_lote as number)}</p>
            </div>
          </div>
        )}
        {f.costo_incompleto && (
          <p className="flex items-center gap-1.5 rounded-lg bg-atencion-fondo px-2.5 py-1.5 text-xs font-semibold text-atencion-texto">
            <TriangleAlert size={14} aria-hidden="true" />
            Costo incompleto: falta el precio de un ingrediente
          </p>
        )}
        {!conCosto && (
          <p className="mt-auto flex items-center gap-1.5 text-xs text-gris-texto">
            <Scale size={14} aria-hidden="true" />
            Receta estandarizada con pesos por lote
          </p>
        )}
      </Link>
    </li>
  );
}

export function ListaFormulaciones({ formulaciones, cargando, vacio, mostrarFicha = false }: { formulaciones: FormulacionResumen[] | undefined; cargando: boolean; vacio: string; mostrarFicha?: boolean }) {
  if (cargando) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Esqueleto key={i} className="h-48" />
        ))}
      </div>
    );
  }
  if (!formulaciones || formulaciones.length === 0) {
    return <p className="rounded-tarjeta border border-linea bg-tabla p-8 text-center text-sm text-gris-texto">{vacio}</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {formulaciones.map((f, i) => (
        <Tarjeta key={f.id} f={f} indice={i} mostrarFicha={mostrarFicha} />
      ))}
    </ul>
  );
}
