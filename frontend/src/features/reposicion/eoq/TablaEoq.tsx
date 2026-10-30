import { formatoCantidad, formatoDinero } from '../../inventario/formatos';
import { costoEoq, costoPolitica, type ItemConEoq } from './eoqCalculos';

const dias = (n: number | null) => (n === null ? '—' : n.toLocaleString('es-CO', { maximumFractionDigits: 1 }));

// La misma información de los gráficos, en números exactos
export function TablaEoq({ items }: { items: ItemConEoq[] }) {
  const filas = [...items].sort((a, b) => (costoPolitica(b) ?? 0) - (costoPolitica(a) ?? 0));
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Insumo</th>
            <th className="px-3 py-2">EOQ</th>
            <th className="px-3 py-2">Cada cuántos días</th>
            <th className="px-3 py-2">Pedido con calendario</th>
            <th className="px-3 py-2">Entregas que cubre</th>
            <th className="px-3 py-2">Costo EOQ</th>
            <th className="px-3 py-2">Costo con calendario</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {filas.map((i) => {
            const pol = costoPolitica(i);
            return (
              <tr key={i.materia_prima_id}>
                <td className="px-3 py-2 font-medium text-gray-900">{i.nombre}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatoCantidad(i.eoq, i.unidad)}</td>
                <td className="px-3 py-2">{dias(i.ciclo_economico_dias)}</td>
                <td className="whitespace-nowrap px-3 py-2">{i.modelo.cantidad_politica === null ? '—' : formatoCantidad(i.modelo.cantidad_politica, i.unidad)}</td>
                <td className="px-3 py-2">{i.ciclos_elegidos ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatoDinero(costoEoq(i))}</td>
                <td className="whitespace-nowrap px-3 py-2">{pol === null ? '—' : formatoDinero(pol)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
