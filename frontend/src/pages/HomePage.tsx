import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../features/auth/useAuth';
import { getMateriasPrimas } from '../services/materiasPrimasService';
import { getFormulaciones } from '../services/formulacionesService';
import { getClasificacionAbc } from '../services/abcService';
import { ExactitudInventario } from '../features/conteos/ExactitudInventario';
import { AlertasVencimiento } from '../features/inventario/AlertasVencimiento';
import type { ClaseAbc } from '../types/abc.types';

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const millones = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const pesos0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// Colores de la paleta categórica validada (ranuras 1 a 3): una clase = un color fijo
const COLOR_CLASE: Record<ClaseAbc, string> = {
  A: 'bg-[#2a78d6]',
  B: 'bg-[#eb6834]',
  C: 'bg-[#1baf7a]',
};

function Kpi({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{etiqueta}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{valor}</p>
      {detalle && <p className="text-sm text-gray-500">{detalle}</p>}
    </div>
  );
}

function Tarjeta({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
      {subtitulo && <p className="mb-3 text-sm text-gray-500">{subtitulo}</p>}
      {children}
    </section>
  );
}

export function HomePage() {
  const { usuario } = useAuth();
  const verCostos = usuario?.rol === 'administrador' || usuario?.rol === 'superadministrador';

  const materias = useQuery({ queryKey: ['materias-primas'], queryFn: getMateriasPrimas });
  const formulaciones = useQuery({ queryKey: ['formulaciones'], queryFn: getFormulaciones });
  // La clasificación ABC solo existe para administradores; el operario no la consulta
  const abc = useQuery({ queryKey: ['clasificacion-abc'], queryFn: getClasificacionAbc, enabled: verCostos });

  const claseA = abc.data?.resumen.find((r) => r.clase === 'A');
  const top = abc.data?.items.slice(0, 10) ?? [];
  const maximo = top[0]?.porcentaje || 1;
  const incompletas = (formulaciones.data ?? []).filter((f) => f.costo_incompleto);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Inicio</h1>
        <p className="text-sm text-gray-500">Hola, {usuario?.nombre}. Resumen de la panadería.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Insumos activos" valor={materias.data ? String(materias.data.length) : '—'} />
        <Kpi etiqueta="Recetas estandarizadas" valor={formulaciones.data ? String(formulaciones.data.length) : '—'} />
        {verCostos && (
          <>
            <Kpi
              etiqueta="Valor anual estimado"
              valor={abc.data ? `$ ${millones.format(abc.data.total_valor_anual / 1_000_000)} M` : '—'}
              detalle="Estimado: 6 lotes por semana"
            />
            <Kpi
              etiqueta="Insumos clase A"
              valor={claseA ? String(claseA.insumos) : '—'}
              detalle={claseA ? `${numero.format(claseA.porcentaje)} % del valor` : undefined}
            />
          </>
        )}
      </div>

      <AlertasVencimiento compacto />

      <ExactitudInventario />

      {!verCostos && (
        <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          Consulta las recetas estandarizadas en <Link to="/formulaciones" className="font-medium text-blue-600 hover:underline">Formulaciones</Link>.
          Registra lo que produces en <Link to="/produccion" className="font-medium text-blue-600 hover:underline">Producir</Link> y las entradas en <Link to="/inventario" className="font-medium text-blue-600 hover:underline">Inventario</Link>.
        </div>
      )}

      {verCostos && abc.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo cargar la clasificación ABC.
        </div>
      )}

      {verCostos && abc.data && (
        <>
          <Tarjeta
            titulo="Distribución del valor por clase ABC"
            subtitulo={`Demanda estimada con ${abc.data.supuestos.lotes_por_semana_por_defecto} lotes por semana por producto`}
          >
            <div className="flex h-8 gap-0.5 overflow-hidden rounded-md" role="img" aria-label="Distribución del valor anual por clase ABC">
              {abc.data.resumen.map((r) => (
                <div
                  key={r.clase}
                  className={COLOR_CLASE[r.clase]}
                  style={{ width: `${r.porcentaje}%` }}
                  title={`Clase ${r.clase}: ${r.insumos} insumos, ${numero.format(r.porcentaje)} % del valor (${pesos0.format(r.valor_anual)})`}
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700">
              {abc.data.resumen.map((r) => (
                <li key={r.clase} className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-sm ${COLOR_CLASE[r.clase]}`} />
                  Clase {r.clase}: {r.insumos} insumos · {numero.format(r.porcentaje)} % del valor
                </li>
              ))}
            </ul>
          </Tarjeta>

          <Tarjeta titulo="Insumos que más pesan en el costo" subtitulo="Los 10 con mayor valor anual; el color indica la clase ABC">
            <ul className="flex flex-col gap-2">
              {top.map((i) => (
                <li
                  key={i.codigo}
                  className="grid grid-cols-[7rem_1fr_4rem] items-center gap-3 sm:grid-cols-[11rem_1fr_5rem]"
                  title={`${i.nombre}: ${pesos0.format(i.valor_anual)} al año (${numero.format(i.porcentaje)} %) · Clase ${i.clase}`}
                >
                  <span className="truncate text-sm text-gray-700">{i.nombre}</span>
                  <div className="h-4 rounded-sm bg-gray-100">
                    <div className={`h-4 rounded-sm ${COLOR_CLASE[i.clase]}`} style={{ width: `${(i.porcentaje / maximo) * 100}%` }} />
                  </div>
                  <span className="text-right text-sm text-gray-900">{numero.format(i.porcentaje)} %</span>
                </li>
              ))}
            </ul>
            <Link to="/clasificacion-abc" className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline">
              Ver tabla completa →
            </Link>
          </Tarjeta>

          {incompletas.length > 0 && (
            <Tarjeta titulo="Recetas con costo incompleto" subtitulo="Tienen un ingrediente sin costo; su total es parcial">
              <ul className="flex flex-col gap-1 text-sm">
                {incompletas.map((f) => (
                  <li key={f.id}>
                    <Link to={`/formulaciones/${f.id}`} className="font-medium text-blue-600 hover:underline">
                      {f.producto}
                    </Link>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </>
      )}
    </div>
  );
}