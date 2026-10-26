import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getConteos } from '../../services/conteosService';
import { colorEri, formatoPorcentaje } from './etiquetas';

const FONDO = { green: 'border-green-200 bg-green-50', yellow: 'border-yellow-200 bg-yellow-50', red: 'border-red-200 bg-red-50', gray: 'border-gray-200 bg-white' };

// Indicador de exactitud del inventario (ERI) del último conteo enviado, con la meta del proyecto
export function ExactitudInventario() {
  const conteos = useQuery({ queryKey: ['conteos', 'lista'], queryFn: getConteos });
  const datos = conteos.data;
  if (!datos) return null; // sin datos o con error: el inicio no se llena de avisos

  const color = colorEri(datos.ultimo_eri, datos.meta_eri);
  return (
    <section className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${FONDO[color]}`} aria-label="Exactitud del inventario">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Exactitud del inventario</h2>
        <p className="text-sm text-gray-600">
          {datos.ultimo_eri === null
            ? 'Aún no hay un conteo físico enviado. Cuenta la bodega para medirla.'
            : `Último conteo. Promedio: ${formatoPorcentaje(datos.promedio_eri)} · Meta: ${datos.meta_eri} %`}
        </p>
      </div>
      <div className="flex items-center gap-4">
        {datos.ultimo_eri !== null && <span className="text-3xl font-semibold text-gray-900">{formatoPorcentaje(datos.ultimo_eri)}</span>}
        <Link to="/conteos" className="inline-flex min-h-11 items-center text-sm font-medium text-blue-600 hover:underline">
          {datos.ultimo_eri === null ? 'Ir al conteo físico →' : 'Ver conteos →'}
        </Link>
      </div>
    </section>
  );
}
