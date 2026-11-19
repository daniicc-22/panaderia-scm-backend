import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Boxes, ChevronDown, ClipboardCheck, Factory, Info, OctagonAlert, ShoppingCart, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ClaseAbc } from '../../types/reposicion.types';

export type Nivel = 'rojo' | 'amarillo' | 'azul';
export type Area = 'inventario' | 'compras' | 'produccion' | 'control';

export interface Aviso {
  clave: string;
  area: Area;
  nivel: Nivel;
  texto: string;
  detalle?: string;
  enlace: string;
  accion: string;
  // Cifra grande de la ficha de color (cantidad o porcentaje). Sin cifra, la ficha muestra solo el ícono.
  cifra?: string;
  // Para ordenar dentro del nivel: primero lo que toca insumos clase A y lo que vale más
  clase?: ClaseAbc | null;
  valor?: number;
}

export const ORDEN_NIVEL: Record<Nivel, number> = { rojo: 0, amarillo: 1, azul: 2 };

// Estados del sistema de diseño: siempre color + ícono + texto (nunca solo color)
const ESTILO: Record<Nivel, { tarjeta: string; ficha: string; boton: string; punto: string; chip: string; icono: LucideIcon; etiqueta: string }> = {
  rojo: {
    tarjeta: 'border-critico/35 bg-critico-fondo text-critico-texto',
    ficha: 'bg-critico text-white',
    boton: 'bg-critico text-white hover:bg-critico-texto',
    punto: 'bg-critico',
    chip: 'bg-critico text-white',
    icono: OctagonAlert,
    etiqueta: 'Urgente',
  },
  amarillo: {
    tarjeta: 'border-[#f1d9a6] bg-atencion-fondo text-atencion-texto',
    ficha: 'bg-trigo text-azul-noche',
    boton: 'bg-atencion-texto text-white hover:bg-[#654107]',
    punto: 'bg-trigo',
    chip: 'bg-trigo text-azul-noche',
    icono: TriangleAlert,
    etiqueta: 'Atención',
  },
  azul: {
    tarjeta: 'border-[#c6d3de] bg-info-fondo text-azul-noche',
    ficha: 'bg-pizarra text-white',
    boton: 'bg-azul-noche text-white hover:bg-pizarra',
    punto: 'bg-pizarra',
    chip: 'bg-pizarra text-white',
    icono: Info,
    etiqueta: 'Pendiente',
  },
};

const AREAS: Record<Area, { titulo: string; subtitulo: string; icono: LucideIcon }> = {
  inventario: { titulo: 'Inventario', subtitulo: 'Existencias, vencimientos y excesos', icono: Boxes },
  compras: { titulo: 'Compras', subtitulo: 'Pedidos y proveedores', icono: ShoppingCart },
  produccion: { titulo: 'Producción', subtitulo: 'Cierres, mermas y pesaje', icono: Factory },
  control: { titulo: 'Control y datos', subtitulo: 'Conteos y costos de recetas', icono: ClipboardCheck },
};
const ORDEN_AREAS: Area[] = ['inventario', 'compras', 'produccion', 'control'];

// Avisos visibles por bloque antes de «Ver N más» (los urgentes siempre se ven)
const MAX_POR_BLOQUE = 3;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function Contadores({ avisos }: { avisos: Aviso[] }) {
  const n = (nivel: Nivel) => avisos.filter((a) => a.nivel === nivel).length;
  const rojos = n('rojo');
  const amarillos = n('amarillo');
  const azules = n('azul');
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
      {rojos > 0 && <span className={`rounded-full px-2.5 py-1 ${ESTILO.rojo.chip}`}>{plural(rojos, 'urgente', 'urgentes')}</span>}
      {amarillos > 0 && <span className={`rounded-full px-2.5 py-1 ${ESTILO.amarillo.chip}`}>{amarillos} de atención</span>}
      {azules > 0 && <span className={`rounded-full px-2.5 py-1 ${ESTILO.azul.chip}`}>{plural(azules, 'pendiente', 'pendientes')}</span>}
    </div>
  );
}

function Tarjeta({ a, indice }: { a: Aviso; indice: number }) {
  const e = ESTILO[a.nivel];
  const Icono = e.icono;
  const urgente = a.nivel === 'rojo';
  const cifraLarga = (a.cifra?.length ?? 0) > 3;
  return (
    <li
      style={{ animationDelay: `${indice * 70}ms` }}
      className={`flex animate-desliza overflow-hidden rounded-tarjeta border ${e.tarjeta} ${urgente ? 'shadow-[0_4px_14px_rgb(192_53_47/0.22)]' : ''}`}
    >
      {/* Ficha de color: se reconoce la gravedad y la cantidad antes de leer */}
      <div aria-hidden="true" className={`flex w-20 shrink-0 flex-col items-center justify-center gap-1.5 px-2 py-3 sm:w-24 ${e.ficha}`}>
        <Icono size={a.cifra ? 22 : 32} />
        {a.cifra && <span className={`cifras font-bold leading-none ${cifraLarga ? 'text-lg' : 'text-3xl'}`}>{a.cifra}</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <p className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
            {urgente && <span className={`size-2 animate-late rounded-full ${e.punto}`} aria-hidden="true" />}
            <span>{e.etiqueta}</span>
            {a.clase === 'A' && <span className="rounded-xs bg-azul-noche px-1.5 py-0.5 text-white">Clase A</span>}
          </p>
          <p className="text-sm font-semibold sm:text-base">{a.texto}</p>
          {a.detalle && <p className="mt-1 text-xs sm:text-sm">{a.detalle}</p>}
        </div>
        <Link to={a.enlace} className={`inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors ${e.boton}`}>
          {a.accion}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}

function Bloque({ area, avisos }: { area: Area; avisos: Aviso[] }) {
  const [abierto, setAbierto] = useState(false);
  const info = AREAS[area];
  const Icono = info.icono;
  // Ya vienen ordenados por gravedad: el primero marca el color del bloque
  const peor = avisos[0].nivel;
  const urgentes = avisos.filter((a) => a.nivel === 'rojo').length;
  const limite = Math.max(MAX_POR_BLOQUE, urgentes);
  const visibles = abierto ? avisos : avisos.slice(0, limite);
  const ocultos = avisos.length - limite;
  return (
    <section id={`avisos-${area}`} aria-labelledby={`avisos-${area}-titulo`} className="scroll-mt-4 animate-entra rounded-tarjeta border border-linea bg-tabla p-3 sm:p-4">
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-lg ${ESTILO[peor].ficha}`}>
          <Icono size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={`avisos-${area}-titulo`} className="text-base font-semibold text-azul-noche">
            {info.titulo}
          </h3>
          <p className="text-xs text-gris-texto sm:text-sm">{info.subtitulo}</p>
        </div>
        <Contadores avisos={avisos} />
      </header>
      <ul className="grid gap-3 md:grid-cols-2">
        {visibles.map((a, i) => (
          <Tarjeta key={a.clave} a={a} indice={i} />
        ))}
      </ul>
      {ocultos > 0 && (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-pizarra hover:underline"
        >
          {abierto ? 'Ver menos' : `Ver ${ocultos} más`}
          <ChevronDown size={16} className={abierto ? 'rotate-180' : ''} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

// Los avisos llegan ya ordenados por gravedad; aquí se agrupan por área de la operación
export function PanelAvisos({ avisos }: { avisos: Aviso[] }) {
  const grupos = ORDEN_AREAS.map((area) => ({ area, lista: avisos.filter((a) => a.area === area) }))
    .filter((g) => g.lista.length > 0)
    // El área con lo más grave va primero; a igual gravedad, el orden fijo
    .sort((a, b) => ORDEN_NIVEL[a.lista[0].nivel] - ORDEN_NIVEL[b.lista[0].nivel]);

  const irA = (area: Area) => document.getElementById(`avisos-${area}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <section aria-label="Requiere atención" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-base font-semibold text-azul-noche">
          Requiere atención <span className="font-normal text-gris-texto">({plural(avisos.length, 'aviso', 'avisos')})</span>
        </h2>
        <Contadores avisos={avisos} />
      </div>
      {grupos.length > 1 && (
        <nav aria-label="Ir a un área" className="flex flex-wrap gap-2 print:hidden">
          {grupos.map((g) => {
            const Icono = AREAS[g.area].icono;
            return (
              <button
                key={g.area}
                type="button"
                onClick={() => irA(g.area)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-linea bg-tabla px-3.5 text-sm font-semibold text-azul-noche transition-colors hover:bg-arena"
              >
                <span aria-hidden="true" className={`size-2.5 rounded-full ${ESTILO[g.lista[0].nivel].punto}`} />
                <Icono size={16} aria-hidden="true" />
                {AREAS[g.area].titulo}
                <span className="cifras text-gris-texto">{g.lista.length}</span>
              </button>
            );
          })}
        </nav>
      )}
      {grupos.map((g) => (
        <Bloque key={g.area} area={g.area} avisos={g.lista} />
      ))}
    </section>
  );
}
