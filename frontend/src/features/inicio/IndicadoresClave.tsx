import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getConteos } from '../../services/conteosService';
import { getDesviacionesPesaje } from '../../services/produccionService';
import { colorEri, formatoPorcentaje } from '../conteos/etiquetas';
import { resumirMerma, resumirProduccion, useAbcInicio, useMermasInicio, useProduccionesInicio } from './datosInicio';
import { calcularIndicadores } from '../indicadores/calculo';
import {
  META_RENDIMIENTO_PCT,
  REFERENCIA_MERMA_PCT,
  TEXTO_ANTERIOR,
  TOLERANCIA_PESAJE_PCT,
  cantidad,
  fechaApi,
  hastaApi,
  infoPeriodo,
  pesos,
  porcentaje,
  rangoPeriodo,
  type Periodo,
} from './periodos';

type Estado = 'bien' | 'vigilar' | 'actuar' | 'sin_datos';

const ESTILO: Record<Estado, { caja: string; chip: string; texto: string }> = {
  bien: { caja: 'border-[#c5dccb] bg-exito-fondo', chip: 'bg-verde-bosque text-white', texto: 'Bien' },
  vigilar: { caja: 'border-[#f1d9a6] bg-atencion-fondo', chip: 'bg-trigo text-grafito', texto: 'Vigilar' },
  actuar: { caja: 'border-[#f0c3c0] bg-critico-fondo', chip: 'bg-critico-texto text-white', texto: 'Actuar' },
  sin_datos: { caja: 'border-linea bg-tabla', chip: 'bg-arena text-grafito', texto: 'Sin datos' },
};

interface SemaforoProps {
  titulo: string;
  valor: string;
  estado: Estado;
  detalle: string;
  comparacion?: string | null;
  enlace: string;
  indice: number;
}

function Semaforo({ titulo, valor, estado, detalle, comparacion, enlace, indice }: SemaforoProps) {
  const e = ESTILO[estado];
  return (
    <Link
      to={enlace}
      style={{ animationDelay: `${indice * 70}ms` }}
      className={`flex animate-entra flex-col gap-1 rounded-tarjeta border p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-[2px] hover:shadow-elevada focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trigo ${e.caja}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-grafito">{titulo}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${e.chip}`}>{e.texto}</span>
      </div>
      <p className="cifras font-display text-3xl font-semibold text-azul-noche">{valor}</p>
      {comparacion && <p className="text-xs font-semibold text-grafito">{comparacion}</p>}
      <p className="text-xs text-gris-texto">{detalle}</p>
    </Link>
  );
}

// «↑ 1,2 pts frente a …»; `menosEsMejor` solo cambia la palabra
function comparar(actual: number | null, anterior: number | null, periodo: Periodo): string | null {
  if (actual == null || anterior == null) return null;
  const d = actual - anterior;
  if (Math.abs(d) < 0.05) return `Igual que ${TEXTO_ANTERIOR[periodo]}`;
  return `${d > 0 ? '↑' : '↓'} ${cantidad(Math.abs(d))} puntos frente a ${TEXTO_ANTERIOR[periodo]}`;
}

// Los cuatro indicadores de la tesis con semáforo: verde bien, amarillo vigilar, rojo actuar
export function IndicadoresClave({ periodo }: { periodo: Periodo }) {
  const info = infoPeriodo(periodo);
  const r = rangoPeriodo(periodo);
  const rAnt = rangoPeriodo(periodo, true);

  const mermas = useMermasInicio();
  const abc = useAbcInicio();
  const producciones = useProduccionesInicio();
  const conteos = useQuery({ queryKey: ['conteos', 'lista'], queryFn: getConteos });
  const pesaje = useQuery({
    queryKey: ['produccion', 'desviaciones', fechaApi(r.desde), hastaApi(r)],
    queryFn: () => getDesviacionesPesaje(fechaApi(r.desde), hastaApi(r)),
  });

  // 1. % de merma
  const m = mermas.data ? resumirMerma(mermas.data, abc.data, r) : null;
  const mAnt = mermas.data ? resumirMerma(mermas.data, abc.data, rAnt) : null;
  let estadoMerma: Estado = 'sin_datos';
  if (m?.pct != null) {
    if (m.pct > REFERENCIA_MERMA_PCT) estadoMerma = 'actuar';
    else if (mAnt?.pct != null && m.pct > mAnt.pct) estadoMerma = 'vigilar';
    else estadoMerma = 'bien';
  }
  const detalleMerma = m
    ? m.consumoKg
      ? `${cantidad(m.kg)} kg perdidos de ~${cantidad(m.consumoKg)} kg consumidos (estimado) · ${pesos.format(m.costo)} · referencia del sector ${REFERENCIA_MERMA_PCT} %${m.sinPeso ? ` · ${m.sinPeso} registros en unidades no entran` : ''}`
      : 'Falta la demanda del ABC para calcular el consumo.'
    : 'Cargando…';

  // 1b y 5. Merma de clase A y costo de desperdicio por lote (Tabla I)
  const datosT = { mermas: mermas.data ?? [], producciones: producciones.data ?? [], conteos: [], abc: abc.data };
  const t = mermas.data && producciones.data ? calcularIndicadores(datosT, r) : null;
  const tAnt = mermas.data && producciones.data ? calcularIndicadores(datosT, rAnt) : null;
  let estadoA: Estado = 'sin_datos';
  if (t?.mermaAPct != null) {
    if (t.mermaAPct > REFERENCIA_MERMA_PCT) estadoA = 'actuar';
    else if (tAnt?.mermaAPct != null && t.mermaAPct > tAnt.mermaAPct) estadoA = 'vigilar';
    else estadoA = 'bien';
  }
  let estadoLote: Estado = 'sin_datos';
  if (t?.costoPorLote != null) {
    estadoLote = tAnt?.costoPorLote != null && t.costoPorLote > tAnt.costoPorLote ? 'vigilar' : 'bien';
  }
  const cambioLote = t?.costoPorLote != null && tAnt?.costoPorLote != null && tAnt.costoPorLote > 0
    ? ((t.costoPorLote - tAnt.costoPorLote) / tAnt.costoPorLote) * 100
    : null;

  // 2. Exactitud del inventario (último conteo: no depende del período)
  const c = conteos.data;
  const colorE = c ? colorEri(c.ultimo_eri, c.meta_eri) : 'gray';
  const estadoEri: Estado = colorE === 'green' ? 'bien' : colorE === 'yellow' ? 'vigilar' : colorE === 'red' ? 'actuar' : 'sin_datos';

  // 3. Desviación de pesaje del período
  const g = pesaje.data?.global;
  const dev = g?.desviacion_abs_media_pct ?? null;
  const estadoPesaje: Estado =
    dev == null ? 'sin_datos' : dev <= TOLERANCIA_PESAJE_PCT ? 'bien' : dev <= TOLERANCIA_PESAJE_PCT * 2 ? 'vigilar' : 'actuar';

  // 4. Rendimiento de producción
  const p = producciones.data ? resumirProduccion(producciones.data, r) : null;
  const pAnt = producciones.data ? resumirProduccion(producciones.data, rAnt) : null;
  const rend = p?.rendimiento ?? null;
  const estadoRend: Estado =
    rend == null ? 'sin_datos' : rend >= META_RENDIMIENTO_PCT ? 'bien' : rend >= META_RENDIMIENTO_PCT - 5 ? 'vigilar' : 'actuar';

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Semaforo
          titulo="Merma de materia prima"
          valor={m?.pct != null ? porcentaje(m.pct) : '—'}
          estado={estadoMerma}
          comparacion={comparar(m?.pct ?? null, mAnt?.pct ?? null, periodo)}
          detalle={detalleMerma}
          enlace="/mermas"
          indice={0}
        />
        <Semaforo
          titulo="Merma de insumos clase A"
          valor={t?.mermaAPct != null ? porcentaje(t.mermaAPct) : '—'}
          estado={estadoA}
          comparacion={comparar(t?.mermaAPct ?? null, tAnt?.mermaAPct ?? null, periodo)}
          detalle={t ? `${cantidad(t.mermaAKg)} kg perdidos de harina, grasas, levadura y demás insumos clase A · referencia ${REFERENCIA_MERMA_PCT} %` : 'Cargando…'}
          enlace="/clasificacion-abc"
          indice={1}
        />
        <Semaforo
          titulo="Exactitud del inventario"
          valor={c ? formatoPorcentaje(c.ultimo_eri) : '—'}
          estado={estadoEri}
          comparacion={c?.promedio_eri != null ? `Promedio de los conteos: ${formatoPorcentaje(c.promedio_eri)}` : null}
          detalle={c ? (c.ultimo_eri === null ? 'Aún no hay un conteo físico enviado.' : `Último conteo físico · meta ${c.meta_eri} %`) : 'Cargando…'}
          enlace="/conteos"
          indice={2}
        />
        <Semaforo
          titulo="Desviación en el pesaje"
          valor={dev != null ? porcentaje(dev) : '—'}
          estado={estadoPesaje}
          detalle={
            g
              ? g.pesajes > 0
                ? `Diferencia media entre lo pesado y la receta · ${g.pct_pesado != null ? `${porcentaje(g.pct_pesado)} de los insumos se pesaron` : ''} · tolerancia ${TOLERANCIA_PESAJE_PCT} %`
                : `No hubo insumos pesados ${info.ventana}.`
              : 'Cargando…'
          }
          enlace="/desviacion-pesaje"
          indice={3}
        />
        <Semaforo
          titulo="Rendimiento de producción"
          valor={rend != null ? porcentaje(rend) : '—'}
          estado={estadoRend}
          comparacion={comparar(rend, pAnt?.rendimiento ?? null, periodo)}
          detalle={p ? `Unidades obtenidas frente a las planificadas · ${p.finalizadas} producciones cerradas ${info.ventana} · meta ${META_RENDIMIENTO_PCT} %` : 'Cargando…'}
          enlace="/produccion"
          indice={4}
        />
        <Semaforo
          titulo="Costo de desperdicio por lote"
          valor={t?.costoPorLote != null ? pesos.format(t.costoPorLote) : '—'}
          estado={estadoLote}
          comparacion={cambioLote != null ? `${cambioLote > 0 ? '↑' : '↓'} ${cantidad(Math.abs(cambioLote))} % frente a ${TEXTO_ANTERIOR[periodo]}` : null}
          detalle={t ? `Merma en producción (${pesos.format(t.costoProduccion)}) ÷ ${t.lotes} lotes producidos ${info.ventana}` : 'Cargando…'}
          enlace="/indicadores"
          indice={5}
        />
      </div>
      <p className="text-xs text-gris-texto">
        Verde: dentro de la meta. Amarillo: empeora o está cerca del límite. Rojo: hay que actuar. Los valores son {info.ventana}; la exactitud es del último conteo.{' '}
        <Link to="/indicadores" className="font-semibold text-pizarra hover:underline">
          Ver indicadores del proyecto (antes y después del modelo) →
        </Link>
      </p>
    </div>
  );
}
