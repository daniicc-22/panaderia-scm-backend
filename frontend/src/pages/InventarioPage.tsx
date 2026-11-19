import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { BotonImprimir } from '../components/ui/BotonImprimir';
import { Indicador } from '../features/inicio/Panel';
import { useAuth } from '../features/auth/useAuth';
import { getMiPanaderia } from '../services/panaderiaService';
import { EmptyState } from '../components/feedback/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { AlertasVencimiento } from '../features/inventario/AlertasVencimiento';
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

type Filtro = 'todos' | 'con_stock' | EstadoStock;
type Orden = 'nombre' | 'vencimiento' | 'valor';
const sinTildes = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const BORDE_ESTADO: Record<EstadoStock, string> = {
  ok: 'border-linea border-l-verde-bosque',
  por_vencer: 'border-linea border-l-trigo',
  vencido: 'border-linea border-l-critico',
  sin_stock: 'border-linea border-l-borde-campo',
};

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'con_stock', etiqueta: 'Con existencias' },
  { valor: 'por_vencer', etiqueta: 'Por vencer' },
  { valor: 'vencido', etiqueta: 'Vencidos' },
  { valor: 'sin_stock', etiqueta: 'Sin existencias' },
];

export function InventarioPage() {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [orden, setOrden] = useState<Orden>('nombre');
  const { usuario } = useAuth();
  const panaderia = useQuery({ queryKey: ['mi-panaderia', usuario?.id], queryFn: getMiPanaderia, enabled: !!usuario, staleTime: 5 * 60 * 1000 });
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
    const texto = sinTildes(busqueda.trim());
    const filtrados = (items ?? []).filter(
      (i) => (filtro === 'todos' || (filtro === 'con_stock' ? i.estado !== 'sin_stock' : i.estado === filtro)) && (!texto || sinTildes(i.nombre).includes(texto) || sinTildes(i.codigo).includes(texto)),
    );
    const porNombre = (x: ItemInventario, y: ItemInventario) => x.nombre.localeCompare(y.nombre, 'es');
    return [...filtrados].sort((x, y) => {
      // Los insumos con existencias van primero: los agotados no deben tapar lo que sí hay
      const conStock = Number(y.stock > 0) - Number(x.stock > 0);
      if (conStock !== 0) return conStock;
      // Lo que no tiene dato (sin vencimiento, sin valor) va al final
      if (orden === 'vencimiento') return (x.proximo_vencimiento === null ? 1 : y.proximo_vencimiento === null ? -1 : x.proximo_vencimiento.localeCompare(y.proximo_vencimiento)) || porNombre(x, y);
      if (orden === 'valor') return (y.valor ?? -1) - (x.valor ?? -1) || porNombre(x, y);
      return porNombre(x, y);
    });
  }, [items, busqueda, filtro, orden]);

  const conteoFiltro = (f: Filtro) => (f === 'todos' ? (items ?? []).length : f === 'con_stock' ? (items ?? []).filter((i) => i.estado !== 'sin_stock').length : (items ?? []).filter((i) => i.estado === f).length);

  function abrirEntrada() {
    setRegistrada(null);
    void opciones.refetch();
    setEntradaAbierta(true);
  }

  function terminarEntrada(r?: EntradaRegistrada) {
    setEntradaAbierta(false);
    if (r) setRegistrada(r);
  }

  return (
    <div className="ficha-impresion flex flex-col gap-4">
      <div className="hidden print:block">
        <p className="text-xs font-semibold uppercase tracking-wider text-gris-texto">{panaderia.data?.nombre ?? ''}</p>
        <h1 className="font-display text-2xl font-semibold text-azul-noche">Inventario de materias primas</h1>
        <p className="mt-1 text-sm text-gris-texto">Existencias al {hoy ? formatoFecha(hoy) : ''}</p>
      </div>

      <PageHeader
        ocultarAlImprimir
        titulo="Existencias"
        subtitulo={`Materias primas por lote${hoy ? ` · al ${formatoFecha(hoy)}` : ''}`}
        acciones={
          <>
            {items && items.length > 0 && <BotonImprimir etiqueta="Imprimir inventario" />}
            <Button
              type="button"
              disabled={!opciones.data}
              onClick={abrirEntrada}
            >
              Registrar entrada
            </Button>
          </>
        }
      />

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

      <div className="print:hidden">
        <AlertasVencimiento />
      </div>

      {items && (
        <div className={`kpis grid grid-cols-2 gap-3 ${verValor ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
          <Indicador etiqueta="Con existencias" valor="—" numero={conteo.con_stock} detalle={`de ${items.length} insumos`} tono="azul" indice={0} />
          <Indicador etiqueta="Por vencer" valor="—" numero={conteo.por_vencer} detalle={conteo.por_vencer > 0 ? 'Usar primero' : 'Ninguno próximo a vencer'} tono={conteo.por_vencer > 0 ? 'amarillo' : 'gris'} indice={1} />
          <Indicador etiqueta="Vencidos" valor="—" numero={conteo.vencido} detalle={conteo.vencido > 0 ? 'Dar de baja o corregir' : 'Todo en fecha'} tono={conteo.vencido > 0 ? 'rojo' : 'verde'} indice={2} />
          <Indicador etiqueta="Sin existencias" valor="—" numero={conteo.sin_stock} detalle={conteo.sin_stock > 0 ? 'Revisar reposición' : undefined} tono="gris" enlace={conteo.sin_stock > 0 ? '/reposicion' : undefined} indice={3} />
          {verValor && <Indicador etiqueta="Valor del inventario" valor="—" numero={conteo.valor} formato={(n) => formatoDinero(n)} tono="verde" indice={4} />}
        </div>
      )}

      <div className="flex flex-col gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-texto" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código"
              aria-label="Buscar insumo"
              className="min-h-11 w-full rounded-lg border border-borde-campo bg-white pl-9 pr-3 text-base placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo sm:text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-grafito sm:ml-auto">
            <span className="whitespace-nowrap font-medium text-gris-texto">Ordenar por</span>
            <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className="min-h-11 rounded-lg border border-borde-campo bg-white px-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-trigo">
              <option value="nombre">Nombre</option>
              <option value="vencimiento">Vencimiento más próximo</option>
              {verValor && <option value="valor">Mayor valor</option>}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              aria-pressed={filtro === f.valor}
              onClick={() => setFiltro(f.valor)}
              className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors ${
                filtro === f.valor ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-white text-azul-noche hover:bg-arena'
              }`}
            >
              {f.etiqueta}
              <span className="cifras text-xs opacity-80">{conteoFiltro(f.valor)}</span>
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
          <ul className="flex flex-col gap-2 md:hidden print:hidden">
            {visibles.map((i) => (
              <li key={i.materia_prima_id}>
                <button
                  type="button"
                  onClick={() => setConLotes(i)}
                  className={`flex w-full flex-col gap-1 rounded-tarjeta border border-l-4 bg-tabla p-4 text-left active:bg-arena ${BORDE_ESTADO[i.estado]}`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium text-grafito">{i.nombre}</span>
                    <Badge color={COLOR_ESTADO[i.estado]}>{ETIQUETA_ESTADO[i.estado]}</Badge>
                  </span>
                  <span className="text-lg font-semibold text-grafito">{formatoCantidad(i.stock, i.unidad)}</span>
                  <span className="text-xs text-gris-texto">
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
          <div className="hidden overflow-x-auto rounded-tarjeta border border-linea bg-tabla md:block print:block print:overflow-visible">
            <table className="min-w-full divide-y divide-linea">
              <thead className="bg-hueso">
                <tr>
                  {['Código', 'Insumo', 'Existencias', 'Lotes', 'Próximo vencimiento', 'Estado', ...(verValor ? ['Valor'] : []), ''].map((h) => (
                    <th key={h} className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-azul-noche ${h === '' ? 'print:hidden' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-linea bg-tabla">
                {visibles.map((i) => (
                  <tr key={i.materia_prima_id} className={`hover:bg-hueso ${i.estado === 'vencido' ? 'bg-critico-fondo/40' : ''}`}>
                    <td className="px-4 py-3 text-sm text-grafito">{i.codigo}</td>
                    <td className="px-4 py-3 text-sm font-medium text-grafito">{i.nombre}</td>
                    <td className={`cifras px-4 py-3 text-sm ${i.stock > 0 ? 'font-semibold text-grafito' : 'text-gris-texto'}`}>{formatoCantidad(i.stock, i.unidad)}</td>
                    <td className="px-4 py-3 text-sm text-grafito">{i.lotes_activos}</td>
                    <td className="px-4 py-3 text-sm text-grafito">
                      {i.proximo_vencimiento ? (
                        <>
                          {formatoFecha(i.proximo_vencimiento)}
                          <span className={`block text-xs ${i.estado === 'vencido' ? 'font-semibold text-critico-texto' : i.estado === 'por_vencer' ? 'font-semibold text-atencion-texto' : 'text-gris-texto'}`}>
                            {textoVencimiento(hoy, i.proximo_vencimiento)}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Badge color={COLOR_ESTADO[i.estado]}>{ETIQUETA_ESTADO[i.estado]}</Badge>
                    </td>
                    {verValor && (
                      <td className="px-4 py-3 text-sm text-grafito">
                        {i.stock > 0 ? (
                          <>
                            <span className="cifras font-semibold">{formatoDinero(i.valor ?? 0)}</span>
                            {conteo.valor > 0 && (
                              <span className="mt-1 flex items-center gap-2 text-xs text-gris-texto">
                                <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-arena print:hidden">
                                  <span className="block h-full rounded-full bg-azul-noche" style={{ width: `${Math.max(((i.valor ?? 0) / conteo.valor) * 100, 2)}%` }} />
                                </span>
                                {Math.round(((i.valor ?? 0) / conteo.valor) * 100)} %
                              </span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm print:hidden">
                      {i.stock > 0 ? (
                        <button type="button" className="font-medium text-pizarra hover:underline" onClick={() => setConLotes(i)}>
                          Ver lotes
                        </button>
                      ) : (
                        <button type="button" className="font-medium text-gris-texto hover:text-pizarra hover:underline" disabled={!opciones.data} onClick={abrirEntrada}>
                          Registrar entrada
                        </button>
                      )}
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
