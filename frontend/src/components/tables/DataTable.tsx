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
    <div className="animate-entra overflow-x-auto rounded-tarjeta border border-linea">
      <table className="cifras min-w-full">
        <thead className="bg-azul-noche">
          <tr>
            {columnas.map((columna) => (
              <th key={columna.key} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-white">
                {columna.encabezado}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-linea bg-tabla">
          {datos.map((fila) => (
            <tr key={obtenerKeyFila(fila)} className="transition-colors hover:bg-arena">
              {columnas.map((columna) => (
                <td key={columna.key} className="px-4 py-3 text-sm text-grafito">
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
