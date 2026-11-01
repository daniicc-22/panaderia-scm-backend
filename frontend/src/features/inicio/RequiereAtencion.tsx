import { Link } from 'react-router-dom';
import { CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Esqueleto } from '../../components/feedback/Esqueleto';
import { useQuery } from '@tanstack/react-query';
import { colorEri, formatoPorcentaje } from '../conteos/etiquetas';
import { getConteos } from '../../services/conteosService';
import { getFormulaciones } from '../../services/formulacionesService';
import { getAlertasVencimiento } from '../../services/inventarioService';
import { getTableroProduccion } from '../../services/produccionService';
import { getExistenciasBajas, getRecomendaciones } from '../../services/reposicionService';

type Nivel = 'rojo' | 'amarillo' | 'azul';

interface Aviso {
  clave: string;
  nivel: Nivel;
  texto: string;
  detalle?: string;
  enlace: string;
  accion: string;
}

// Colores de estado del sistema de diseño: siempre color + ícono + texto
const ESTILO: Record<Nivel, { caja: string; texto: string; icono: LucideIcon; etiqueta: string }> = {
  rojo: { caja: 'border-[#f0c3c0] bg-critico-fondo', texto: 'text-critico-texto', icono: OctagonAlert, etiqueta: 'Urgente' },
  amarillo: { caja: 'border-[#f1d9a6] bg-atencion-fondo', texto: 'text-atencion-texto', icono: TriangleAlert, etiqueta: 'Atención' },
  azul: { caja: 'border-[#c6d3de] bg-info-fondo', texto: 'text-azul-noche', icono: Info, etiqueta: 'Pendiente' },
};

const ORDEN: Record<Nivel, number> = { rojo: 0, amarillo: 1, azul: 2 };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// Junta en un solo lugar lo que pide acción: cierres de producción, vencimientos, exactitud y recetas sin costo.
// Usa las mismas consultas que el resto del Inicio, así que no genera pedidos extra.
export function RequiereAtencion({ verCostos }: { verCostos: boolean }) {
  const tablero = useQuery({ queryKey: ['produccion', 'tablero'], queryFn: getTableroProduccion });
  const alertas = useQuery({ queryKey: ['inventario', 'alertas'], queryFn: getAlertasVencimiento });
  const conteos = useQuery({ queryKey: ['conteos', 'lista'], queryFn: getConteos });
  const formulaciones = useQuery({ queryKey: ['formulaciones'], queryFn: getFormulaciones, enabled: verCostos });
  // Existencias bajas no lleva dinero: lo ven todos. El cálculo de pedidos es de gestión.
  const existencias = useQuery({ queryKey: ['produccion', 'existencias-bajas'], queryFn: getExistenciasBajas });
  const reposicion = useQuery({ queryKey: ['reposicion', 'recomendaciones'], queryFn: getRecomendaciones, enabled: verCostos });

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

  const avisos: Aviso[] = [];

  const vencidos = alertas.data?.resumen.vencidos ?? 0;
  const porVencer = alertas.data?.resumen.por_vencer ?? 0;
  if (vencidos > 0) {
    avisos.push({
      clave: 'vencidos',
      nivel: 'rojo',
      texto: `${plural(vencidos, 'lote vencido', 'lotes vencidos')} con existencias`,
      detalle: 'Retíralos o regístralos como merma por vencimiento.',
      enlace: '/inventario',
      accion: 'Ver inventario',
    });
  }
  if (porVencer > 0) {
    avisos.push({
      clave: 'por-vencer',
      nivel: 'amarillo',
      texto: `${plural(porVencer, 'lote por vencer', 'lotes por vencer')} en los próximos ${alertas.data?.dias_alerta ?? 7} días`,
      detalle: 'Úsalos primero para no perderlos.',
      enlace: '/inventario',
      accion: 'Ver inventario',
    });
  }

  // Insumos que se acabaron o se están acabando
  const bajas = existencias.data?.items ?? [];
  const nombres = (nivel: 'agotado' | 'critico' | 'bajo') => {
    const lista = bajas.filter((i) => i.nivel === nivel).map((i) => i.nombre);
    return lista.length > 3 ? `${lista.slice(0, 3).join(', ')} y ${lista.length - 3} más` : lista.join(', ');
  };
  const agotados = existencias.data?.resumen.agotados ?? 0;
  const criticos = existencias.data?.resumen.criticos ?? 0;
  const bajosN = existencias.data?.resumen.bajos ?? 0;
  const destinoExistencias = verCostos ? '/reposicion' : '/inventario';
  if (agotados > 0) {
    avisos.push({
      clave: 'agotados',
      nivel: 'rojo',
      texto: `${plural(agotados, 'insumo agotado', 'insumos agotados')}`,
      detalle: nombres('agotado'),
      enlace: destinoExistencias,
      accion: verCostos ? 'Ver reposición' : 'Ver inventario',
    });
  }
  if (criticos > 0) {
    avisos.push({
      clave: 'criticos',
      nivel: 'rojo',
      texto: `${plural(criticos, 'insumo se acaba', 'insumos se acaban')} antes de la próxima entrega`,
      detalle: nombres('critico'),
      enlace: destinoExistencias,
      accion: verCostos ? 'Ver reposición' : 'Ver inventario',
    });
  }
  if (bajosN > 0) {
    avisos.push({
      clave: 'bajos',
      nivel: 'amarillo',
      texto: `${plural(bajosN, 'insumo con existencias bajas', 'insumos con existencias bajas')}`,
      detalle: nombres('bajo'),
      enlace: destinoExistencias,
      accion: verCostos ? 'Ver reposición' : 'Ver inventario',
    });
  }

  // Compras (solo gestión: incluyen dinero y proveedores)
  if (verCostos && reposicion.data) {
    const r = reposicion.data;
    if (r.resumen.pedir_hoy > 0) {
      avisos.push({
        clave: 'pedir-hoy',
        nivel: 'rojo',
        texto: `Hoy es el último día para pedir ${plural(r.resumen.pedir_hoy, 'insumo', 'insumos')}`,
        detalle: 'Si no se piden hoy, no llegan en la próxima entrega.',
        enlace: '/reposicion',
        accion: 'Ver pedidos',
      });
    }
    const sinMinimo = r.pedidos.filter((p) => p.costos.pedido_minimo.cumple === false).length;
    if (sinMinimo > 0) {
      avisos.push({
        clave: 'pedido-minimo',
        nivel: 'amarillo',
        texto: `${plural(sinMinimo, 'pedido no llega', 'pedidos no llegan')} al mínimo del proveedor`,
        detalle: 'Revisa qué se puede completar para no pagar de más ni quedarte corto.',
        enlace: '/reposicion',
        accion: 'Ver pedidos',
      });
    }
    if (r.resumen.datos_insuficientes > 0) {
      avisos.push({
        clave: 'datos-reposicion',
        nivel: 'azul',
        texto: `${plural(r.resumen.datos_insuficientes, 'insumo sin datos', 'insumos sin datos')} para calcular qué pedir`,
        detalle: 'Faltan parámetros del insumo o el calendario de entrega del proveedor.',
        enlace: '/reposicion/parametros',
        accion: 'Completar',
      });
    }
  }

  const pendientes = tablero.data?.pendientes.length ?? 0;
  if (pendientes > 0) {
    avisos.push({
      clave: 'por-cerrar',
      nivel: 'azul',
      texto: `${plural(pendientes, 'producción por cerrar', 'producciones por cerrar')}`,
      detalle: 'Ya descontaron insumos; falta anotar cuántas unidades salieron.',
      enlace: '/produccion',
      accion: 'Cerrar',
    });
  }

  const datosConteo = conteos.data;
  if (datosConteo && datosConteo.ultimo_eri !== null) {
    const color = colorEri(datosConteo.ultimo_eri, datosConteo.meta_eri);
    if (color === 'red' || color === 'yellow') {
      avisos.push({
        clave: 'eri',
        nivel: color === 'red' ? 'rojo' : 'amarillo',
        texto: `Exactitud del inventario en ${formatoPorcentaje(datosConteo.ultimo_eri)}`,
        detalle: `La meta es ${datosConteo.meta_eri} %. Revisa las diferencias del último conteo.`,
        enlace: '/conteos',
        accion: 'Ver conteos',
      });
    }
  }

  if (verCostos) {
    const incompletas = (formulaciones.data ?? []).filter((f) => f.costo_incompleto).length;
    if (incompletas > 0) {
      avisos.push({
        clave: 'costo-incompleto',
        nivel: 'amarillo',
        texto: `${plural(incompletas, 'receta con costo incompleto', 'recetas con costo incompleto')}`,
        detalle: 'Tienen un ingrediente sin precio; su costo es parcial.',
        enlace: '/formulaciones',
        accion: 'Ver recetas',
      });
    }
  }

  avisos.sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel]);

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

  return (
    <section aria-label="Requiere atención" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-azul-noche">Requiere atención ({avisos.length})</h2>
      <ul className="grid gap-2 md:grid-cols-2">
        {avisos.map((a, i) => {
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
    </section>
  );
}
