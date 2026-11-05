import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ChevronRight, ClipboardCheck, ClipboardList, Play, Target, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { colorEri, ETIQUETA_ESTADO_CONTEO, formatoPorcentaje } from '../conteos/etiquetas';
import { formatoFechaIso } from '../inventario/formatos';
import { abrirConteo, getConteos } from '../../services/conteosService';
import { mensajeDeError } from '../../services/errores';
import type { EstadoConteo } from '../../types/conteo.types';
import { CargandoGrande, MensajeGrande, PantallaOperario } from './ui';

const ESTILO_ESTADO: Record<EstadoConteo, { borde: string; chip: string; tinte: string }> = {
  en_curso: { borde: 'border-l-pizarra', chip: 'bg-pizarra text-white', tinte: 'bg-[#eef2f6]' },
  enviado: { borde: 'border-l-trigo', chip: 'bg-trigo text-grafito', tinte: 'bg-[#fdf4e1]' },
  aplicado: { borde: 'border-l-verde-bosque', chip: 'bg-verde-bosque text-white', tinte: 'bg-[#eef5f0]' },
  descartado: { borde: 'border-l-grafico-neutro', chip: 'bg-grafico-neutro text-white', tinte: 'bg-[#f1ede6]' },
};

const TONO_ERI = {
  green: 'bg-verde-bosque text-white',
  yellow: 'bg-trigo text-grafito',
  red: 'bg-critico-texto text-white',
  gray: 'bg-pizarra text-white',
} as const;

function Medida({ titulo, valor, tono, icono: Icono }: { titulo: string; valor: string; tono: keyof typeof TONO_ERI; icono: LucideIcon }) {
  return (
    <div className={`flex min-h-28 flex-col justify-between rounded-2xl p-4 shadow-elevada ${TONO_ERI[tono]}`}>
      <Icono size={26} aria-hidden="true" />
      <span>
        <span className="block font-display text-[32px] leading-none font-semibold cifras">{valor}</span>
        <span className="text-base font-semibold">{titulo}</span>
      </span>
    </div>
  );
}

// Conteo físico del operario: un botón grande para empezar o seguir contando y la lista en tarjetas.
export function ConteosOperario() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const conteos = useQuery({ queryKey: ['conteos', 'lista'], queryFn: getConteos });
  const abrir = useMutation({
    mutationFn: () => abrirConteo(),
    onSuccess: async (c) => {
      await queryClient.invalidateQueries({ queryKey: ['conteos'] });
      navigate(`/conteos/${c.id}`);
    },
  });

  const datos = conteos.data;
  const enCurso = datos?.items.find((i) => i.estado === 'en_curso');
  const visibles = (datos?.items ?? []).filter((i) => i.estado !== 'descartado');

  return (
    <PantallaOperario seccion="contar" icono={ClipboardCheck} titulo="Conteo físico" ayuda="Cuenta lo que hay en bodega.">
      {conteos.isLoading && <CargandoGrande />}
      {conteos.isError && (
        <button type="button" onClick={() => conteos.refetch()} className="w-full">
          <MensajeGrande tono="rojo">No se pudieron cargar los conteos. Toca para intentar de nuevo.</MensajeGrande>
        </button>
      )}

      {datos && (
        <>
          {enCurso ? (
            <motion.div whileTap={{ scale: 0.98 }}>
              <Link
                to={`/conteos/${enCurso.id}`}
                className="flex min-h-24 items-center gap-4 rounded-2xl bg-[#a85c3e] px-6 py-5 text-white shadow-elevada"
              >
                <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-full bg-current/15">
                  <Play size={32} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[28px] leading-tight font-semibold">Seguir contando</span>
                  <span className="block text-lg opacity-90">
                    Conteo n.º {enCurso.numero} · {enCurso.resumen.lotes} {enCurso.resumen.lotes === 1 ? 'lote contado' : 'lotes contados'}
                  </span>
                </span>
                <ChevronRight size={32} aria-hidden="true" />
              </Link>
            </motion.div>
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              disabled={abrir.isPending}
              onClick={() => abrir.mutate()}
              className="flex min-h-24 items-center gap-4 rounded-2xl bg-[#a85c3e] px-6 py-5 text-left text-white shadow-elevada disabled:opacity-60"
            >
              <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-full bg-current/15">
                <Play size={32} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[28px] leading-tight font-semibold">{abrir.isPending ? 'Abriendo…' : 'Empezar un conteo'}</span>
                <span className="block text-lg opacity-90">Vas a contar lote por lote lo que hay en bodega</span>
              </span>
            </motion.button>
          )}
          {abrir.isError && <MensajeGrande tono="rojo">{mensajeDeError(abrir.error, 'No se pudo abrir el conteo.')}</MensajeGrande>}

          <div className="grid grid-cols-3 gap-3">
            <Medida titulo="Último" valor={formatoPorcentaje(datos.ultimo_eri)} tono={colorEri(datos.ultimo_eri, datos.meta_eri)} icono={ClipboardList} />
            <Medida titulo="Promedio" valor={formatoPorcentaje(datos.promedio_eri)} tono={colorEri(datos.promedio_eri, datos.meta_eri)} icono={TrendingUp} />
            <Medida titulo="Meta" valor={`${datos.meta_eri} %`} tono="gray" icono={Target} />
          </div>
          <p className="-mt-2 text-center text-base text-gris-texto">Qué tanto coincide lo contado con lo que dice el sistema.</p>

          {visibles.length === 0 ? (
            <MensajeGrande>Aún no hay conteos. Empieza el primero.</MensajeGrande>
          ) : (
            <ul className="flex flex-col gap-3 rounded-2xl bg-azul-suave p-3">
              {visibles.map((c, n) => {
                const e = ESTILO_ESTADO[c.estado];
                return (
                  <motion.li
                    key={c.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(n, 10) * 0.04 }}
                  >
                    <Link
                      to={`/conteos/${c.id}`}
                      className={`flex min-h-20 items-center justify-between gap-3 rounded-xl border-l-8 px-5 py-4 shadow-xs active:scale-[0.99] ${e.borde} ${e.tinte}`}
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-xl font-semibold text-grafito">Conteo n.º {c.numero}</span>
                          <span className={`rounded-lg px-3 py-1 text-base font-semibold ${e.chip}`}>{ETIQUETA_ESTADO_CONTEO[c.estado]}</span>
                        </span>
                        <span className="block text-base text-gris-texto">
                          {formatoFechaIso(c.creado_at)} · {c.resumen.lotes} {c.resumen.lotes === 1 ? 'lote' : 'lotes'}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        {c.estado !== 'en_curso' && (
                          <span className="font-display text-2xl font-semibold text-azul-noche cifras">{formatoPorcentaje(c.resumen.eri)}</span>
                        )}
                        <ChevronRight size={28} className="text-gris-texto" aria-hidden="true" />
                      </span>
                    </Link>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </PantallaOperario>
  );
}
