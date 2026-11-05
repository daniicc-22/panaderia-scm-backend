import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Minus, Plus, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Piezas compartidas de la interfaz del operario: todo grande, poco texto y una sola acción clara por pantalla.

// Color de cada sección: el mismo del botón del tablero, para que el operario sepa siempre dónde está
export type Seccion = 'producir' | 'merma' | 'existencias' | 'contar' | 'recetas';

export const COLOR_SECCION: Record<Seccion, { banda: string; texto: string; suave: string; borde: string; acento: string }> = {
  producir: { banda: 'bg-[#a85c3e]', texto: 'text-white', suave: 'bg-terracota-suave', borde: 'border-[#e3bfae]', acento: 'text-[#7a3f28]' },
  merma: { banda: 'bg-critico-texto', texto: 'text-white', suave: 'bg-critico-fondo', borde: 'border-[#f0c3c0]', acento: 'text-critico-texto' },
  existencias: { banda: 'bg-verde-bosque', texto: 'text-white', suave: 'bg-verde-suave', borde: 'border-[#c7dacb]', acento: 'text-exito-texto' },
  contar: { banda: 'bg-pizarra', texto: 'text-white', suave: 'bg-azul-suave', borde: 'border-[#c3d0dc]', acento: 'text-azul-noche' },
  recetas: { banda: 'bg-trigo', texto: 'text-grafito', suave: 'bg-trigo-suave', borde: 'border-[#ecd49a]', acento: 'text-[#6e4f10]' },
};

// Espiga de trigo decorativa (toma el color del texto donde se pone)
export function Espiga({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 40 100" fill="currentColor" className={className} aria-hidden="true">
      <rect x="19" y="30" width="2" height="70" rx="1" />
      {[0, 1, 2, 3, 4].map((n) => (
        <g key={n} transform={`translate(0 ${n * 13})`}>
          <ellipse cx="13" cy="12" rx="6" ry="10" transform="rotate(-28 13 12)" />
          <ellipse cx="27" cy="12" rx="6" ry="10" transform="rotate(28 27 12)" />
        </g>
      ))}
      <ellipse cx="20" cy="6" rx="5" ry="8" />
    </svg>
  );
}

// Franja de color de cada pantalla del operario: volver, ícono y título grandes
export function BandaSeccion({
  seccion,
  titulo,
  ayuda,
  icono: Icono,
  volver = { ruta: '/inicio', texto: 'Inicio' },
}: {
  seccion: Seccion;
  titulo: string;
  ayuda?: string;
  icono: LucideIcon;
  volver?: { ruta: string; texto: string };
}) {
  const c = COLOR_SECCION[seccion];
  const boton = 'inline-flex min-h-12 items-center gap-2 rounded-xl bg-current/15 px-4 text-lg font-semibold';
  return (
    <header className={`relative -mx-4 -mt-4 mb-2 overflow-hidden px-4 pt-5 pb-7 sm:-mx-6 sm:-mt-6 sm:px-6 ${c.banda} ${c.texto}`}>
      {/* Adornos simétricos: un círculo y una espiga a cada lado */}
      <span aria-hidden="true" className="pointer-events-none absolute -top-16 -left-12 size-52 rounded-full bg-current opacity-[0.07]" />
      <span aria-hidden="true" className="pointer-events-none absolute -top-16 -right-12 size-52 rounded-full bg-current opacity-[0.07]" />
      <Espiga className="pointer-events-none absolute bottom-2 left-8 hidden h-28 -scale-x-100 opacity-[0.14] md:block" />
      <Espiga className="pointer-events-none absolute right-8 bottom-2 hidden h-28 opacity-[0.14] md:block" />

      {/* Tres columnas: volver | título centrado | espacio del mismo ancho que volver (para que el título quede al centro) */}
      <div className="relative mx-auto grid max-w-4xl grid-cols-1 items-start gap-4 sm:grid-cols-[auto_1fr_auto]">
        <Link to={volver.ruta} className={`${boton} w-fit transition-transform active:scale-[0.97]`}>
          <ArrowLeft size={22} aria-hidden="true" />
          <span>{volver.texto}</span>
        </Link>
        <div className="flex flex-col items-center text-center">
          <span className="mb-3 inline-flex size-18 items-center justify-center rounded-full bg-current/15">
            <Icono size={38} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <h1 className="font-display text-[36px] leading-tight font-semibold">{titulo}</h1>
          {ayuda && <p className="mt-1 text-lg opacity-90">{ayuda}</p>}
        </div>
        <span aria-hidden="true" className="invisible hidden min-h-12 items-center gap-2 px-4 text-lg font-semibold sm:inline-flex">
          <ArrowLeft size={22} />
          <span>{volver.texto}</span>
        </span>
      </div>
    </header>
  );
}

export function PantallaOperario({
  seccion,
  titulo,
  ayuda,
  icono,
  children,
}: {
  seccion: Seccion;
  titulo: string;
  ayuda?: string;
  icono: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col pb-10">
      <BandaSeccion seccion={seccion} titulo={titulo} ayuda={ayuda} icono={icono} />
      <div className="mx-auto mt-4 flex w-full max-w-3xl flex-col gap-5">{children}</div>
    </div>
  );
}

export function BuscadorGrande({ valor, onCambio, placeholder, seccion }: { valor: string; onCambio: (v: string) => void; placeholder: string; seccion?: Seccion }) {
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <Search size={24} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-gris-texto" aria-hidden="true" />
      <input
        type="search"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        className={`min-h-16 w-full rounded-xl border-2 bg-[#fff] pr-4 pl-13 text-lg text-grafito shadow-xs placeholder:text-gris-texto focus:border-trigo focus:outline-hidden ${seccion ? COLOR_SECCION[seccion].borde : 'border-borde-campo'}`}
      />
    </label>
  );
}

export function SelectorChips<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  onCambio: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambio(o.valor)}
            className={`min-h-14 rounded-xl border-2 px-5 text-lg font-semibold transition-colors active:scale-[0.97] ${
              activo ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-[#fff] text-grafito'
            }`}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

// Contador con botones grandes de menos y más (para lotes, unidades, etc.)
export function Contador({ valor, onCambio, min = 1, max = 99, etiqueta }: { valor: number; onCambio: (v: number) => void; min?: number; max?: number; etiqueta: string }) {
  return (
    <div className="flex items-center gap-3" role="group" aria-label={etiqueta}>
      <button
        type="button"
        onClick={() => onCambio(Math.max(min, valor - 1))}
        disabled={valor <= min}
        className="inline-flex size-16 items-center justify-center rounded-xl border-2 border-azul-noche bg-[#fff] text-azul-noche disabled:opacity-40 active:scale-[0.95]"
        aria-label="Menos"
      >
        <Minus size={28} />
      </button>
      <motion.span key={valor} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="min-w-16 text-center font-display text-4xl font-semibold text-azul-noche cifras">
        {valor}
      </motion.span>
      <button
        type="button"
        onClick={() => onCambio(Math.min(max, valor + 1))}
        disabled={valor >= max}
        className="inline-flex size-16 items-center justify-center rounded-xl border-2 border-azul-noche bg-azul-noche text-white disabled:opacity-40 active:scale-[0.95]"
        aria-label="Más"
      >
        <Plus size={28} />
      </button>
    </div>
  );
}

export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'gris';

export const COLOR_SEMAFORO: Record<Semaforo, { borde: string; texto: string; fondo: string }> = {
  verde: { borde: 'border-l-verde-bosque', texto: 'text-exito-texto', fondo: 'bg-exito-fondo' },
  amarillo: { borde: 'border-l-trigo', texto: 'text-atencion-texto', fondo: 'bg-atencion-fondo' },
  rojo: { borde: 'border-l-critico-texto', texto: 'text-critico-texto', fondo: 'bg-critico-fondo' },
  gris: { borde: 'border-l-grafico-neutro', texto: 'text-gris-texto', fondo: 'bg-arena' },
};

export function MensajeGrande({ children, tono = 'gris' }: { children: ReactNode; tono?: Semaforo }) {
  const c = COLOR_SEMAFORO[tono];
  return <div className={`rounded-xl ${c.fondo} px-5 py-6 text-center text-lg font-semibold ${c.texto}`}>{children}</div>;
}

export function CargandoGrande() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-late rounded-xl bg-arena" />
      ))}
    </div>
  );
}

// Botón de opción grande para los pasos (una respuesta por toque)
export function OpcionGrande({
  titulo,
  detalle,
  icono: Icono,
  seleccionada = false,
  onElegir,
  seccion,
}: {
  titulo: string;
  detalle?: string;
  icono?: LucideIcon;
  seleccionada?: boolean;
  onElegir: () => void;
  seccion: Seccion;
}) {
  const c = COLOR_SECCION[seccion];
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onElegir}
      aria-pressed={seleccionada}
      className={`flex min-h-20 w-full items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left shadow-xs transition-colors ${
        seleccionada ? `${c.suave} ${c.borde} ring-4 ring-current/20 ${c.acento}` : 'border-linea bg-[#fff] text-grafito hover:border-borde-campo'
      }`}
    >
      {Icono && (
        <span className={`inline-flex size-14 shrink-0 items-center justify-center rounded-full ${seleccionada ? `${c.banda} ${c.texto}` : `${c.suave} ${c.acento}`}`}>
          <Icono size={28} aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-semibold text-grafito">{titulo}</span>
        {detalle && <span className="block text-base text-gris-texto">{detalle}</span>}
      </span>
    </motion.button>
  );
}

// Encabezado de un paso: barra de progreso, pregunta y botón para volver al paso anterior
export function EncabezadoPaso({
  seccion,
  paso,
  total,
  pregunta,
  onAtras,
}: {
  seccion: Seccion;
  paso: number;
  total: number;
  pregunta: string;
  onAtras?: () => void;
}) {
  const c = COLOR_SECCION[seccion];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        {onAtras ? (
          <button
            type="button"
            onClick={onAtras}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-borde-campo bg-[#fff] px-4 text-lg font-semibold text-grafito active:scale-[0.97]"
          >
            <ArrowLeft size={22} aria-hidden="true" />
            Atrás
          </button>
        ) : (
          <span />
        )}
        <span className={`rounded-full px-3 py-1 text-base font-semibold ${c.suave} ${c.acento}`}>
          Paso {paso} de {total}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-arena" aria-hidden="true">
        <motion.div className={`h-3 rounded-full ${c.banda}`} initial={false} animate={{ width: `${(paso / total) * 100}%` }} transition={{ duration: 0.35 }} />
      </div>
      <h2 className="text-center font-display text-[30px] leading-tight font-semibold text-azul-noche">{pregunta}</h2>
    </div>
  );
}
