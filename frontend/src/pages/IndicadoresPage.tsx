import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleHelp, CircleX, Download, ListOrdered } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { useAuth } from '../features/auth/useAuth';
import { getMiPanaderia } from '../services/panaderiaService';
import { getConteos } from '../services/conteosService';
import { getInventario } from '../services/inventarioService';
import { getDesviacionesPesaje } from '../services/produccionService';
import { getFormulaciones } from '../services/formulacionesService';
import { useAbcInicio, useMermasInicio, useProduccionesInicio } from '../features/inicio/datosInicio';
import { cantidad, fechaApi, hastaApi, pesos, porcentaje, variacion, type Rango } from '../features/inicio/periodos';
import {
  DIAS_MES_LABORAL,
  calcularIndicadores,
  csvDiario,
  guardarCorte,
  leerCorte,
  primerRegistro,
  type Indicadores,
} from '../features/indicadores/calculo';

// La hipótesis pide al menos 15 % de mejora en la eficiencia operativa
const MEJORA_EFICIENCIA_PCT = 15;
// Con menos días laborables por fase la comparación no es confiable
const DIAS_MINIMOS_FASE = 10;

const mananaDe = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
const desdeTexto = (iso: string) => new Date(`${iso}T00:00:00`);

type Veredicto = 'cumple' | 'no_cumple' | 'faltan';
const VEREDICTO: Record<Veredicto, { caja: string; icono: LucideIcon; texto: string }> = {
  cumple: { caja: 'border-[#c5dccb] bg-exito-fondo text-exito-texto', icono: CircleCheck, texto: 'Se cumple' },
  no_cumple: { caja: 'border-[#f0c3c0] bg-critico-fondo text-critico-texto', icono: CircleX, texto: 'No se cumple' },
  faltan: { caja: 'border-linea bg-tabla text-grafito', icono: CircleHelp, texto: 'Faltan datos' },
};

function TarjetaHipotesis({ titulo, veredicto, cifra, children }: { titulo: string; veredicto: Veredicto; cifra: string; children: ReactNode }) {
  const v = VEREDICTO[veredicto];
  return (
    <div className={`flex animate-entra flex-col gap-2 rounded-tarjeta border p-4 ${v.caja}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{titulo}</p>
        <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide">
          <v.icono size={16} aria-hidden="true" />
          {v.texto}
        </span>
      </div>
      <p className="cifras font-display text-3xl font-semibold text-azul-noche">{cifra}</p>
      <div className="text-xs text-grafito">{children}</div>
    </div>
  );
}

type Sentido = 'baja' | 'sube';

interface Fila {
  nombre: string;
  formula: string;
  pre: number | null;
  post: number | null;
  formato: (n: number) => string;
  sentido: Sentido;
  // Si es en puntos (porcentajes) o en cambio relativo
  puntos?: boolean;
}

function celdaVariacion(f: Fila) {
  if (f.pre == null || f.post == null) return <span className="text-gris-texto">—</span>;
  const d = f.puntos ? f.post - f.pre : variacion(f.post, f.pre);
  if (d == null) return <span className="text-gris-texto">—</span>;
  const mejora = f.sentido === 'baja' ? d < 0 : d > 0;
  const igual = Math.abs(d) < 0.05;
  const texto = `${d > 0 ? '+' : ''}${cantidad(d)}${f.puntos ? ' pts' : ' %'}`;
  return (
    <span className={`font-semibold ${igual ? 'text-gris-texto' : mejora ? 'text-exito-texto' : 'text-critico-texto'}`}>
      {texto} {igual ? '' : mejora ? '· mejora' : '· empeora'}
    </span>
  );
}

// Índice de la página: cada entrada salta a su sección
const SECCIONES = [
  { id: 'ind-corte', texto: 'Inicio de la intervención', color: 'bg-trigo' },
  { id: 'ind-hipotesis', texto: 'Hipótesis de investigación', color: 'bg-grafito' },
  { id: 'ind-desperdicio', texto: 'Reducción del desperdicio', color: 'bg-terracota' },
  { id: 'ind-eficiencia', texto: 'Eficiencia operativa', color: 'bg-verde-bosque' },
  { id: 'ind-trazabilidad', texto: 'Trazabilidad y calidad', color: 'bg-pizarra' },
  { id: 'ind-estandarizacion', texto: 'Estandarización técnica', color: 'bg-azul-noche' },
  { id: 'ind-control', texto: 'Control de inventarios y catálogo', color: 'bg-azul-noche' },
] as const;

function IndicePagina() {
  return (
    <nav aria-label="Índice de indicadores" className="rounded-tarjeta border border-linea bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-azul-noche">
        <ListOrdered size={16} aria-hidden="true" />
        Índice
      </h2>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {SECCIONES.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="flex min-h-11 items-center gap-3 rounded-lg border border-linea bg-tabla px-3 py-2 text-sm font-medium text-grafito transition-colors hover:border-pizarra hover:bg-white"
            >
              <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${s.color}`}>{i + 1}</span>
              {s.texto}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function TablaIndicadores({ id, titulo, filas, conCorte, color }: { id: string; titulo: string; filas: Fila[]; conCorte: boolean; color: string }) {
  return (
    <section id={id} className="scroll-mt-24 overflow-x-auto rounded-tarjeta border border-linea bg-white" aria-label={titulo}>
      <table className="w-full min-w-[46rem] text-sm">
        <caption className={`px-4 py-3 text-left font-display text-base font-semibold text-white ${color}`}>{titulo}</caption>
        <thead className="bg-tabla text-left text-azul-noche">
          <tr>
            <th scope="col" className="px-4 py-2 font-semibold">Indicador</th>
            <th scope="col" className="px-4 py-2 font-semibold">Fórmula</th>
            {conCorte && <th scope="col" className="px-4 py-2 text-right font-semibold">Pre-test</th>}
            <th scope="col" className="px-4 py-2 text-right font-semibold">{conCorte ? 'Post-test' : 'Desde el primer registro'}</th>
            {conCorte && <th scope="col" className="px-4 py-2 text-right font-semibold">Variación</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={f.nombre} className={i % 2 ? 'bg-tabla/60' : ''}>
              <th scope="row" className="px-4 py-2.5 text-left font-semibold text-grafito">
                {f.nombre}
                <span className="block text-[11px] font-normal text-gris-texto">{f.sentido === 'baja' ? 'Mejor si baja' : 'Mejor si sube'}</span>
              </th>
              <td className="px-4 py-2.5 text-xs text-gris-texto">{f.formula}</td>
              {conCorte && <td className="cifras px-4 py-2.5 text-right">{f.pre != null ? f.formato(f.pre) : '—'}</td>}
              <td className="cifras px-4 py-2.5 text-right font-semibold text-grafito">{f.post != null ? f.formato(f.post) : '—'}</td>
              {conCorte && <td className="cifras px-4 py-2.5 text-right">{celdaVariacion(f)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function IndicadoresPage() {
  const { usuario } = useAuth();
  const panaderia = useQuery({ queryKey: ['mi-panaderia', usuario?.id], queryFn: getMiPanaderia, enabled: !!usuario, staleTime: 5 * 60 * 1000 });
  const idPanaderia = panaderia.data?.id ?? 'sin-panaderia';

  const mermas = useMermasInicio();
  const producciones = useProduccionesInicio();
  const abc = useAbcInicio();
  const conteos = useQuery({ queryKey: ['conteos', 'lista'], queryFn: getConteos });
  const inventario = useQuery({ queryKey: ['inicio', 'inventario'], queryFn: getInventario });
  const formulaciones = useQuery({ queryKey: ['formulaciones'], queryFn: getFormulaciones });

  // La fecha se guarda por panadería; se relee al cambiar de panadería
  const [corteGuardado, setCorteGuardado] = useState<{ id: string; fecha: string } | null>(null);
  const corte = corteGuardado?.id === idPanaderia ? corteGuardado.fecha : leerCorte(idPanaderia);
  const cambiarCorte = (fecha: string) => {
    setCorteGuardado({ id: idPanaderia, fecha });
    guardarCorte(idPanaderia, fecha);
  };

  const datos = {
    mermas: mermas.data ?? [],
    producciones: producciones.data ?? [],
    conteos: conteos.data?.items ?? [],
    abc: abc.data,
  };
  const hoy = new Date();
  const manana = mananaDe(hoy);
  const inicio = primerRegistro(datos) ?? new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29);
  const fechaCorte = corte ? desdeTexto(corte) : null;
  const conCorte = !!fechaCorte && fechaCorte > inicio && fechaCorte <= hoy;

  const rPre: Rango = { desde: inicio, hasta: conCorte && fechaCorte ? fechaCorte : inicio };
  const rPost: Rango = { desde: conCorte && fechaCorte ? fechaCorte : inicio, hasta: manana };

  const pesajePre = useQuery({
    queryKey: ['produccion', 'desviaciones', fechaApi(rPre.desde), hastaApi(rPre)],
    queryFn: () => getDesviacionesPesaje(fechaApi(rPre.desde), hastaApi(rPre)),
    enabled: conCorte,
  });
  const pesajePost = useQuery({
    queryKey: ['produccion', 'desviaciones', fechaApi(rPost.desde), hastaApi(rPost)],
    queryFn: () => getDesviacionesPesaje(fechaApi(rPost.desde), hastaApi(rPost)),
  });

  const cargando = mermas.isPending || producciones.isPending || abc.isPending || conteos.isPending;
  const error = mermas.isError || producciones.isError || abc.isError || conteos.isError;

  const pre: Indicadores | null = conCorte ? calcularIndicadores(datos, rPre) : null;
  const post: Indicadores = calcularIndicadores(datos, rPost);
  const metaEri = conteos.data?.meta_eri ?? 95;

  // ---- Variable independiente: datos que no tienen historia (se miden hoy)
  const valorInventario = inventario.data?.items.reduce((s, i) => s + (i.valor ?? 0), 0) ?? 0;
  const consumoMes = abc.data ? (abc.data.total_valor_anual / 312) * DIAS_MES_LABORAL : null;
  const rotacion = consumoMes != null && valorInventario > 0 ? consumoMes / valorInventario : null;
  const productos = (formulaciones.data ?? []).filter((f) => f.producto_activo && !f.es_intermedio);
  const conFicha = productos.filter((f) => f.ficha_completa).length;
  const estandarizacion = productos.length ? (conFicha / productos.length) * 100 : null;

  // ---- Hipótesis
  const pocosDatos = !pre || pre.diasLaborables < DIAS_MINIMOS_FASE || post.diasLaborables < DIAS_MINIMOS_FASE;
  const redMerma = pre?.mermaPct != null && post.mermaPct != null ? variacion(post.mermaPct, pre.mermaPct) : null;
  const redA = pre?.mermaAPct != null && post.mermaAPct != null ? variacion(post.mermaAPct, pre.mermaAPct) : null;
  const vDesperdicio: Veredicto = redMerma == null || pocosDatos ? 'faltan' : redMerma < 0 ? 'cumple' : 'no_cumple';
  const mejoraLote = pre?.costoPorLote != null && post.costoPorLote != null ? variacion(post.costoPorLote, pre.costoPorLote) : null;
  const vEficiencia: Veredicto = mejoraLote == null || pocosDatos ? 'faltan' : -mejoraLote >= MEJORA_EFICIENCIA_PCT ? 'cumple' : 'no_cumple';
  const vTrazabilidad: Veredicto = post.eri == null ? 'faltan' : post.eri >= metaEri ? 'cumple' : 'no_cumple';

  const descargar = () => {
    const texto = csvDiario(datos, inicio, manana, conCorte ? fechaCorte : null);
    const blob = new Blob([`﻿${texto}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `indicadores-diarios-${fechaApi(hoy)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pct = (n: number) => porcentaje(n);
  const kg = (n: number) => `${cantidad(n)} kg`;

  const filasDesperdicio: Fila[] = [
    { nombre: 'Porcentaje de merma real', formula: 'Materia prima desperdiciada ÷ materia prima consumida × 100', pre: pre?.mermaPct ?? null, post: post.mermaPct, formato: pct, sentido: 'baja', puntos: true },
    { nombre: 'Merma de insumos clase A', formula: 'Merma de harina, grasas, levadura… (clase A) ÷ su consumo × 100', pre: pre?.mermaAPct ?? null, post: post.mermaAPct, formato: pct, sentido: 'baja', puntos: true },
    { nombre: 'Merma por vencimiento', formula: 'Kg desechados por caducidad en un mes laboral (26 días)', pre: pre?.vencimientoKgMes ?? null, post: post.vencimientoKgMes, formato: kg, sentido: 'baja' },
  ];
  const filasEficiencia: Fila[] = [
    { nombre: 'Costo de desperdicio por lote', formula: 'Costo de la merma en producción ÷ lotes producidos', pre: pre?.costoPorLote ?? null, post: post.costoPorLote, formato: (n) => pesos.format(n), sentido: 'baja' },
    { nombre: 'Costo de las mermas al mes', formula: 'Costo de todas las mermas en un mes laboral (26 días)', pre: pre?.costoMermaMes ?? null, post: post.costoMermaMes, formato: (n) => pesos.format(n), sentido: 'baja' },
    { nombre: 'Rendimiento de producción', formula: 'Unidades obtenidas ÷ unidades planificadas × 100', pre: pre?.rendimiento ?? null, post: post.rendimiento, formato: pct, sentido: 'sube', puntos: true },
  ];
  const filasTrazabilidad: Fila[] = [
    { nombre: 'Exactitud de inventarios (ERI)', formula: `Promedio de los conteos físicos · meta ≥ ${metaEri} %`, pre: pre?.eri ?? null, post: post.eri, formato: pct, sentido: 'sube', puntos: true },
  ];
  const gPre = pesajePre.data?.global;
  const gPost = pesajePost.data?.global;
  const filasModelo: Fila[] = [
    { nombre: 'Desviación en el pesaje', formula: '|Peso real − peso estándar| ÷ peso estándar × 100 (promedio)', pre: gPre?.desviacion_abs_media_pct ?? null, post: gPost?.desviacion_abs_media_pct ?? null, formato: pct, sentido: 'baja', puntos: true },
    { nombre: 'Insumos pesados al producir', formula: 'Insumos con peso real ÷ insumos de las recetas × 100', pre: gPre?.pct_pesado ?? null, post: gPost?.pct_pesado ?? null, formato: pct, sentido: 'sube', puntos: true },
  ];

  return (
    <>
      <PageHeader
        titulo="Indicadores del proyecto"
        subtitulo="Variables e hipótesis de la investigación: antes (pre-test) y después (post-test) del modelo"
        acciones={
          <button
            type="button"
            onClick={descargar}
            disabled={cargando}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-trigo px-4 text-sm font-semibold text-grafito transition-colors hover:bg-[#d39d34] disabled:opacity-70"
          >
            <Download size={16} aria-hidden="true" />
            Descargar datos diarios (CSV)
          </button>
        }
      />
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <IndicePagina />

        {/* ---- Fecha de corte */}
        <section id="ind-corte" className="scroll-mt-24 flex flex-col gap-3 rounded-tarjeta border border-linea bg-tabla p-4 sm:flex-row sm:items-end sm:justify-between" aria-label="Fecha de corte">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-azul-noche">1. Inicio de la intervención</h2>
            <p className="text-sm text-gris-texto">
              Lo registrado antes de esta fecha es la línea base (pre-test); desde esta fecha, el uso del modelo (post-test).
              {primerRegistro(datos) && <> Primer registro: {fechaApi(inicio)}.</>} Se guarda en este navegador para esta panadería.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-grafito">
              Fecha de corte
              <input
                type="date"
                value={corte}
                max={fechaApi(hoy)}
                onChange={(e) => cambiarCorte(e.target.value)}
                className="min-h-11 rounded-lg border border-borde-campo bg-white px-3 text-grafito"
              />
            </label>
            {corte && (
              <button type="button" onClick={() => cambiarCorte('')} className="min-h-11 px-3 text-sm font-semibold text-pizarra hover:underline">
                Quitar
              </button>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-tarjeta border border-[#f0c3c0] bg-critico-fondo px-4 py-3 text-sm text-critico-texto">
            No se pudieron cargar todos los registros; los indicadores pueden quedar incompletos.
          </div>
        )}
        {corte && !conCorte && (
          <div className="rounded-tarjeta border border-[#f1d9a6] bg-atencion-fondo px-4 py-3 text-sm text-atencion-texto">
            La fecha de corte debe quedar entre el primer registro ({fechaApi(inicio)}) y hoy para comparar las dos fases.
          </div>
        )}
        {conCorte && pre && pocosDatos && (
          <div className="rounded-tarjeta border border-[#f1d9a6] bg-atencion-fondo px-4 py-3 text-sm text-atencion-texto">
            Cada fase necesita al menos {DIAS_MINIMOS_FASE} días laborables para que la comparación sea confiable (pre-test: {pre.diasLaborables}, post-test: {post.diasLaborables}).
          </div>
        )}

        {/* ---- Hipótesis */}
        <section id="ind-hipotesis" className="scroll-mt-24 flex flex-col gap-3" aria-label="Hipótesis">
          <h2 className="text-sm font-semibold text-azul-noche">2. Hipótesis de investigación</h2>
          <div className="grid gap-3 lg:grid-cols-3">
            <TarjetaHipotesis
              titulo="Reducción del desperdicio"
              veredicto={vDesperdicio}
              cifra={redMerma != null ? `${redMerma > 0 ? '+' : ''}${cantidad(redMerma)} %` : '—'}
            >
              Cambio del porcentaje de merma del pre-test al post-test
              {pre?.mermaPct != null && post.mermaPct != null && <> ({porcentaje(pre.mermaPct)} → {porcentaje(post.mermaPct)})</>}.
              {redA != null && <> En clase A: {redA > 0 ? '+' : ''}{cantidad(redA)} %.</>}
            </TarjetaHipotesis>
            <TarjetaHipotesis
              titulo={`Eficiencia operativa (≥ ${MEJORA_EFICIENCIA_PCT} %)`}
              veredicto={vEficiencia}
              cifra={mejoraLote != null ? `${cantidad(-mejoraLote)} %` : '—'}
            >
              Mejora medida como la reducción del costo de desperdicio por lote
              {pre?.costoPorLote != null && post.costoPorLote != null && <> ({pesos.format(pre.costoPorLote)} → {pesos.format(post.costoPorLote)})</>}. Se cumple con una reducción de {MEJORA_EFICIENCIA_PCT} % o más.
            </TarjetaHipotesis>
            <TarjetaHipotesis titulo="Trazabilidad de insumos" veredicto={vTrazabilidad} cifra={post.eri != null ? porcentaje(post.eri) : '—'}>
              Exactitud de inventarios en el {conCorte ? 'post-test' : 'período'} ({post.conteos} conteos) frente a la meta de {metaEri} %.
            </TarjetaHipotesis>
          </div>
          <p className="text-xs text-gris-texto">
            Para decir que la reducción es <span className="font-semibold">estadísticamente significativa</span> (p &lt; 0,05), descarga los datos diarios y aplica la
            prueba t de Student para muestras relacionadas o, si los datos no son normales, la de Wilcoxon. El archivo usa «;» como separador y «,» como decimal
            (en Colab: <code className="rounded-xs bg-arena px-1">pd.read_csv(archivo, sep=";", decimal=",")</code>).
          </p>
        </section>

        {cargando ? (
          <p className="text-sm text-gris-texto">Cargando registros…</p>
        ) : (
          <>
            <TablaIndicadores id="ind-desperdicio" titulo="3. Variable dependiente · Reducción del desperdicio de materias primas" filas={filasDesperdicio} conCorte={conCorte} color="bg-terracota" />
            <TablaIndicadores id="ind-eficiencia" titulo="4. Variable dependiente · Eficiencia operativa" filas={filasEficiencia} conCorte={conCorte} color="bg-verde-bosque" />
            <TablaIndicadores id="ind-trazabilidad" titulo="5. Variable dependiente · Trazabilidad y calidad (ISO/IEC 25010, fiabilidad)" filas={filasTrazabilidad} conCorte={conCorte} color="bg-pizarra" />
            <TablaIndicadores id="ind-estandarizacion" titulo="6. Variable independiente · Estandarización técnica" filas={filasModelo} conCorte={conCorte} color="bg-azul-noche" />

            <section id="ind-control" className="scroll-mt-24 rounded-tarjeta border border-linea bg-white" aria-label="Control de inventarios">
              <h2 className="bg-azul-noche px-4 py-3 font-display text-base font-semibold text-white">7. Variable independiente · Control de inventarios y catálogo (medidos hoy)</h2>
              <dl className="grid gap-3 p-4 sm:grid-cols-3">
                <div className="rounded-tarjeta border border-linea bg-tabla p-4">
                  <dt className="text-sm font-semibold text-grafito">Índice de rotación del inventario</dt>
                  <dd className="cifras mt-1 font-display text-2xl font-semibold text-azul-noche">{rotacion != null ? `${cantidad(rotacion)} veces al mes` : '—'}</dd>
                  <dd className="text-xs text-gris-texto">
                    Consumo valorado de un mes ({consumoMes != null ? pesos.format(consumoMes) : '—'}) ÷ valor del inventario hoy ({pesos.format(valorInventario)}). La panadería no vende
                    por el sistema, así que se usa el consumo de materia prima en lugar del costo de lo vendido.
                  </dd>
                </div>
                <div className="rounded-tarjeta border border-linea bg-tabla p-4">
                  <dt className="text-sm font-semibold text-grafito">Índice de estandarización</dt>
                  <dd className="cifras mt-1 font-display text-2xl font-semibold text-azul-noche">{estandarizacion != null ? porcentaje(estandarizacion) : '—'}</dd>
                  <dd className="text-xs text-gris-texto">
                    Productos con ficha técnica completa — procedimiento, tiempo y temperatura de horneado — ({conFicha}) ÷ productos activos ({productos.length}) × 100.{' '}
                    <Link to="/formulaciones" className="font-semibold text-pizarra hover:underline">Ver formulaciones</Link>
                  </dd>
                </div>
                <div className="rounded-tarjeta border border-linea bg-tabla p-4">
                  <dt className="text-sm font-semibold text-grafito">Precisión de los cálculos ABC y EOQ</dt>
                  <dd className="mt-1 font-display text-2xl font-semibold text-azul-noche">Pruebas funcionales</dd>
                  <dd className="text-xs text-gris-texto">
                    Adecuación funcional (ISO/IEC 25010): se verifica con las pruebas del backend frente al cálculo manual, no con datos de operación.{' '}
                    <Link to="/reposicion/eoq" className="font-semibold text-pizarra hover:underline">Ver análisis EOQ</Link>
                  </dd>
                </div>
              </dl>
            </section>

            <p className="text-xs text-gris-texto">
              Cómo se calcula: la merma es la registrada en el sistema (las registradas en unidades que no son de peso no entran en los kg); el consumo se estima con la
              demanda anual del ABC repartida en 312 días laborables. Los valores al mes se llevan a 26 días laborables para comparar fases de distinto largo.
            </p>
          </>
        )}
      </div>
    </>
  );
}
