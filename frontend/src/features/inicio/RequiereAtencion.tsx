import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Esqueleto } from '../../components/feedback/Esqueleto';
import { useQuery } from '@tanstack/react-query';
import { colorEri, formatoPorcentaje } from '../conteos/etiquetas';
import { getConteos } from '../../services/conteosService';
import { getFormulaciones } from '../../services/formulacionesService';
import { getAlertasVencimiento } from '../../services/inventarioService';
import { getDesviacionesPesaje, getTableroProduccion } from '../../services/produccionService';
import { getExistenciasBajas, getRecomendaciones } from '../../services/reposicionService';
import type { ClaseAbc } from '../../types/reposicion.types';
import { resumirMerma, useAbcInicio, useMermasInicio } from './datosInicio';
import {
  REFERENCIA_MERMA_PCT,
  TOLERANCIA_PESAJE_PCT,
  cantidad,
  fechaApi,
  fechaCorta,
  hastaApi,
  pesos,
  porcentaje,
  rangoPeriodo,
  variacion,
} from './periodos';

type Nivel = 'rojo' | 'amarillo' | 'azul';

interface Aviso {
  clave: string;
  nivel: Nivel;
  texto: string;
  detalle?: string;
  enlace: string;
  accion: string;
  // Para ordenar dentro del nivel: primero lo que toca insumos clase A y lo que vale más
  clase?: ClaseAbc | null;
  valor?: number;
}

// Colores de estado del sistema de diseño: siempre color + ícono + texto
const ESTILO: Record<Nivel, { caja: string; texto: string; icono: LucideIcon; etiqueta: string }> = {
  rojo: { caja: 'border-[#f0c3c0] bg-critico-fondo', texto: 'text-critico-texto', icono: OctagonAlert, etiqueta: 'Urgente' },
  amarillo: { caja: 'border-[#f1d9a6] bg-atencion-fondo', texto: 'text-atencion-texto', icono: TriangleAlert, etiqueta: 'Atención' },
  azul: { caja: 'border-[#c6d3de] bg-info-fondo', texto: 'text-azul-noche', icono: Info, etiqueta: 'Pendiente' },
};

const ORDEN: Record<Nivel, number> = { rojo: 0, amarillo: 1, azul: 2 };
const RANGO_CLASE: Record<ClaseAbc, number> = { A: 0, B: 1, C: 2 };
const rangoClase = (c?: ClaseAbc | null) => (c ? RANGO_CLASE[c] : 3);
// La clase más importante de una lista
const mejorClase = (lista: (ClaseAbc | null | undefined)[]): ClaseAbc | null =>
  lista.reduce<ClaseAbc | null>((m, c) => (c && rangoClase(c) < rangoClase(m) ? c : m), null);

// Cuántos avisos se ven antes de «Ver todos»: así los urgentes no se pierden
const MAX_AVISOS = 6;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// «a, b, c y 2 más»
function lista(textos: string[], max = 3): string {
  if (textos.length <= max) return textos.join(' · ');
  return `${textos.slice(0, max).join(' · ')} y ${textos.length - max} más`;
}

const diasTexto = (d: number) => (d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`);
const vencioTexto = (d: number) => (d === 0 ? 'venció hoy' : d === -1 ? 'venció ayer' : `venció hace ${-d} días`);

// Junta en un solo lugar lo que pide acción, con el insumo, la cantidad, la fecha y el dinero en juego.
export function RequiereAtencion({ verCostos }: { verCostos: boolean }) {
  const [verTodos, setVerTodos] = useState(false);
  const tablero = useQuery({ queryKey: ['produccion', 'tablero'], queryFn: getTableroProduccion });
  const alertas = useQuery({ queryKey: ['inventario', 'alertas'], queryFn: getAlertasVencimiento });
  const conteos = useQuery({ queryKey: ['conteos', 'lista'], queryFn: getConteos });
  const formulaciones = useQuery({ queryKey: ['formulaciones'], queryFn: getFormulaciones, enabled: verCostos });
  // Existencias bajas no lleva dinero: lo ven todos. El cálculo de pedidos es de gestión.
  const existencias = useQuery({ queryKey: ['produccion', 'existencias-bajas'], queryFn: getExistenciasBajas });
  const reposicion = useQuery({ queryKey: ['reposicion', 'recomendaciones'], queryFn: getRecomendaciones, enabled: verCostos });

  // Merma y pesaje de los últimos 30 días frente a los 30 anteriores (no bloquean la carga)
  const r30 = rangoPeriodo('mes');
  const r30ant = rangoPeriodo('mes', true);
  const mermas = useMermasInicio();
  const abc = useAbcInicio(verCostos);
  const pesaje = useQuery({
    queryKey: ['produccion', 'desviaciones', fechaApi(r30.desde), hastaApi(r30)],
    queryFn: () => getDesviacionesPesaje(fechaApi(r30.desde), hastaApi(r30)),
  });

  const cargando =
    tablero.isLoading || alertas.isLoading || conteos.isLoading || existencias.isLoading || (verCostos && (formulaciones.isLoading || reposicion.isLoading));
  if (cargando) {
    return (
      <div className="grid gap-2 md:grid-cols-2" role="status" aria-label="Cargando avisos">
        <Esqueleto className="h-20" />
        <Esqueleto className="h-20" />
      </div>
    );
  }

  // Clase ABC de cada insumo (viene con las recomendaciones de compra)
  const claseDe = new Map<string, ClaseAbc | null>();
  for (const i of reposicion.data?.items ?? []) claseDe.set(i.materia_prima_id, i.clase_abc);
  for (const i of reposicion.data?.al_uso ?? []) claseDe.set(i.materia_prima_id, i.clase_abc);
  for (const i of existencias.data?.items ?? []) claseDe.set(i.materia_prima_id, i.clase_abc);
  const conClase = (nombre: string, id: string) => {
    const c = claseDe.get(id);
    return c ? `${nombre} (${c})` : nombre;
  };

  const avisos: Aviso[] = [];

  // ---- Vencimientos: qué lote, cuánto y cuánto dinero
  const itemsAlerta = [...(alertas.data?.items ?? [])].sort(
    (a, b) => rangoClase(claseDe.get(a.materia_prima_id)) - rangoClase(claseDe.get(b.materia_prima_id)) || (b.valor ?? 0) - (a.valor ?? 0),
  );
  const vencidos = itemsAlerta.filter((i) => i.estado === 'vencido');
  const porVencer = itemsAlerta.filter((i) => i.estado === 'por_vencer');
  const valorVencido = alertas.data?.resumen.valor_vencido;
  const valorPorVencer = alertas.data?.resumen.valor_por_vencer;
  if (vencidos.length > 0) {
    avisos.push({
      clave: 'vencidos',
      nivel: 'rojo',
      texto: `${plural(vencidos.length, 'lote vencido', 'lotes vencidos')} siguen en bodega${verCostos && valorVencido ? `: ${pesos.format(valorVencido)} perdidos` : ''}`,
      detalle: `${lista(vencidos.map((i) => `${conClase(i.nombre, i.materia_prima_id)}: ${cantidad(i.cantidad_disponible)} ${i.unidad}, ${vencioTexto(i.dias)}`))}. Sácalos de la bodega y regístralos como merma por vencimiento.`,
      enlace: '/mermas',
      accion: 'Registrar merma',
      clase: mejorClase(vencidos.map((i) => claseDe.get(i.materia_prima_id))),
      valor: valorVencido,
    });
  }
  if (porVencer.length > 0) {
    avisos.push({
      clave: 'por-vencer',
      nivel: 'amarillo',
      texto: `${plural(porVencer.length, 'lote vence', 'lotes vencen')} en los próximos ${alertas.data?.dias_alerta ?? 7} días${verCostos && valorPorVencer ? `: ${pesos.format(valorPorVencer)} en riesgo` : ''}`,
      detalle: `${lista(porVencer.map((i) => `${conClase(i.nombre, i.materia_prima_id)}: ${cantidad(i.cantidad_disponible)} ${i.unidad}, vence ${diasTexto(i.dias)}`))}. Úsalos primero en la producción.`,
      enlace: '/inventario',
      accion: 'Ver lotes',
      clase: mejorClase(porVencer.map((i) => claseDe.get(i.materia_prima_id))),
      valor: valorPorVencer,
    });
  }

  // ---- Existencias: qué insumo se acaba y cuándo
  const bajas = [...(existencias.data?.items ?? [])].sort((a, b) => rangoClase(a.clase_abc) - rangoClase(b.clase_abc));
  const destino = verCostos ? '/reposicion' : '/inventario';
  const accionExist = verCostos ? 'Ver reposición' : 'Ver inventario';
  const agotados = bajas.filter((i) => i.nivel === 'agotado');
  const criticos = bajas.filter((i) => i.nivel === 'critico');
  const bajosL = bajas.filter((i) => i.nivel === 'bajo');
  const nombreC = (n: string, c: ClaseAbc | null) => (c ? `${n} (${c})` : n);
  if (agotados.length > 0) {
    const a = agotados.filter((i) => i.clase_abc === 'A').length;
    avisos.push({
      clave: 'agotados',
      nivel: 'rojo',
      texto: `${plural(agotados.length, 'insumo agotado', 'insumos agotados')}${a ? `, ${a} de clase A` : ''}`,
      detalle: `${lista(agotados.map((i) => nombreC(i.nombre, i.clase_abc)), 4)}. Las recetas que los usan no se pueden producir hasta reponerlos.`,
      enlace: destino,
      accion: accionExist,
      clase: mejorClase(agotados.map((i) => i.clase_abc)),
    });
  }
  if (criticos.length > 0) {
    avisos.push({
      clave: 'criticos',
      nivel: 'rojo',
      texto: `${plural(criticos.length, 'insumo se acaba', 'insumos se acaban')} antes de la próxima entrega`,
      detalle: lista(
        criticos.map(
          (i) => `${nombreC(i.nombre, i.clase_abc)}: quedan ${cantidad(i.existencia)} ${i.unidad}${i.fecha_agotamiento ? `, se acaba el ${fechaCorta(i.fecha_agotamiento)}` : ''}`,
        ),
      ),
      enlace: destino,
      accion: accionExist,
      clase: mejorClase(criticos.map((i) => i.clase_abc)),
    });
  }
  if (bajosL.length > 0) {
    avisos.push({
      clave: 'bajos',
      nivel: 'amarillo',
      texto: `${plural(bajosL.length, 'insumo por debajo', 'insumos por debajo')} del stock de seguridad`,
      detalle: lista(
        bajosL.map(
          (i) => `${nombreC(i.nombre, i.clase_abc)}: ${cantidad(i.existencia)} ${i.unidad}${i.cobertura_dias != null ? `, alcanza ${cantidad(i.cobertura_dias)} días` : ''}`,
        ),
      ),
      enlace: destino,
      accion: accionExist,
      clase: mejorClase(bajosL.map((i) => i.clase_abc)),
    });
  }

  // ---- Compras (solo gestión: incluyen dinero y proveedores)
  if (verCostos && reposicion.data) {
    const r = reposicion.data;
    const hoy = r.items.filter((i) => i.estado === 'pedir_hoy').sort((a, b) => rangoClase(a.clase_abc) - rangoClase(b.clase_abc));
    if (hoy.length > 0) {
      const valor = hoy.reduce((s, i) => s + (i.costos?.valor_pedido ?? 0), 0);
      avisos.push({
        clave: 'pedir-hoy',
        nivel: 'rojo',
        texto: `Hoy es el último día para pedir ${plural(hoy.length, 'insumo', 'insumos')}${valor ? ` (${pesos.format(valor)})` : ''}`,
        detalle: `${lista(
          hoy.map((i) => {
            const cuanto = i.presentaciones_a_pedir && i.presentacion ? `${i.presentaciones_a_pedir} × ${i.presentacion}` : `${cantidad(i.cantidad_recomendada)} ${i.unidad}`;
            return `${nombreC(i.nombre, i.clase_abc)}: ${cuanto}${i.proveedor ? ` a ${i.proveedor.nombre}` : ''}`;
          }),
        )}. Si no se piden hoy, no llegan en la próxima entrega.`,
        enlace: '/reposicion',
        accion: 'Hacer pedido',
        clase: mejorClase(hoy.map((i) => i.clase_abc)),
        valor,
      });
    }
    const sinMinimo = r.pedidos.filter((p) => p.costos.pedido_minimo.cumple === false);
    if (sinMinimo.length > 0) {
      avisos.push({
        clave: 'pedido-minimo',
        nivel: 'amarillo',
        texto: `${plural(sinMinimo.length, 'pedido no llega', 'pedidos no llegan')} al mínimo del proveedor`,
        detalle: `${lista(sinMinimo.map((p) => `${p.proveedor.nombre}: faltan ${pesos.format(p.costos.pedido_minimo.faltante)}`))}. Completa con insumos que toque pedir pronto o júntalo con la siguiente entrega.`,
        enlace: '/reposicion',
        accion: 'Ver pedidos',
        valor: sinMinimo.reduce((s, p) => s + p.costos.pedido_minimo.faltante, 0),
      });
    }
    const exceso = r.items.filter((i) => i.estado === 'sobreinventario');
    if (exceso.length > 0) {
      avisos.push({
        clave: 'exceso',
        nivel: 'amarillo',
        texto: `${plural(exceso.length, 'insumo tiene', 'insumos tienen')} más de lo que se alcanza a usar`,
        detalle: `${lista(exceso.map((i) => `${nombreC(i.nombre, i.clase_abc)}: ${cantidad(i.existencia)} ${i.unidad}`))}. No los pidas por ahora y úsalos antes de que se pierdan.`,
        enlace: '/reposicion',
        accion: 'Ver reposición',
        clase: mejorClase(exceso.map((i) => i.clase_abc)),
      });
    }
    const sinDatos = r.items.filter((i) => i.estado === 'datos_insuficientes');
    if (sinDatos.length > 0) {
      avisos.push({
        clave: 'datos-reposicion',
        nivel: 'azul',
        texto: `${plural(sinDatos.length, 'insumo sin datos', 'insumos sin datos')} para calcular qué y cuánto pedir`,
        detalle: `${lista(sinDatos.map((i) => nombreC(i.nombre, i.clase_abc)))}. Faltan parámetros del insumo o el calendario de entrega del proveedor.`,
        enlace: '/reposicion/parametros',
        accion: 'Completar',
        clase: mejorClase(sinDatos.map((i) => i.clase_abc)),
      });
    }
  }

  // ---- Merma de los últimos 30 días
  if (verCostos && mermas.data && abc.data) {
    const act = resumirMerma(mermas.data, abc.data, r30);
    const ant = resumirMerma(mermas.data, abc.data, r30ant);
    const causa = act.porCausa[0];
    const textoCausa = causa ? ` La causa que más pesa es «${causa.causa}» (${pesos.format(causa.costo)}, ${plural(causa.veces, 'registro', 'registros')}).` : '';
    const cambio = variacion(act.costo, ant.costo);
    if (act.pct != null && act.pct > REFERENCIA_MERMA_PCT) {
      avisos.push({
        clave: 'merma-alta',
        nivel: 'rojo',
        texto: `La merma de los últimos 30 días es ${porcentaje(act.pct)} de lo consumido`,
        detalle: `Supera el ${REFERENCIA_MERMA_PCT} % de referencia del sector: ${cantidad(act.kg)} kg y ${pesos.format(act.costo)} perdidos.${textoCausa}`,
        enlace: '/mermas',
        accion: 'Ver mermas',
        valor: act.costo,
      });
    } else if (cambio != null && cambio >= 20 && act.costo > 0) {
      avisos.push({
        clave: 'merma-sube',
        nivel: 'amarillo',
        texto: `Las mermas subieron ${porcentaje(cambio)} frente a los 30 días anteriores`,
        detalle: `${pesos.format(act.costo)} en los últimos 30 días contra ${pesos.format(ant.costo)} antes.${textoCausa}`,
        enlace: '/mermas',
        accion: 'Ver mermas',
        valor: act.costo,
      });
    }
  }

  // ---- Pesaje: dosificación lejos de la receta
  const g = pesaje.data?.global;
  if (g && g.desviacion_abs_media_pct != null && g.desviacion_abs_media_pct > TOLERANCIA_PESAJE_PCT) {
    const peores = [...(pesaje.data?.insumos ?? [])]
      .filter((i) => i.desviacion_media_pct != null && Math.abs(i.desviacion_media_pct) > TOLERANCIA_PESAJE_PCT)
      .sort((a, b) => Math.abs(b.desviacion_media_pct ?? 0) - Math.abs(a.desviacion_media_pct ?? 0));
    avisos.push({
      clave: 'pesaje',
      nivel: 'amarillo',
      texto: `Se dosifica en promedio ${porcentaje(g.desviacion_abs_media_pct)} lejos de la receta (tolerancia ${TOLERANCIA_PESAJE_PCT} %)`,
      detalle: peores.length
        ? `${lista(
            peores.map((i) => {
              const d = i.desviacion_media_pct ?? 0;
              return `${conClase(i.nombre, i.materia_prima_id)}: ${d > 0 ? '+' : ''}${porcentaje(d)} ${d > 0 ? 'de más' : 'de menos'}`;
            }),
          )}. Revisa la balanza y la ficha técnica con el panadero.`
        : 'Revisa la balanza y la ficha técnica con el panadero.',
      enlace: '/desviacion-pesaje',
      accion: 'Ver pesaje',
      clase: mejorClase(peores.map((i) => claseDe.get(i.materia_prima_id))),
    });
  }
  if (g && g.pct_pesado != null && g.pesajes > 0 && g.pct_pesado < 50) {
    avisos.push({
      clave: 'poco-pesaje',
      nivel: 'azul',
      texto: `Solo se pesa el ${porcentaje(g.pct_pesado)} de los insumos al producir`,
      detalle: 'Sin el peso real no se puede medir la desviación ni el balance de masas. Pide al panadero que pese al menos los insumos clase A.',
      enlace: '/desviacion-pesaje',
      accion: 'Ver pesaje',
    });
  }

  // ---- Producciones sin cerrar
  const pendientes = tablero.data?.pendientes ?? [];
  if (pendientes.length > 0) {
    avisos.push({
      clave: 'por-cerrar',
      nivel: 'azul',
      texto: `${plural(pendientes.length, 'producción por cerrar', 'producciones por cerrar')}`,
      detalle: `${lista(pendientes.map((p) => `${p.producto} (${fechaCorta(p.fecha)}, ${p.usuario})`))}. Ya descontaron insumos; falta anotar cuántas unidades salieron.`,
      enlace: '/produccion',
      accion: 'Cerrar',
    });
  }

  // ---- Exactitud del inventario
  const datosConteo = conteos.data;
  if (datosConteo && datosConteo.ultimo_eri !== null) {
    const color = colorEri(datosConteo.ultimo_eri, datosConteo.meta_eri);
    if (color === 'red' || color === 'yellow') {
      const faltan = datosConteo.meta_eri - datosConteo.ultimo_eri;
      avisos.push({
        clave: 'eri',
        nivel: color === 'red' ? 'rojo' : 'amarillo',
        texto: `Exactitud del inventario en ${formatoPorcentaje(datosConteo.ultimo_eri)}: ${cantidad(faltan)} puntos bajo la meta`,
        detalle: `La meta es ${datosConteo.meta_eri} %. Lo registrado no coincide con lo que hay en bodega: revisa las diferencias del último conteo y sus motivos.`,
        enlace: '/conteos',
        accion: 'Ver conteos',
      });
    }
  } else if (datosConteo && datosConteo.ultimo_eri === null) {
    avisos.push({
      clave: 'sin-conteo',
      nivel: 'azul',
      texto: 'Aún no hay un conteo físico para medir la exactitud del inventario',
      detalle: 'Cuenta la bodega al menos una vez para comparar lo registrado con lo real.',
      enlace: '/conteos',
      accion: 'Contar',
    });
  }

  if (verCostos) {
    const incompletas = (formulaciones.data ?? []).filter((f) => f.costo_incompleto);
    if (incompletas.length > 0) {
      avisos.push({
        clave: 'costo-incompleto',
        nivel: 'amarillo',
        texto: `${plural(incompletas.length, 'receta con costo incompleto', 'recetas con costo incompleto')}`,
        detalle: `${lista(incompletas.map((f) => f.producto))}. Tienen un ingrediente sin precio; su costo y el ABC quedan por debajo de lo real.`,
        enlace: '/formulaciones',
        accion: 'Ver recetas',
      });
    }
  }

  avisos.sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel] || rangoClase(a.clase) - rangoClase(b.clase) || (b.valor ?? 0) - (a.valor ?? 0));

  if (avisos.length === 0) {
    return (
      <div className="flex animate-entra items-center gap-3 rounded-tarjeta border border-[#c5dccb] bg-exito-fondo px-4 py-3 text-sm text-exito-texto" role="status">
        <CircleCheck size={20} className="shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium">Todo en orden.</span> Nada requiere atención en este momento.
        </span>
      </div>
    );
  }

  const urgentes = avisos.filter((a) => a.nivel === 'rojo').length;
  // Los urgentes se muestran siempre, aunque pasen del límite
  const limite = Math.max(MAX_AVISOS, urgentes);
  const visibles = verTodos ? avisos : avisos.slice(0, limite);
  const ocultos = avisos.length - visibles.length;
  return (
    <section aria-label="Requiere atención" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-azul-noche">
        Requiere atención ({avisos.length}){urgentes > 0 && <span className="text-critico-texto"> · {plural(urgentes, 'urgente', 'urgentes')}</span>}
      </h2>
      <ul className="grid gap-2 md:grid-cols-2">
        {visibles.map((a, i) => {
          const e = ESTILO[a.nivel];
          return (
            <li
              key={a.clave}
              style={{ animationDelay: `${i * 80}ms` }}
              className={`flex animate-desliza items-start gap-3 rounded-tarjeta border p-3 sm:p-4 ${e.caja} ${e.texto}`}
            >
              <e.icono size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  <span className="sr-only">{e.etiqueta}: </span>
                  {a.clase === 'A' && (
                    <span className="mr-1.5 rounded-xs bg-azul-noche px-1.5 py-0.5 text-[11px] font-bold text-white">Clase A</span>
                  )}
                  {a.texto}
                </p>
                {a.detalle && <p className="text-xs sm:text-sm">{a.detalle}</p>}
              </div>
              <Link to={a.enlace} className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold hover:underline">
                {a.accion} →
              </Link>
            </li>
          );
        })}
      </ul>
      {(ocultos > 0 || verTodos) && avisos.length > limite && (
        <button
          type="button"
          onClick={() => setVerTodos((v) => !v)}
          className="self-start text-sm font-semibold text-pizarra hover:underline"
          aria-expanded={verTodos}
        >
          {verTodos ? 'Ver menos' : `Ver todos (${ocultos} más)`}
        </button>
      )}
    </section>
  );
}
