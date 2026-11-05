import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { BookOpen, ChefHat } from 'lucide-react';
import { getFormulacion } from '../../services/formulacionesService';
import { formatoCantidad } from '../inventario/formatos';
import { BandaSeccion, CargandoGrande, Contador, MensajeGrande } from './ui';

// Una receta para leer de pie junto a la mesa: cuántos lotes y cuánto de cada ingrediente, en letra grande.
export function RecetaOperario() {
  const { id } = useParams<{ id: string }>();
  const [lotes, setLotes] = useState(1);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['formulacion', id],
    queryFn: () => getFormulacion(id as string),
    enabled: !!id,
  });

  return (
    <div className="flex flex-col pb-10">
      <BandaSeccion
        seccion="recetas"
        icono={BookOpen}
        titulo={data?.producto ?? 'Receta'}
        ayuda={data ? `${data.ingredientes.length} ingredientes` : undefined}
        volver={{ ruta: '/formulaciones', texto: 'Recetas' }}
      />

      <div className="mx-auto mt-4 flex w-full max-w-3xl flex-col gap-5">
        {isLoading && <CargandoGrande />}
        {isError && (
          <button type="button" onClick={() => refetch()} className="w-full">
            <MensajeGrande tono="rojo">No se pudo cargar la receta. Toca para intentar de nuevo.</MensajeGrande>
          </button>
        )}

        {data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-azul-noche px-5 py-5 text-white shadow-elevada">
              <div>
                <p className="text-xl font-semibold">¿Cuántos lotes?</p>
                {data.rendimiento ? (
                  <p className="text-lg text-niebla">
                    Salen <span className="font-display text-2xl font-semibold text-trigo cifras">{data.rendimiento * lotes}</span> unidades
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl bg-hueso p-2">
                <Contador valor={lotes} onCambio={setLotes} etiqueta="Número de lotes" />
              </div>
            </div>

            <div className="rounded-2xl border-2 border-[#ecd49a] bg-trigo-suave p-3">
              <p className="px-2 pt-1 pb-3 text-lg font-semibold text-[#6e4f10]">Ingredientes para {lotes} {lotes === 1 ? 'lote' : 'lotes'}</p>
              <ul className="flex flex-col gap-2">
                {data.ingredientes.map((ing, n) => (
                  <motion.li
                    key={`${ing.materia_prima_id ?? ing.producto_intermedio_id}-${ing.nombre}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(n, 12) * 0.03 }}
                    className="flex items-center justify-between gap-4 rounded-xl border-l-8 border-l-trigo bg-[#fff] px-5 py-4 shadow-xs"
                  >
                    <span className="min-w-0">
                      <span className="block text-xl font-semibold text-grafito">{ing.nombre}</span>
                      {ing.tipo === 'producto_intermedio' && <span className="block text-base text-pizarra">Masa base</span>}
                    </span>
                    <motion.span
                      key={lotes}
                      initial={{ scale: 1.15 }}
                      animate={{ scale: 1 }}
                      className="rounded-lg bg-trigo px-3 py-1.5 font-display text-2xl font-semibold whitespace-nowrap text-grafito cifras"
                    >
                      {formatoCantidad(ing.cantidad * lotes, ing.unidad)}
                    </motion.span>
                  </motion.li>
                ))}
              </ul>
            </div>

            <Link
              to={`/produccion?receta=${data.id}`}
              className="inline-flex min-h-16 items-center justify-center gap-3 rounded-xl bg-[#a85c3e] px-6 text-xl font-semibold text-white shadow-elevada transition-transform active:scale-[0.98]"
            >
              <ChefHat size={28} aria-hidden="true" />
              Producir esta receta
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
