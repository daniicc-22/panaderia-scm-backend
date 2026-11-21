import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Store } from 'lucide-react';
import { getPanaderias } from '../../services/panaderiasService';
import { getPanaderiaActivaId, setPanaderiaActivaId } from '../../services/panaderiaActiva';

interface SelectorPanaderiaProps {
  /** Panadería que se está viendo ahora (la que resolvió el backend). */
  actualId?: string;
  nombreActual?: string;
}

// Bloques sólidos de la paleta, como los recuadros del Inicio; se repiten si hay más panaderías
const COLORES = ['bg-terracota', 'bg-verde-bosque', 'bg-pizarra'];
const ARTICULOS = new Set(['la', 'el', 'los', 'las', 'de', 'del', 'y']);

// «La Casa del Pan de Maíz» → CP · «La Espiga» → ES · «Vendimia» → VE
function iniciales(nombre: string): string {
  const palabras = nombre.split(/\s+/).filter((p) => p && !ARTICULOS.has(p.toLowerCase()));
  if (palabras.length === 0) return nombre.slice(0, 2).toUpperCase();
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

// Solo para el superadministrador: elige qué panadería ver sin cerrar sesión.
// Las consultas siguientes llevan ?panaderiaId=... (ver httpClient) y el backend
// valida que la panadería exista y esté activa. Al cambiar se recarga la pantalla
// para que ningún dato de la panadería anterior quede en pantalla ni en caché.
export function SelectorPanaderia({ actualId, nombreActual }: SelectorPanaderiaProps) {
  const lista = useQuery({ queryKey: ['panaderias', 'selector'], queryFn: getPanaderias, staleTime: 60 * 1000 });
  const activas = (lista.data ?? []).filter((p) => p.activa);
  const guardada = getPanaderiaActivaId();
  const guardadaValida = guardada !== null && activas.some((p) => p.id === guardada);

  // Si la panadería guardada se desactivó o ya no existe, se vuelve a la primera activa
  useEffect(() => {
    if (lista.data && guardada && !guardadaValida) {
      setPanaderiaActivaId(null);
      window.location.assign('/');
    }
  }, [lista.data, guardada, guardadaValida]);

  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const opciones = useRef<(HTMLButtonElement | null)[]>([]);
  const idLista = useId();

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!abierto) return;
    const alClic = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alClic);
    return () => document.removeEventListener('mousedown', alClic);
  }, [abierto]);

  const indiceActual = Math.max(0, activas.findIndex((p) => p.id === actualId));

  // Al abrir, el foco va a la panadería que se está viendo (cuando la lista ya está en pantalla)
  const alternar = () => {
    const abrir = !abierto;
    setAbierto(abrir);
    if (abrir) requestAnimationFrame(() => opciones.current[indiceActual]?.focus());
  };

  const elegir = (id: string) => {
    setAbierto(false);
    boton.current?.focus();
    if (id === actualId) return;
    setPanaderiaActivaId(id);
    window.location.assign('/');
  };

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setAbierto(false);
      boton.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const actual = opciones.current.findIndex((o) => o === document.activeElement);
    const paso = e.key === 'ArrowDown' ? 1 : -1;
    const siguiente = (actual + paso + activas.length) % activas.length;
    opciones.current[siguiente]?.focus();
  };

  // Con una sola panadería no hay nada que elegir: se muestra su nombre como antes
  if (activas.length <= 1) {
    return nombreActual ? (
      <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-noche-tarjeta px-3 py-2 text-sm text-trigo">
        <Store size={16} aria-hidden="true" />
        <span className="truncate">{nombreActual}</span>
      </div>
    ) : null;
  }

  return (
    <div ref={contenedor} className="relative mx-4 mb-2" onKeyDown={alTeclear}>
      <button
        ref={boton}
        type="button"
        onClick={alternar}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-controls={idLista}
        className="flex w-full items-center gap-2 rounded-lg bg-noche-tarjeta px-3 py-2 text-left text-sm text-trigo transition-colors hover:bg-[#355069] focus-visible:outline-2 focus-visible:outline-trigo"
      >
        <Store size={16} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{nombreActual ?? 'Elige una panadería'}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`}
        />
        <span className="sr-only">Cambiar de panadería</span>
      </button>

      <AnimatePresence>
        {abierto && (
          <motion.div
            id={idLista}
            role="group"
            aria-label="Panaderías"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="mt-2 flex flex-col gap-1.5"
          >
            {activas.map((p, i) => {
              const elegida = p.id === actualId;
              return (
                <button
                  key={p.id}
                  ref={(el) => {
                    opciones.current[i] = el;
                  }}
                  type="button"
                  onClick={() => elegir(p.id)}
                  aria-current={elegida ? 'true' : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-white transition-[transform,filter] duration-150 hover:-translate-y-px hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trigo ${COLORES[i % COLORES.length]} ${
                    elegida ? 'ring-2 ring-trigo' : ''
                  }`}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-white/20 text-xs font-semibold">
                    {iniciales(p.nombre)}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-semibold">{p.nombre}</span>
                    <span className="block truncate text-[11px] text-white/80">
                      {p.ciudad}
                      {elegida ? ' · viendo ahora' : ''}
                    </span>
                  </span>
                  {elegida && <Check size={16} aria-hidden="true" className="shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
