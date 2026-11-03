import { useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { formatoCantidad, formatoDinero, formatoFecha } from '../inventario/formatos';
import type { DetalleConteo, LineaConteo } from '../../types/conteo.types';
import { colorEri, ETIQUETA_MOTIVO, formatoPorcentaje } from './etiquetas';

const dif = (l: LineaConteo) => `${l.diferencia > 0 ? '+' : '−'}${formatoCantidad(Math.abs(l.diferencia), l.unidad)}`;

export function ResultadoConteo({ detalle }: { detalle: DetalleConteo }) {
  const { resumen } = detalle;
  const [soloDiferencias, setSoloDiferencias] = useState(true);
  const lineas = soloDiferencias ? detalle.lineas.filter((l) => l.diferencia !== 0) : detalle.lineas;
  const verDinero = resumen.valor_faltantes !== undefined;
  const color = colorEri(resumen.eri, resumen.meta_eri);
  const colorTarjeta = { green: 'border-[#c5dccb] bg-exito-fondo', yellow: 'border-[#f1d9a6] bg-atencion-fondo', red: 'border-[#f0c3c0] bg-critico-fondo', gray: 'border-linea bg-tabla' }[color];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={`col-span-2 rounded-lg border p-4 lg:col-span-1 ${colorTarjeta}`}>
          <p className="text-xs text-gris-texto">Exactitud del inventario</p>
          <p className="text-3xl font-semibold text-grafito">{formatoPorcentaje(resumen.eri)}</p>
          <p className="text-xs text-gris-texto">Meta: {resumen.meta_eri} %</p>
        </div>
        <Tarjeta titulo="Lotes contados" valor={String(resumen.lotes)} />
        <Tarjeta titulo="Sin diferencia" valor={String(resumen.exactos)} />
        <Tarjeta titulo="Con diferencia" valor={`${resumen.faltantes + resumen.sobrantes}`} detalle={`${resumen.faltantes} faltan · ${resumen.sobrantes} sobran`} />
        {verDinero && (
          <>
            <Tarjeta titulo="Valor de lo que falta" valor={formatoDinero(resumen.valor_faltantes ?? 0)} />
            <Tarjeta titulo="Valor de lo que sobra" valor={formatoDinero(resumen.valor_sobrantes ?? 0)} />
          </>
        )}
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm text-grafito">
        <input type="checkbox" checked={soloDiferencias} onChange={(e) => setSoloDiferencias(e.target.checked)} className="h-5 w-5" />
        Mostrar solo los lotes con diferencia
      </label>

      {lineas.length === 0 ? (
        <p className="py-6 text-center text-sm text-gris-texto">
          {soloDiferencias ? 'No hay diferencias: todo coincide con el sistema.' : 'No hay lotes en este conteo.'}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {lineas.map((l) => (
              <li key={l.lote_id} className="rounded-lg border border-linea bg-tabla p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-grafito">{l.nombre}</p>
                    <p className="text-xs text-gris-texto">
                      Lote {l.codigo_lote ?? 'sin código'}
                      {l.fecha_vencimiento ? ` · vence ${formatoFecha(l.fecha_vencimiento)}` : ''}
                    </p>
                  </div>
                  {l.diferencia === 0 ? <Badge color="green">Exacto</Badge> : <Badge color={l.diferencia < 0 ? 'red' : 'yellow'}>{dif(l)}</Badge>}
                </div>
                <p className="mt-2 text-xs text-gris-texto">
                  Sistema: {formatoCantidad(l.cantidad_sistema, l.unidad)} · Contado: {formatoCantidad(l.cantidad_contada, l.unidad)}
                  {l.valor_diferencia !== undefined && l.diferencia !== 0 ? ` · ${formatoDinero(l.valor_diferencia)}` : ''}
                </p>
                {l.motivo && (
                  <p className="mt-1 text-xs text-grafito">
                    {ETIQUETA_MOTIVO[l.motivo]}
                    {l.observaciones ? `: ${l.observaciones}` : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg border border-linea md:block">
            <table className="min-w-full divide-y divide-linea">
              <thead className="bg-azul-noche">
                <tr>
                  {['Insumo', 'Lote', 'Sistema', 'Contado', 'Diferencia', ...(verDinero ? ['Valor'] : []), 'Motivo'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-linea bg-tabla">
                {lineas.map((l) => (
                  <tr key={l.lote_id}>
                    <td className="px-4 py-3 text-sm font-medium text-grafito">{l.nombre}</td>
                    <td className="px-4 py-3 text-sm text-grafito">{l.codigo_lote ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-grafito">{formatoCantidad(l.cantidad_sistema, l.unidad)}</td>
                    <td className="px-4 py-3 text-sm text-grafito">{formatoCantidad(l.cantidad_contada, l.unidad)}</td>
                    <td className="px-4 py-3 text-sm">
                      {l.diferencia === 0 ? <Badge color="green">Exacto</Badge> : <Badge color={l.diferencia < 0 ? 'red' : 'yellow'}>{dif(l)}</Badge>}
                    </td>
                    {verDinero && <td className="px-4 py-3 text-sm text-grafito">{l.diferencia !== 0 && l.valor_diferencia !== undefined ? formatoDinero(l.valor_diferencia) : '—'}</td>}
                    <td className="px-4 py-3 text-sm text-grafito">
                      {l.motivo ? ETIQUETA_MOTIVO[l.motivo] : '—'}
                      {l.observaciones ? <span className="block text-xs text-gris-texto">{l.observaciones}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Tarjeta({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-lg border border-linea bg-tabla p-3">
      <p className="text-xs text-gris-texto">{titulo}</p>
      <p className="text-xl font-semibold text-grafito">{valor}</p>
      {detalle && <p className="text-xs text-gris-texto">{detalle}</p>}
    </div>
  );
}
