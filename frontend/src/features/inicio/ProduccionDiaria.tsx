import { useState } from 'react';
import type { TableroProduccion } from '../../types/produccion.types';

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

// 'AAAA-MM-DD' → 'lun 26' sin pasar por zonas horarias
function etiquetaDia(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' }).replace('.', '');
}

// Las dos partes del rótulo del eje (día de la semana y número), una sobre otra para que quepan en el celular
function partesDia(fecha: string): [string, string] {
  const [a, m, d] = fecha.split('-').map(Number);
  return [new Date(a, m - 1, d).toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', ''), String(d)];
}

// Techo «redondo» para el eje: 1, 2 o 5 por una potencia de diez
export function techoRedondo(max: number): number {
  if (max <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(max));
  for (const f of [1, 2, 5, 10]) if (max <= f * potencia) return f * potencia;
  return 10 * potencia;
}

// Unidades producidas por día en la última semana. Una sola serie: el título nombra lo graficado, sin leyenda.
export function ProduccionDiaria({ datos }: { datos: TableroProduccion['por_dia'] }) {
  const [activo, setActivo] = useState<number | null>(null);
  const [tabla, setTabla] = useState(false);

  const max = Math.max(...datos.map((d) => d.producidas), 0);
  if (max === 0 && datos.every((d) => d.producciones === 0)) {
    return <p className="py-8 text-center text-sm text-gray-500">Sin producciones cerradas en los últimos 7 días.</p>;
  }
  const techo = techoRedondo(max);
  // Solo se rotula el día más alto (no un número por barra)
  const indiceMax = datos.findIndex((d) => d.producidas === max);

  return (
    <div>
      <div className="flex">
        {/* Eje vertical: solo cero y techo, lo que basta para leer la escala */}
        <div className="flex h-44 w-10 shrink-0 flex-col justify-between pb-9 pr-2 text-right text-xs text-gray-500" aria-hidden="true">
          <span>{numero.format(techo)}</span>
          <span>0</span>
        </div>
        <div className="relative h-44 flex-1">
          <div className="absolute inset-x-0 top-0 border-t border-gray-200" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-9 border-t border-gray-300" aria-hidden="true" />
          <ul className="absolute inset-0 grid grid-cols-7 gap-1">
            {datos.map((d, i) => {
              const alto = (d.producidas / techo) * 100;
              const visible = activo === i;
              return (
                <li key={d.fecha} className="relative flex h-full flex-col">
                  <button
                    type="button"
                    className="group relative flex min-h-0 flex-1 flex-col items-center justify-end rounded-md pb-0 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    onMouseEnter={() => setActivo(i)}
                    onMouseLeave={() => setActivo(null)}
                    onFocus={() => setActivo(i)}
                    onBlur={() => setActivo(null)}
                    aria-label={`${etiquetaDia(d.fecha)}: ${d.producciones} ${d.producciones === 1 ? 'producción' : 'producciones'}, ${numero.format(d.producidas)} unidades`}
                  >
                    <div className="flex w-full flex-1 flex-col justify-end" style={{ paddingBottom: '2.25rem' }}>
                      <div
                        className={`relative mx-auto w-full max-w-6 rounded-t-[4px] bg-[#2a78d6] transition-opacity ${activo !== null && !visible ? 'opacity-50' : ''}`}
                        style={{ height: `${alto}%`, minHeight: d.producidas > 0 ? 3 : 0 }}
                      >
                        {i === indiceMax && max > 0 && (
                          <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-gray-700">
                            {numero.format(d.producidas)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="absolute inset-x-0 bottom-0 flex h-9 flex-col items-center justify-center text-xs leading-4 text-gray-500">
                      <span>{partesDia(d.fecha)[0]}</span>
                      <span className="font-medium text-gray-700">{partesDia(d.fecha)[1]}</span>
                    </span>
                  </button>
                  {visible && (
                    <div
                      role="tooltip"
                      className={`pointer-events-none absolute bottom-full z-10 mb-1 w-40 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg ${i >= 5 ? 'right-0' : i <= 1 ? 'left-0' : 'left-1/2 -translate-x-1/2'}`}
                    >
                      <p className="font-medium">{etiquetaDia(d.fecha)}</p>
                      <p>
                        {numero.format(d.producidas)} unidades · {d.producciones} {d.producciones === 1 ? 'producción' : 'producciones'}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <button type="button" className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-blue-600 hover:underline" onClick={() => setTabla(!tabla)}>
        {tabla ? 'Ocultar tabla' : 'Ver como tabla'}
      </button>
      {tabla && (
        <table className="mt-1 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-1 font-medium">Día</th>
              <th className="py-1 text-right font-medium">Producciones</th>
              <th className="py-1 text-right font-medium">Unidades</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {datos.map((d) => (
              <tr key={d.fecha}>
                <td className="py-1 text-gray-700">{etiquetaDia(d.fecha)}</td>
                <td className="py-1 text-right text-gray-900">{d.producciones}</td>
                <td className="py-1 text-right text-gray-900">{numero.format(d.producidas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
