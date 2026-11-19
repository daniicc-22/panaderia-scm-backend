import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EditorVersion } from '../features/formulaciones/EditorVersion';
import { ListaFormulaciones } from '../features/formulaciones/ListaFormulaciones';
import { useAuth } from '../features/auth/useAuth';
import { Indicador } from '../features/inicio/Panel';
import { getFormulaciones, getFormulacionesConInactivos } from '../services/formulacionesService';

const ROLES_GESTION = ['administrador', 'superadministrador'];
type Filtro = 'todas' | 'finales' | 'intermedios' | 'incompletas' | 'sinficha';
type Orden = 'nombre' | 'costo' | 'margen' | 'recientes';
const sinTildes = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function FormulacionesPage() {
  const { usuario } = useAuth();
  const puedeGestionar = ROLES_GESTION.includes(usuario?.rol ?? '');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [orden, setOrden] = useState<Orden>('nombre');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [creando, setCreando] = useState(false);
  const conInactivos = puedeGestionar && mostrarInactivos;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['formulaciones', conInactivos ? 'con-inactivos' : 'activos'],
    queryFn: conInactivos ? getFormulacionesConInactivos : getFormulaciones,
  });

  const lista = data ?? [];
  const intermedios = lista.filter((f) => f.es_intermedio).length;
  const incompletas = lista.filter((f) => f.costo_incompleto).length;
  const conFicha = lista.filter((f) => f.ficha_completa).length;
  const sinFicha = lista.length - conFicha;
  const pctFicha = lista.length > 0 ? Math.round((conFicha / lista.length) * 100) : 0;
  const verCostos = lista.some((f) => f.costo_lote !== null);

  const hayMargen = lista.some((f) => f.margen_pct !== null);

  const filtradas = useMemo(() => {
    const texto = sinTildes(busqueda.trim());
    const visibles = lista.filter((f) => {
      if (texto && !sinTildes(f.producto).includes(texto)) return false;
      if (filtro === 'finales') return !f.es_intermedio;
      if (filtro === 'intermedios') return f.es_intermedio;
      if (filtro === 'incompletas') return f.costo_incompleto;
      if (filtro === 'sinficha') return !f.ficha_completa;
      return true;
    });
    const porNombre = (a: (typeof visibles)[number], b: (typeof visibles)[number]) => a.producto.localeCompare(b.producto, 'es');
    // Lo que no tiene dato (sin costo o sin precio de venta) va al final
    const mayorPrimero = (a: number | null, b: number | null) => (a === null ? 1 : b === null ? -1 : b - a);
    return [...visibles].sort((a, b) => {
      if (orden === 'costo') return mayorPrimero(a.costo_unidad, b.costo_unidad) || porNombre(a, b);
      if (orden === 'margen') return (a.margen_pct === null ? 1 : b.margen_pct === null ? -1 : a.margen_pct - b.margen_pct) || porNombre(a, b);
      if (orden === 'recientes') return b.vigente_desde.localeCompare(a.vigente_desde) || porNombre(a, b);
      return porNombre(a, b);
    });
  }, [lista, busqueda, filtro, orden]);

  const chips: { id: Filtro; texto: string; n: number; ver: boolean }[] = [
    { id: 'todas', texto: 'Todas', n: lista.length, ver: true },
    { id: 'finales', texto: 'Productos finales', n: lista.length - intermedios, ver: intermedios > 0 },
    { id: 'intermedios', texto: 'Intermedios', n: intermedios, ver: intermedios > 0 },
    { id: 'sinficha', texto: 'Sin ficha completa', n: sinFicha, ver: puedeGestionar && sinFicha > 0 },
    { id: 'incompletas', texto: 'Costo incompleto', n: incompletas, ver: verCostos && incompletas > 0 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo="Formulaciones"
        subtitulo={data ? `${lista.length} ${lista.length === 1 ? 'receta estandarizada' : 'recetas estandarizadas'}` : 'Recetas estandarizadas'}
        acciones={
          puedeGestionar && (
            <Button type="button" onClick={() => setCreando(true)}>
              <Plus size={16} aria-hidden="true" />
              Nuevo producto
            </Button>
          )
        }
      />

      {isError && (
        <Alert variant="error">
          No se pudieron cargar las formulaciones.{' '}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>
            Reintentar
          </button>
        </Alert>
      )}

      {data && lista.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador etiqueta="Recetas" valor="—" numero={lista.length} detalle="Con versión vigente" tono="azul" indice={0} />
          {puedeGestionar ? (
            <Indicador etiqueta="Ficha técnica completa" valor={`${conFicha} de ${lista.length}`} detalle={`${pctFicha} % estandarizadas`} tono={sinFicha === 0 ? 'verde' : 'amarillo'} indice={1} />
          ) : (
            <Indicador etiqueta="Productos finales" valor="—" numero={lista.length - intermedios} tono="amarillo" indice={1} />
          )}
          <Indicador etiqueta="Intermedios" valor="—" numero={intermedios} detalle="Masas y bases reutilizables" tono="verde" indice={2} />
          {verCostos && (
            <Indicador etiqueta="Costo incompleto" valor="—" numero={incompletas} detalle={incompletas > 0 ? 'Falta algún precio' : 'Todas con costo completo'} tono="gris" indice={3} />
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-texto" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto"
              aria-label="Buscar producto"
              className="min-h-11 w-full rounded-lg border border-borde-campo bg-white pl-9 pr-3 text-base placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo sm:text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-grafito sm:ml-auto">
            <span className="whitespace-nowrap font-medium text-gris-texto">Ordenar por</span>
            <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className="min-h-11 rounded-lg border border-borde-campo bg-white px-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-trigo">
              <option value="nombre">Nombre</option>
              {verCostos && <option value="costo">Costo por unidad (mayor primero)</option>}
              {hayMargen && <option value="margen">Margen (menor primero)</option>}
              <option value="recientes">Modificadas hace poco</option>
            </select>
          </label>
          {puedeGestionar && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-grafito">
              <input type="checkbox" className="size-4 accent-azul-noche" checked={mostrarInactivos} onChange={(e) => setMostrarInactivos(e.target.checked)} />
              Mostrar dados de baja
            </label>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {chips
            .filter((c) => c.ver)
            .map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={filtro === c.id}
                onClick={() => setFiltro(c.id)}
                className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors ${filtro === c.id ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-white text-azul-noche hover:bg-arena'}`}
              >
                {c.texto}
                <span className="cifras text-xs opacity-80">{c.n}</span>
              </button>
            ))}
        </div>
      </div>

      {!isError && (
        <ListaFormulaciones
          formulaciones={filtradas}
          cargando={isLoading}
          mostrarFicha={puedeGestionar}
          vacio={busqueda || filtro !== 'todas' ? 'Ninguna receta coincide con el filtro.' : 'Aún no hay recetas. Crea el primer producto con su formulación.'}
        />
      )}

      {puedeGestionar && (
        <Modal isOpen={creando} onClose={() => setCreando(false)} size="lg" title="Nuevo producto">
          {creando && <EditorVersion onTerminar={() => setCreando(false)} />}
        </Modal>
      )}
    </div>
  );
}
