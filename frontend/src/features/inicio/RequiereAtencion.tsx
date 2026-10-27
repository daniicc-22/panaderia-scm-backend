import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { colorEri, formatoPorcentaje } from '../conteos/etiquetas';
import { getConteos } from '../../services/conteosService';
import { getFormulaciones } from '../../services/formulacionesService';
import { getAlertasVencimiento } from '../../services/inventarioService';
import { getTableroProduccion } from '../../services/produccionService';

type Nivel = 'rojo' | 'amarillo' | 'azul';

interface Aviso {
  clave: string;
  nivel: Nivel;
  texto: string;
  detalle?: string;
  enlace: string;
  accion: string;
}

const ESTILO: Record<Nivel, { caja: string; punto: string; etiqueta: string }> = {
  rojo: { caja: 'border-red-200 bg-red-50', punto: 'bg-red-600', etiqueta: 'Urgente' },
  amarillo: { caja: 'border-yellow-200 bg-yellow-50', punto: 'bg-yellow-500', etiqueta: 'Atención' },
  azul: { caja: 'border-blue-200 bg-blue-50', punto: 'bg-[#2a78d6]', etiqueta: 'Pendiente' },
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

  const cargando = tablero.isLoading || alertas.isLoading || conteos.isLoading || (verCostos && formulaciones.isLoading);
  if (cargando) return null;

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
      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800" role="status">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-600" aria-hidden="true" />
        <span>
          <span className="font-medium">Todo en orden.</span> Nada requiere atención en este momento.
        </span>
      </div>
    );
  }

  return (
    <section aria-label="Requiere atención" className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Requiere atención ({avisos.length})</h2>
      <ul className="grid gap-2 md:grid-cols-2">
        {avisos.map((a) => (
          <li key={a.clave} className={`flex items-start gap-3 rounded-xl border p-3 ${ESTILO[a.nivel].caja}`}>
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${ESTILO[a.nivel].punto}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">
                <span className="sr-only">{ESTILO[a.nivel].etiqueta}: </span>
                {a.texto}
              </p>
              {a.detalle && <p className="text-xs text-gray-600">{a.detalle}</p>}
            </div>
            <Link to={a.enlace} className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-blue-700 hover:underline">
              {a.accion} →
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
