import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/feedback/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../features/inicio/Panel';
import { CompletarVacios } from '../features/reposicion/CompletarVacios';
import { ESTADOS, etiquetaFaltante } from '../features/reposicion/etiquetas';
import { ParametroForm } from '../features/reposicion/ParametroForm';
import { NavReposicion } from '../features/reposicion/NavReposicion';
import { getParametrosReposicion, getRecomendaciones } from '../services/reposicionService';
import { getProveedores } from '../services/proveedoresService';
import type { ItemParametros } from '../types/reposicion.types';

type Filtro = 'todos' | 'faltan' | 'al_uso' | 'completos';
const ETIQUETA_FILTRO: Record<Filtro, string> = { todos: 'Todos', faltan: 'Con datos por completar', completos: 'Completos', al_uso: 'Según la producción' };
const RANGO_CLASE = (c: string | null) => (c === 'A' ? 0 : c === 'B' ? 1 : c === 'C' ? 2 : 3);

// Captura de los parámetros que necesita el cálculo de reposición, insumo por insumo.
export function ParametrosReposicionPage() {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [editando, setEditando] = useState<ItemParametros | null>(null);
  const [completando, setCompletando] = useState(false);
  // Si se elige un dato que falta (por ejemplo "consumo semanal"), la lista solo muestra los insumos a los que les falta ese dato
  const [faltaCodigo, setFaltaCodigo] = useState<string | null>(null);

  const parametros = useQuery({ queryKey: ['reposicion', 'parametros'], queryFn: getParametrosReposicion });
  const recomendaciones = useQuery({ queryKey: ['reposicion', 'recomendaciones'], queryFn: getRecomendaciones });
  const proveedores = useQuery({ queryKey: ['proveedores'], queryFn: getProveedores });

  // Estado y faltantes de cada insumo, tomados del propio cálculo
  const calculo = useMemo(() => {
    const m = new Map<string, { estado: keyof typeof ESTADOS; faltantes: string[] }>();
    for (const i of recomendaciones.data?.items ?? []) m.set(i.materia_prima_id, { estado: i.estado, faltantes: i.faltantes });
    return m;
  }, [recomendaciones.data]);
  const alUso = useMemo(() => new Set((recomendaciones.data?.al_uso ?? []).map((i) => i.materia_prima_id)), [recomendaciones.data]);

  const items = parametros.data?.items ?? [];
  const sinCalendario = (proveedores.data ?? []).filter((p) => p.activo && p.alcance === 'panaderia' && p.dias_entrega.length === 0);

  // Una sola definición de «al uso» y «con datos por completar», para que filtros, conteos y lista no se contradigan
  const situacion = (i: ItemParametros) => {
    const esAlUso = alUso.has(i.materia_prima_id) || i.parametros?.modo_reposicion === 'al_uso';
    const c = calculo.get(i.materia_prima_id);
    return { esAlUso, c, faltan: !esAlUso && (c === undefined || c.faltantes.length > 0) };
  };
  const cumple = (i: ItemParametros, f: Filtro) => {
    const { esAlUso, c, faltan } = situacion(i);
    if (f === 'faltan') return faltan && (faltaCodigo === null || (c?.faltantes.includes(faltaCodigo) ?? false));
    if (f === 'al_uso') return esAlUso;
    if (f === 'completos') return !esAlUso && !faltan;
    return true;
  };
  const cuenta = (f: Filtro) => items.filter((i) => (f === 'faltan' ? situacion(i).faltan : cumple(i, f))).length;

  // Primero lo que falta y, dentro de eso, lo que más pesa (clase A): por ahí conviene empezar
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return items
      .filter((i) => (!texto || i.nombre.toLowerCase().includes(texto) || i.codigo.toLowerCase().includes(texto)) && cumple(i, filtro))
      .sort((a, b) => Number(situacion(b).faltan) - Number(situacion(a).faltan) || RANGO_CLASE(a.clase_abc) - RANGO_CLASE(b.clase_abc) || a.nombre.localeCompare(b.nombre, 'es'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, busqueda, filtro, faltaCodigo, calculo, alUso]);

  // Cuántos insumos tienen incompleto cada dato, para saber por dónde empezar
  const faltas = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) {
      if (alUso.has(i.materia_prima_id) || i.parametros?.modo_reposicion === 'al_uso') continue;
      for (const f of calculo.get(i.materia_prima_id)?.faltantes ?? []) m.set(f, (m.get(f) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items, calculo, alUso]);
  const totalAlUso = items.filter((i) => alUso.has(i.materia_prima_id) || i.parametros?.modo_reposicion === 'al_uso').length;

  const cuantosFaltan = items.filter((i) => situacion(i).faltan).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo="Parámetros de reposición"
        subtitulo={`Lo que el sistema necesita saber de cada insumo para decir cuándo y cuánto pedir${parametros.data ? ` · ${cuantosFaltan} de ${items.length} con datos por completar` : ''}`}
        acciones={
          <Button type="button" onClick={() => setCompletando(true)} disabled={items.length === 0}>
            Completar vacíos
          </Button>
        }
      />

      <NavReposicion />

      {sinCalendario.length > 0 && (
        <Alert variant="warning">
          {sinCalendario.length === 1 ? 'Un proveedor no tiene' : `${sinCalendario.length} proveedores no tienen`} días de entrega:{' '}
          {sinCalendario.map((p) => p.nombre).join(', ')}. Sin ellos no se calcula cuándo pedir.{' '}
          <Link to="/proveedores" className="font-medium underline">
            Definirlos en Proveedores
          </Link>
        </Alert>
      )}

      {parametros.data && items.length > 0 && (
        <Panel
          titulo="Qué falta completar"
          subtitulo={
            cuantosFaltan === 0
              ? 'Todos los insumos tienen sus datos. El cálculo de reposición ya puede usarlos.'
              : 'Toca un dato para ver solo los insumos a los que les falta. «Completar vacíos» los llena de una vez.'
          }
        >
          {(() => {
            const total = items.length - totalAlUso;
            const completos = Math.max(total - cuantosFaltan, 0);
            return (
              <div className="flex flex-col gap-3">
                <div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-grafito">
                      <span className="cifras font-display text-xl font-semibold text-azul-noche">{completos}</span> de {total} insumos completos
                    </span>
                    {totalAlUso > 0 && <span className="text-xs text-gris-texto">{totalAlUso} se compran según la producción</span>}
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-arena" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completos} aria-label="Insumos completos">
                    <div className="h-full rounded-full bg-verde-bosque" style={{ width: `${total > 0 ? (completos / total) * 100 : 0}%` }} />
                  </div>
                </div>
                {faltas.length > 0 && (
                  <ul className="flex flex-wrap gap-2" aria-label="Datos que faltan">
                    {faltas.map(([codigo, n]) => {
                      const activo = faltaCodigo === codigo;
                      return (
                        <li key={codigo}>
                          <button
                            type="button"
                            aria-pressed={activo}
                            onClick={() => {
                              setFaltaCodigo(activo ? null : codigo);
                              setFiltro(activo ? 'todos' : 'faltan');
                            }}
                            className={`min-h-11 rounded-full border px-3 text-sm ${activo ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo text-grafito hover:bg-arena'}`}
                          >
                            {etiquetaFaltante(codigo)} <span className="cifras font-semibold">· {n}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })()}
        </Panel>
      )}

      <div className="flex flex-col gap-3">
        <input
          type="search"
          aria-label="Buscar insumo"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar insumo"
          className="min-h-11 w-full rounded-md border border-borde-campo px-3 py-2 text-base focus:outline-hidden focus:ring-2 focus:ring-trigo sm:max-w-xs sm:text-sm"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar insumos">
          {(['todos', 'faltan', 'completos', 'al_uso'] as const).filter((f) => f === 'todos' || cuenta(f) > 0).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => { setFiltro(f); setFaltaCodigo(null); }}
              className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors ${filtro === f ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-white text-azul-noche hover:bg-arena'}`}
            >
              {ETIQUETA_FILTRO[f]}
              <span className="cifras text-xs opacity-80">{cuenta(f)}</span>
            </button>
          ))}
        </div>
      </div>

      {parametros.isLoading && <LoadingState />}
      {parametros.isError && <ErrorState onReintentar={() => parametros.refetch()} />}
      {parametros.data && visibles.length === 0 && <EmptyState titulo="Sin insumos" mensaje="Ningún insumo coincide con el filtro." />}

      <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1.8fr)_5rem] gap-4 px-3 text-xs font-semibold uppercase tracking-wider text-gris-texto sm:grid" aria-hidden="true">
        <span>Insumo</span>
        <span>Estado</span>
        <span>Qué falta</span>
        <span />
      </div>
      <ul className="flex flex-col overflow-hidden rounded-tarjeta border border-linea bg-tabla">
        {visibles.map((i) => {
          const { esAlUso, c } = situacion(i);
          return (
            <li
              key={i.materia_prima_id}
              className="grid items-center gap-x-4 gap-y-2 border-b border-linea px-3 py-3 last:border-b-0 hover:bg-hueso sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1.8fr)_5rem]"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-azul-noche">
                  {i.nombre}
                  {i.clase_abc && <Badge color={i.clase_abc === 'A' ? 'red' : i.clase_abc === 'B' ? 'yellow' : 'gray'}>Clase {i.clase_abc}</Badge>}
                </p>
                <p className="text-xs text-gris-texto">{i.codigo}</p>
              </div>
              <div>
                {esAlUso ? <Badge color="blue">Según la producción</Badge> : c ? <Badge color={ESTADOS[c.estado].color}>{ESTADOS[c.estado].etiqueta}</Badge> : <Badge>Sin calcular</Badge>}
              </div>
              <p className="text-xs text-gris-texto">
                {esAlUso ? 'No necesita parámetros de reposición' : c && c.faltantes.length > 0 ? c.faltantes.map(etiquetaFaltante).join(', ') : c ? 'Completo' : '—'}
              </p>
              <div className="sm:text-right">
                <Button type="button" variant="secondary" onClick={() => setEditando(i)}>
                  Editar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal isOpen={editando !== null} onClose={() => setEditando(null)} title={editando ? `Parámetros de ${editando.nombre}` : 'Parámetros'}>
        {editando !== null && <ParametroForm key={editando.materia_prima_id} item={editando} onTerminar={() => setEditando(null)} />}
      </Modal>

      <Modal isOpen={completando} onClose={() => setCompletando(false)} title="Completar vacíos">
        {completando && <CompletarVacios items={items} onTerminar={() => setCompletando(false)} />}
      </Modal>
    </div>
  );
}
