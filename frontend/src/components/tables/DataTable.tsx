import type { ReactNode } from 'react';
import { LoadingState } from '../feedback/LoadingState';
import { EmptyState } from '../feedback/EmptyState';
import { ErrorState } from '../feedback/ErrorState';

export interface ColumnaTabla<T> {
  encabezado: string;
  render: (fila: T) => ReactNode;
  key: string;
}

interface DataTableProps<T> {
  columnas: ColumnaTabla<T>[];
  datos: T[] | undefined;
  cargando?: boolean;
  error?: boolean;
  onReintentar?: () => void;
  obtenerKeyFila: (fila: T) => string;
}

export function DataTable<T>({
  columnas,
  datos,
  cargando = false,
  error = false,
  onReintentar,
  obtenerKeyFila,
}: DataTableProps<T>) {
  if (cargando) {
    return <LoadingState mensaje="Cargando datos..." />;
  }

  if (error) {
    return <ErrorState onReintentar={onReintentar} />;
  }

  if (!datos || datos.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columnas.map((columna) => (
              <th
                key={columna.key}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                {columna.encabezado}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {datos.map((fila) => (
            <tr key={obtenerKeyFila(fila)} className="hover:bg-gray-50">
              {columnas.map((columna) => (
                <td key={columna.key} className="px-4 py-3 text-sm text-gray-700">
                  {columna.render(fila)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}