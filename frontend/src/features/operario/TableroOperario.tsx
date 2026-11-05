import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { BookOpen, ChefHat, ChevronRight, ClipboardCheck, OctagonAlert, Package, Trash2, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { getAlertasVencimiento } from '../../services/inventarioService';
import { Espiga } from './ui';

interface Accion {
  etiqueta: string;
  detalle: string;
  ruta: string;
  icono: LucideIcon;
  clase: string;
}

// Ordenadas por lo que más se hace en la planta. Cada botón lleva a una sola tarea.
const ACCIONES: Accion[] = [
  { etiqueta: 'Producir', detalle: 'Elige una receta y cuántos lotes', ruta: '/produccion', icono: ChefHat, clase: 'bg-[#a85c3e] text-white' },
  { etiqueta: 'Registrar merma', detalle: 'Algo se perdió o se dañó', ruta: '/mermas', icono: Trash2, clase: 'bg-critico-texto text-white' },
  { etiqueta: 'Existencias', detalle: 'Qué hay en bodega', ruta: '/inventario', icono: Package, clase: 'bg-verde-bosque text-white' },
  { etiqueta: 'Contar', detalle: 'Conteo físico', ruta: '/conteos', icono: ClipboardCheck, clase: 'bg-pizarra text-white' },
  { etiqueta: 'Recetas', detalle: 'Cuánto lleva cada pan', ruta: '/formulaciones', icono: BookOpen, clase: 'bg-trigo text-grafito' },
];

function saludo() {
  const h = new Date().getHours();
  if (h >= 4 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

// Inicio del operario: un tablero de botones gigantes y, arriba, solo los avisos que piden hacer algo hoy.
export function TableroOperario() {
  const { usuario } = useAuth();
  const nombre = usuario?.nombre?.split(' ')[0] ?? '';
  const alertas = useQuery({ queryKey: ['inventario', 'alertas'], queryFn: getAlertasVencimiento });
  const vencidos = alertas.data?.resumen.vencidos ?? 0;
  const porVencer = alertas.data?.resumen.por_vencer ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-10">
      <div>
        <p className="text-lg text-gris-texto">{saludo()}{nombre ? `, ${nombre}` : ''}</p>
        <h1 className="font-display text-[34px] leading-tight font-semibold text-azul-noche">¿Qué vas a hacer?</h1>
      </div>

      {(vencidos > 0 || porVencer > 0) && (
        <Link
          to="/inventario"
          className={`flex min-h-16 items-center gap-3 rounded-xl px-5 py-3 text-lg font-semibold animate-desliza ${
            vencidos > 0 ? 'bg-critico-fondo text-critico-texto' : 'bg-atencion-fondo text-atencion-texto'
          }`}
        >
          {vencidos > 0 ? <OctagonAlert size={28} aria-hidden="true" /> : <TriangleAlert size={28} aria-hidden="true" />}
          <span className="flex-1">
            {vencidos > 0 && `${vencidos} ${vencidos === 1 ? 'insumo vencido' : 'insumos vencidos'}`}
            {vencidos > 0 && porVencer > 0 && ' · '}
            {porVencer > 0 && `${porVencer} por vencer`}
          </span>
          <span className="text-base font-medium">Ver</span>
          <ChevronRight size={24} aria-hidden="true" />
        </Link>
      )}

      {/* Mosaico: Producir es el bloque alto de la izquierda y los otros cuatro van en 2×2.
          En tablet Producir ocupa todo el ancho arriba; en celular, todos en una columna. */}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1.25fr_1fr_1fr] lg:grid-rows-2">
        {ACCIONES.map((a, i) => {
          const principal = i === 0;
          return (
            <motion.li
              key={a.ruta}
              className={principal ? 'sm:col-span-2 lg:col-span-1 lg:row-span-2' : ''}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.32, ease: 'easeOut' }}
            >
              <motion.div whileTap={{ scale: 0.97 }} whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} className="h-full">
                <Link
                  to={a.ruta}
                  className={`group relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-2xl p-6 shadow-elevada transition-shadow hover:shadow-[0_12px_28px_rgb(34_55_74_/_0.28)] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-trigo ${
                    principal ? 'min-h-56 lg:p-8' : 'min-h-44'
                  } ${a.clase}`}
                >
                  {/* Adornos: círculos suaves y una espiga en la esquina */}
                  <span aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-current opacity-[0.08] transition-transform duration-300 group-hover:scale-110" />
                  <span aria-hidden="true" className="pointer-events-none absolute -right-4 -bottom-14 size-32 rounded-full bg-current opacity-[0.06]" />
                  <Espiga className={`pointer-events-none absolute opacity-[0.14] ${principal ? 'right-6 bottom-6 h-40' : 'right-4 bottom-3 h-20'}`} />

                  <span
                    className={`relative inline-flex items-center justify-center rounded-full bg-current/15 ${principal ? 'size-24' : 'size-16'}`}
                  >
                    <a.icono size={principal ? 52 : 34} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="relative">
                    <span className={`block font-display leading-tight font-semibold ${principal ? 'text-[44px]' : 'text-[26px]'}`}>{a.etiqueta}</span>
                    <span className={`mt-1 block opacity-90 ${principal ? 'text-xl' : 'text-base'}`}>{a.detalle}</span>
                  </span>
                </Link>
              </motion.div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
