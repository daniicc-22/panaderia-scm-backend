import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../../components/ui/Badge';
import { getAlertasVencimiento } from '../../services/inventarioService';
import { formatoCantidad, formatoDinero, formatoFecha, textoVencimiento } from './formatos';

interface Props {
  // En el inicio se muestran pocas alertas y un enlace al inventario
  compacto?: boolean;
}

const MAX_COMPACTO = 5;

// Lotes con existencias que ya vencieron o vencen pronto (HU-15). Se refresca solo cuando cambia el inventario.
export function AlertasVencimiento({ compacto = false }: Props) {
  const alertas = useQuery({ queryKey: ['inventario', 'alertas'], queryFn: getAlertasVencimiento });

  if (alertas.isLoading) return null;

  if (alertas.isError) {
    return (
      <div className="rounded-lg border border-[#f1d9a6] bg-atencion-fondo px-4 py-3 text-sm text-atencion-texto">
        No se pudieron cargar las alertas de vencimiento.{' '}
        <button type="button" className="font-medium underline" onClick={() => alertas.refetch()}>
          Reintentar
        </button>
      </div>
    );
  }

  const datos = alertas.data;
  if (!datos) return null;

  if (datos.items.length === 0) {
    return (
      <div className="rounded-lg border border-[#c5dccb] bg-exito-fondo px-4 py-3 text-sm text-exito-texto">
        Sin lotes vencidos ni por vencer en los próximos {datos.dias_alerta} días.
      </div>
    );
  }

  const visibles = compacto ? datos.items.slice(0, MAX_COMPACTO) : datos.items;
  const ocultas = datos.items.length - visibles.length;
  const { resumen } = datos;

  return (
    <section
      className={`rounded-lg border bg-tabla p-4 ${resumen.vencidos > 0 ? 'border-[#f0c3c0]' : 'border-[#f1d9a6]'}`}
      aria-label="Alertas de vencimiento"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-grafito">Alertas de vencimiento</h2>
        {resumen.vencidos > 0 && <Badge color="red">{resumen.vencidos} vencidos</Badge>}
        {resumen.por_vencer > 0 && <Badge color="yellow">{resumen.por_vencer} por vencer</Badge>}
      </div>
      <p className="mb-3 text-sm text-gris-texto">
        Lotes con existencias que vencen en los próximos {datos.dias_alerta} días o ya vencieron.
        {resumen.valor_vencido !== undefined && resumen.vencidos > 0 && ` Valor vencido: ${formatoDinero(resumen.valor_vencido)}.`}
      </p>

      <ul className="flex flex-col gap-2">
        {visibles.map((a) => (
          <li
            key={a.lote_id}
            className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-1 rounded-md border p-3 ${
              a.estado === 'vencido' ? 'border-[#f0c3c0] bg-critico-fondo' : 'border-[#f1d9a6] bg-atencion-fondo'
            }`}
          >
            <div className="min-w-0">
              <p className="font-medium text-grafito">{a.nombre}</p>
              <p className="text-xs text-gris-texto">
                Lote {a.codigo_lote ?? 'sin código'} · {formatoFecha(a.fecha_vencimiento)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-grafito">{formatoCantidad(a.cantidad_disponible, a.unidad)}</p>
              <p className={`text-xs font-medium ${a.estado === 'vencido' ? 'text-critico-texto' : 'text-atencion-texto'}`}>
                {textoVencimiento(datos.fecha, a.fecha_vencimiento)}
                {a.valor !== undefined ? ` · ${formatoDinero(a.valor)}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {compacto && (
        <Link to="/inventario" className="mt-3 inline-block text-sm font-medium text-pizarra hover:underline">
          {ocultas > 0 ? `Ver ${ocultas} más en Inventario →` : 'Ir a Inventario →'}
        </Link>
      )}
    </section>
  );
}
