import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../components/feedback/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EntradaForm } from '../features/inventario/EntradaForm';
import { LotesPanel } from '../features/inventario/LotesPanel';
import {
  COLOR_ESTADO,
  ETIQUETA_ESTADO,
  formatoCantidad,
  formatoDinero,
  formatoFecha,
  textoVencimiento,
} from '../features/inventario/formatos';
import { getInventario, getOpcionesEntrada } from '../services/inventarioService';
import type { EntradaRegistrada, EstadoStock, ItemInventario } from '../types/inventario.types';

type Filtro = 'todos' | EstadoStock;

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'por_vencer', etiqueta: 'Por vencer' },
  { valor: 'vencido', etiqueta: 'Vencidos' },
  { valor: 'sin_stock', etiqueta: 'Sin existencias' },
];

export function InventarioPage() {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [entradaAbierta, setEntradaAbierta] = useState(false);
  const [conLotes, setConLotes] = useState<ItemInventario | null>(null);
  const [registrada, setRegistrada] = useState<EntradaRegistrada | null>(null);

  const inventario = useQuery({ queryKey: ['inventario', 'resumen'], queryFn: getInventario });
  const opciones = useQuery({
    queryKey: ['inventario', 'opciones'],
    queryFn: getOpcionesEntrada,
    // Las presentaciones y proveedores cambian poco; se vuelven a pedir cada vez que se abre el formulario
    staleTime: 0,
  });

  const items = inventario.data?.items;
  const hoy = inventario.data?.fecha ?? '';
  const verValor = (items ?? []).some((i) => i.valor !== undefined);

  const conteo = useMemo(() => {
    const c = { con_stock: 0, por_vencer: 0, vencido: 0, sin_stock: 0, valor: 0 };
    for (const i of items ?? []) {
      if (i.estado === 'sin_stock') c.sin_stock += 1;
      else c.con_stock += 1;
      if (i.estado === 'por_vencer') c.por_vencer += 1;
      if (i.estado === 'vencido') c.vencido += 1;
      c.valor += i.valor ?? 0;
    }
    return c;
  }, [items]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (items ?? []).filter(
      (i) =>
        (filtro === 'todos' || i.estado === filtro) &&
        (!texto || i.nombre.toLowerCase().includes(texto) || i.codigo.toLowerCase().includes(texto)),
    );
  }, [items, busqueda, filtro]);

  function terminarEntrada(r?: EntradaRegistrada) {
    setEntradaAbierta(false);
    if (r) setRegistrada(r);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500">Existencias de materias primas por lote</p>
        </div>
        <Button
          type="button"
          className="min-h-11 w-full sm:w-auto"
          disabled={!opciones.data}
          onClick={() => {
            setRegistrada(null);
            void opciones.refetch();
            setEntradaAbierta(true);
          }}
        >
          Registrar entrada
        </Button>
      </div>

      {opciones.isError && (
        <Alert variant="warning">
          No se pudieron cargar los insumos para registrar entradas.{' '}
          <button type="button" className="font-medium underline" onClick={() => opciones.refetch()}>
            Reintentar
          </button>
        </Alert>
      )}

      {registrada && (
        <Alert variant="success">
          Entrada registrada: {formatoCantidad(registrada.lote.cantidad, registrada.lote.unidad)} de{' '}
          <span className="font-medium">{registrada.lote.nombre}</span> en el lote{' '}
          <span className="font-medium">{registrada.lote.codigo_lote}</span>.
        </Alert>
      )}

      {items && (
        <div className={`grid grid-cols-2 gap-3 ${verValor ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
          <Resumen titulo="Con existencias" valor={String(conteo.con_stock)} />
          <Resumen titulo="Por vencer" valor={String(conteo.por_vencer)} alerta={conteo.por_vencer > 0 ? 'amarillo' : undefined} />
          <Resumen titulo="Vencidos" valor={String(conteo.vencido)} alerta={conteo.vencido > 0 ? 'rojo' : undefined} />
          <Resumen titulo="Sin existencias" valor={String(conteo.sin_stock)} />
          {verValor && <Resumen titulo="Valor del inventario" valor={formatoDinero(conteo.valor)} />}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o código"
          aria-label="Buscar insumo"
          className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-base sm:max-w-xs sm:text-sm"
        />
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              aria-pressed={filtro === f.valor}
              onClick={() => setFiltro(f.valor)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${
                filtro === f.valor
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {inventario.isLoading ? (
        <LoadingState mensaje="Cargando inventario..." />
      ) : inventario.isError ? (
        <ErrorState onReintentar={() => inventario.refetch()} />
      ) : visibles.length === 0 ? (
        <EmptyState
          titulo={items && items.length > 0 ? 'Sin resultados' : 'Sin insumos'}
          mensaje={items && items.length > 0 ? 'Ningún insumo coincide con la búsqueda o el filtro.' : 'Aún no hay materias primas registradas.'}
        />
      ) : (
        <>
          {/* Celular: una tarjeta por insumo */}
          <ul className="flex flex-col gap-2 md:hidden">
            {visibles.map((i) => (
              <li key={i.materia_prima_id}>
                <button
                  type="button"
                  onClick={() => setConLotes(i)}
                  className="flex w-full flex-col gap-1 rounded-lg border border-gray-200 bg-white p-4 text-left active:bg-gray-50"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium text-gray-900">{i.nombre}</span>
                    <Badge color={COLOR_ESTADO[i.estado]}>{ETIQUETA_ESTADO[i.estado]}</Badge>
                  </span>
                  <span className="text-lg font-semibold text-gray-900">{formatoCantidad(i.stock, i.unidad)}</span>
                  <span className="text-xs text-gray-500">
                    {i.lotes_activos > 0
                      ? `${i.lotes_activos} ${i.lotes_activos === 1 ? 'lote' : 'lotes'} · ${
                          i.proximo_vencimiento ? textoVencimiento(hoy, i.proximo_vencimiento) : 'Sin vencimiento'
                        }`
                      : i.codigo}
                    {i.valor !== undefined && i.stock > 0 ? ` · ${formatoDinero(i.valor)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* Pantalla ancha: tabla */}
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 md:block">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Código', 'Insumo', 'Existencias', 'Lotes', 'Próximo vencimiento', 'Estado', ...(verValor ? ['Valor'] : []), ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {visibles.map((i) => (
                  <tr key={i.materia_prima_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">{i.codigo}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{i.nombre}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{formatoCantidad(i.stock, i.unidad)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{i.lotes_activos}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {i.proximo_vencimiento ? `${formatoFecha(i.proximo_vencimiento)} · ${textoVencimiento(hoy, i.proximo_vencimiento)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Badge color={COLOR_ESTADO[i.estado]}>{ETIQUETA_ESTADO[i.estado]}</Badge>
                    </td>
                    {verValor && <td className="px-4 py-3 text-sm text-gray-700">{i.stock > 0 ? formatoDinero(i.valor ?? 0) : '—'}</td>}
                    <td className="px-4 py-3 text-sm">
                      <button type="button" className="font-medium text-blue-600 hover:underline" onClick={() => setConLotes(i)}>
                        Ver lotes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal isOpen={entradaAbierta} onClose={() => setEntradaAbierta(false)} title="Registrar entrada">
        {opciones.data && <EntradaForm opciones={opciones.data} onTerminar={terminarEntrada} />}
      </Modal>

      <Modal isOpen={conLotes !== null} onClose={() => setConLotes(null)} title={conLotes ? `Lotes · ${conLotes.nombre}` : 'Lotes'}>
        {conLotes && <LotesPanel key={conLotes.materia_prima_id} materiaId={conLotes.materia_prima_id} hoy={hoy} />}
      </Modal>
    </div>
  );
}

function Resumen({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: 'amarillo' | 'rojo' }) {
  const color = alerta === 'rojo' ? 'border-red-200 bg-red-50' : alerta === 'amarillo' ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200 bg-white';
  return (
    <div className={`rounded-lg border p-3 ${color}`}>
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className="text-xl font-semibold text-gray-900">{valor}</p>
    </div>
  );
}
