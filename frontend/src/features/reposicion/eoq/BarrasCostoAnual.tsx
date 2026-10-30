import { formatoDinero } from '../../inventario/formatos';
import { costoEoq, costoPolitica, type ItemConEoq } from './eoqCalculos';

// Mismos colores que la clasificación ABC del Inicio: una clase = un color fijo
const COLOR_CLASE = { A: '#2a78d6', B: '#eb6834', C: '#1baf7a' } as const;

interface Props {
  items: ItemConEoq[];
  seleccionadoId: string | null;
  onSeleccionar: (id: string) => void;
}

// Dónde se concentra el costo de pedir y guardar. La marca oscura de cada barra es el mínimo teórico (EOQ).
export function BarrasCostoAnual({ items, seleccionadoId, onSeleccionar }: Props) {
  const filas = items
    .map((i) => ({ i, politica: costoPolitica(i) }))
    .filter((f): f is { i: ItemConEoq; politica: number } => f.politica !== null)
    .sort((a, b) => b.politica - a.politica)
    .slice(0, 10);
  const maximo = Math.max(...filas.map((f) => Math.max(f.politica, costoEoq(f.i))), 1);

  if (filas.length === 0) return null;

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700" aria-label="Leyenda">
        {(['A', 'B', 'C'] as const).map((c) => (
          <li key={c} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: COLOR_CLASE[c] }} aria-hidden="true" />
            Clase {c}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-0.5 bg-gray-900" aria-hidden="true" />
          Mínimo teórico (EOQ)
        </li>
      </ul>
      <ul className="flex flex-col">
        {filas.map(({ i, politica }) => {
          const activo = i.materia_prima_id === seleccionadoId;
          const color = COLOR_CLASE[i.clase_abc ?? 'C'];
          return (
            <li key={i.materia_prima_id}>
              <button
                type="button"
                onClick={() => onSeleccionar(i.materia_prima_id)}
                aria-pressed={activo}
                className={`grid min-h-11 w-full grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 rounded-md px-2 text-left text-sm sm:grid-cols-[minmax(0,11rem)_1fr_auto] ${activo ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              >
                <span className="truncate text-gray-800">{i.nombre}</span>
                <span className="relative block h-3">
                  <span className="absolute inset-y-0 left-0 block rounded-r" style={{ width: `${(politica / maximo) * 100}%`, background: color }} />
                  <span className="absolute -inset-y-0.5 block w-0.5 bg-gray-900" style={{ left: `calc(${(costoEoq(i) / maximo) * 100}% - 1px)` }} />
                </span>
                <span className="whitespace-nowrap text-right text-xs text-gray-700">{formatoDinero(politica)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
