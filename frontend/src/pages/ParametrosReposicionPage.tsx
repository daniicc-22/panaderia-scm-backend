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
import { CompletarVacios } from '../features/reposicion/CompletarVacios';
import { ESTADOS, etiquetaFaltante } from '../features/reposicion/etiquetas';
import { ParametroForm } from '../features/reposicion/ParametroForm';
import { NavReposicion } from '../features/reposicion/NavReposicion';
import { getParametrosReposicion, getRecomendaciones } from '../services/reposicionService';
import { getProveedores } from '../services/proveedoresService';
import type { ItemParametros } from '../types/reposicion.types';

type Filtro = 'todos' | 'faltan' | 'al_uso' | 'completos';

// Captura de los parámetros que necesita el cálculo de reposición, insumo por insumo.
export function ParametrosReposicionPage() {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [editando, setEditando] = useState<ItemParametros | null>(null);
  const [completando, setCompletando] = useState(false);

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

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return items.filter((i) => {
      if (texto && !i.nombre.toLowerCase().includes(texto) && !i.codigo.toLowerCase().includes(texto)) return false;
      const esAlUso = alUso.has(i.materia_prima_id) || i.parametros?.modo_reposicion === 'al_uso';
      const c = calculo.get(i.materia_prima_id);
      const faltan = !esAlUso && (c === undefined || c.faltantes.length > 0);
      if (filtro === 'faltan') return faltan;
      if (filtro === 'al_uso') return esAlUso;
      if (filtro === 'completos') return !esAlUso && !faltan;
      return true;
    });
  }, [items, busqueda, filtro, calculo, alUso]);

  const cuantosFaltan = items.filter((i) => {
    const esAlUso = alUso.has(i.materia_prima_id) || i.parametros?.modo_reposicion === 'al_uso';
    const c = calculo.get(i.materia_prima_id);
    return !esAlUso && (c === undefined || c.faltantes.length > 0);
  }).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 -mt-4 bg-pizarra px-4 py-5 text-white sm:-mx-6 sm:-mt-6 sm:px-7 sm:py-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white sm:text-[28px]">Parámetros de reposición</h1>
          <p className="mt-1 text-sm text-niebla">
            Lo que el sistema necesita saber de cada insumo para decir cuándo y cuánto pedir
            {parametros.data ? ` · ${cuantosFaltan} de ${items.length} con datos por completar` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setCompletando(true)} disabled={items.length === 0}>
            Completar vacíos
          </Button>
        </div>
      </div>

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar insumo"
          className="w-full rounded-md border border-borde-campo px-3 py-2 text-sm sm:max-w-xs"
        />
        <select
          aria-label="Filtrar"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
          className="rounded-md border border-borde-campo px-3 py-2 text-sm"
        >
          <option value="todos">Todos</option>
          <option value="faltan">Con datos por completar</option>
          <option value="completos">Completos</option>
          <option value="al_uso">Se compran según la producción</option>
        </select>
      </div>

      {parametros.isLoading && <LoadingState />}
      {parametros.isError && <ErrorState onReintentar={() => parametros.refetch()} />}
      {parametros.data && visibles.length === 0 && <EmptyState titulo="Sin insumos" mensaje="Ningún insumo coincide con el filtro." />}

      <ul className="flex flex-col gap-2">
        {visibles.map((i) => {
          const esAlUso = alUso.has(i.materia_prima_id) || i.parametros?.modo_reposicion === 'al_uso';
          const c = calculo.get(i.materia_prima_id);
          return (
            <li key={i.materia_prima_id} className="flex flex-col gap-2 rounded-lg border border-linea bg-tabla p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-grafito">
                  {i.nombre}
                  {i.clase_abc && <Badge color={i.clase_abc === 'A' ? 'red' : i.clase_abc === 'B' ? 'yellow' : 'gray'}>Clase {i.clase_abc}</Badge>}
                  {esAlUso ? <Badge color="blue">Se compra según la producción</Badge> : c && <Badge color={ESTADOS[c.estado].color}>{ESTADOS[c.estado].etiqueta}</Badge>}
                </p>
                {!esAlUso && c && c.faltantes.length > 0 && (
                  <p className="text-xs text-gris-texto">Falta: {c.faltantes.map(etiquetaFaltante).join(', ')}</p>
                )}
                <p className="text-xs text-gris-texto">{i.codigo}</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setEditando(i)}>
                Editar
              </Button>
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
