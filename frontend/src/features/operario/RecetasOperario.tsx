import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { BookOpen, ChevronRight, Layers } from 'lucide-react';
import { getFormulaciones } from '../../services/formulacionesService';
import { BuscadorGrande, CargandoGrande, MensajeGrande, PantallaOperario } from './ui';

// Lista de recetas en tarjetas grandes. Las masas base van marcadas para que no se confundan con un pan.
export function RecetasOperario() {
  const [busqueda, setBusqueda] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['formulaciones'], queryFn: getFormulaciones });

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (data ?? [])
      .filter((f) => f.producto_activo)
      .filter((f) => !texto || f.producto.toLowerCase().includes(texto))
      .sort((a, b) => a.producto.localeCompare(b.producto, 'es'));
  }, [data, busqueda]);

  return (
    <PantallaOperario seccion="recetas" icono={BookOpen} titulo="Recetas" ayuda="Toca una receta para ver cuánto lleva.">
      <BuscadorGrande seccion="recetas" valor={busqueda} onCambio={setBusqueda} placeholder="Buscar una receta" />

      {isLoading && <CargandoGrande />}
      {isError && (
        <button type="button" onClick={() => refetch()} className="w-full">
          <MensajeGrande tono="rojo">No se pudieron cargar las recetas. Toca para intentar de nuevo.</MensajeGrande>
        </button>
      )}
      {data && visibles.length === 0 && <MensajeGrande>No hay recetas con ese nombre.</MensajeGrande>}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visibles.map((f, n) => (
          <motion.li
            key={f.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(n, 12) * 0.03, duration: 0.25 }}
          >
            <Link
              to={`/formulaciones/${f.id}`}
              className={`flex min-h-24 items-center gap-4 rounded-2xl border-2 px-5 py-4 shadow-xs transition-transform active:scale-[0.98] ${
                f.es_intermedio ? 'border-[#c3d0dc] bg-azul-suave' : 'border-[#ecd49a] bg-trigo-suave'
              }`}
            >
              <span
                className={`inline-flex size-14 shrink-0 items-center justify-center rounded-full ${
                  f.es_intermedio ? 'bg-pizarra text-white' : 'bg-trigo text-grafito'
                }`}
              >
                {f.es_intermedio ? <Layers size={26} aria-hidden="true" /> : <BookOpen size={26} aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-semibold text-grafito">{f.producto}</span>
                <span className="block text-base text-[#6e4f10]">
                  {f.es_intermedio ? 'Masa base · ' : ''}
                  {f.ingredientes} {f.ingredientes === 1 ? 'ingrediente' : 'ingredientes'}
                  {f.rendimiento ? ` · rinde ${f.rendimiento}` : ''}
                </span>
              </span>
              <ChevronRight size={28} className="text-[#6e4f10]" aria-hidden="true" />
            </Link>
          </motion.li>
        ))}
      </ul>
    </PantallaOperario>
  );
}
