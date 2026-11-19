import { useMemo, useState } from 'react';
import { ChefHat, KeyRound, Mail, RotateCcw, Search, ShieldCheck, UserPlus, UserX, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Esqueleto } from '../../components/feedback/Esqueleto';
import type { RolCodigo } from '../../types/auth.types';
import type { UsuarioPanaderia } from '../../types/usuario.types';
import { ETIQUETA_ROL } from './esquemaUsuario';

type FiltroRol = 'todos' | 'gestion' | 'operario';
type FiltroEstado = 'todos' | 'activos' | 'inactivos';

const ES_GESTION = (r: RolCodigo) => r === 'administrador' || r === 'superadministrador';

// Avatar y chip de rol: el color identifica el rol; el texto y el ícono lo confirman
const ESTILO_ROL: Record<RolCodigo, { avatar: string; chip: string; icono: LucideIcon }> = {
  superadministrador: { avatar: 'bg-terracota text-white', chip: 'bg-terracota-suave text-terracota', icono: ShieldCheck },
  administrador: { avatar: 'bg-azul-noche text-white', chip: 'bg-azul-suave text-azul-noche', icono: ShieldCheck },
  operario: { avatar: 'bg-trigo text-grafito', chip: 'bg-trigo-suave text-atencion-texto', icono: ChefHat },
};

const sinTildes = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const iniciales = (nombre: string) =>
  nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

function Segmentos<T extends string>({
  etiqueta,
  valor,
  opciones,
  onCambiar,
}: {
  etiqueta: string;
  valor: T;
  opciones: { valor: T; texto: string }[];
  onCambiar: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="inline-flex rounded-lg border border-borde-campo bg-white p-0.5">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={o.valor === valor}
          onClick={() => onCambiar(o.valor)}
          className={`min-h-10 rounded-md px-3 text-sm font-semibold transition-colors ${o.valor === valor ? 'bg-azul-noche text-white' : 'text-gris-texto hover:bg-arena'}`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

interface Props {
  usuarios: UsuarioPanaderia[] | undefined;
  cargando: boolean;
  miId: string | undefined;
  ocupado: boolean;
  onCrear: () => void;
  onRestablecer: (u: UsuarioPanaderia) => void;
  onCambiarEstado: (u: UsuarioPanaderia, activo: boolean) => void;
}

function Fila({ u, miId, ocupado, onRestablecer, onCambiarEstado }: Omit<Props, 'usuarios' | 'cargando' | 'onCrear'> & { u: UsuarioPanaderia }) {
  const estilo = ESTILO_ROL[u.rol];
  const Icono = estilo.icono;
  const esYo = u.id === miId;
  const accion = 'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <li className={`grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center ${u.activo ? '' : 'bg-hueso/60'}`}>
      <span
        aria-hidden="true"
        className={`grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold ${u.activo ? estilo.avatar : 'bg-arena text-gris-texto'}`}
      >
        {iniciales(u.nombre)}
      </span>

      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`text-base font-semibold ${u.activo ? 'text-grafito' : 'text-gris-texto'}`}>{u.nombre}</span>
          {esYo && <span className="rounded-full bg-azul-noche px-2 py-0.5 text-[11px] font-bold text-white">Tú</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gris-texto">
          {u.nombre_usuario ? <span className="font-medium text-grafito/80">@{u.nombre_usuario}</span> : <span className="font-medium text-atencion-texto">Sin usuario para entrar</span>}
          {u.email && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Mail size={14} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{u.email}</span>
            </span>
          )}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${estilo.chip}`}>
            <Icono size={13} aria-hidden="true" />
            {ETIQUETA_ROL[u.rol] ?? u.rol}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${u.activo ? 'bg-exito-fondo text-exito-texto' : 'bg-arena text-grafito'}`}>
            <span aria-hidden="true" className={`size-2 rounded-full ${u.activo ? 'bg-verde-bosque' : 'bg-gris-texto'}`} />
            {u.activo ? 'Activo' : 'Inactivo'}
          </span>
          {u.debe_cambiar_password && (
            <span className="inline-flex items-center gap-1 rounded-full bg-atencion-fondo px-2.5 py-1 text-atencion-texto">
              <KeyRound size={13} aria-hidden="true" />
              Debe cambiar la contraseña
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 sm:justify-end">
        {esYo ? (
          <span className="text-sm text-gris-texto">Tu cuenta</span>
        ) : (
          <>
            <button type="button" disabled={ocupado} onClick={() => onRestablecer(u)} className={`${accion} border-borde-campo bg-white text-azul-noche hover:bg-arena`}>
              <KeyRound size={16} aria-hidden="true" />
              Nueva contraseña
            </button>
            {u.activo ? (
              <button type="button" disabled={ocupado} onClick={() => onCambiarEstado(u, false)} className={`${accion} border-critico-texto/30 bg-white text-critico-texto hover:bg-critico-fondo`}>
                <UserX size={16} aria-hidden="true" />
                Desactivar
              </button>
            ) : (
              <button type="button" disabled={ocupado} onClick={() => onCambiarEstado(u, true)} className={`${accion} border-exito-texto/30 bg-white text-exito-texto hover:bg-exito-fondo`}>
                <RotateCcw size={16} aria-hidden="true" />
                Reactivar
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

// Buscador, filtros y lista de personas con acceso a la panadería
export function ListaUsuarios({ usuarios, cargando, miId, ocupado, onCrear, onRestablecer, onCambiarEstado }: Props) {
  const [texto, setTexto] = useState('');
  const [rol, setRol] = useState<FiltroRol>('todos');
  const [estado, setEstado] = useState<FiltroEstado>('todos');

  const visibles = useMemo(() => {
    const q = sinTildes(texto.trim());
    return [...(usuarios ?? [])]
      .filter((u) => (rol === 'todos' ? true : rol === 'gestion' ? ES_GESTION(u.rol) : u.rol === 'operario'))
      .filter((u) => (estado === 'todos' ? true : estado === 'activos' ? u.activo : !u.activo))
      .filter((u) => !q || sinTildes(`${u.nombre} ${u.nombre_usuario ?? ''} ${u.email ?? ''}`).includes(q))
      // Primero quienes tienen acceso, luego gestión antes que operarios, luego por nombre
      .sort((a, b) => Number(b.activo) - Number(a.activo) || Number(ES_GESTION(b.rol)) - Number(ES_GESTION(a.rol)) || a.nombre.localeCompare(b.nombre, 'es'));
  }, [usuarios, texto, rol, estado]);

  const total = usuarios?.length ?? 0;
  const hayFiltros = texto.trim() !== '' || rol !== 'todos' || estado !== 'todos';
  const limpiar = () => {
    setTexto('');
    setRol('todos');
    setEstado('todos');
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar por nombre, usuario o correo</span>
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-texto" />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nombre, usuario o correo"
            className="min-h-11 w-full rounded-lg border border-borde-campo bg-white pl-10 pr-3 text-sm text-grafito placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo"
          />
        </label>
        <Segmentos<FiltroRol>
          etiqueta="Filtrar por rol"
          valor={rol}
          onCambiar={setRol}
          opciones={[
            { valor: 'todos', texto: 'Todos' },
            { valor: 'gestion', texto: 'Administradores' },
            { valor: 'operario', texto: 'Operarios' },
          ]}
        />
        <Segmentos<FiltroEstado>
          etiqueta="Filtrar por estado"
          valor={estado}
          onCambiar={setEstado}
          opciones={[
            { valor: 'todos', texto: 'Todos' },
            { valor: 'activos', texto: 'Activos' },
            { valor: 'inactivos', texto: 'Inactivos' },
          ]}
        />
        {usuarios && total > 0 && (
          <p className="text-sm text-gris-texto" aria-live="polite">
            {visibles.length} de {total}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-tarjeta border border-linea bg-tabla">
        {cargando ? (
          <div className="flex flex-col gap-3 p-4" role="status" aria-label="Cargando usuarios">
            <Esqueleto className="h-16" />
            <Esqueleto className="h-16" />
            <Esqueleto className="h-16" />
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-azul-suave text-azul-noche">
              <Users size={28} />
            </span>
            <p className="font-display text-lg font-semibold text-azul-noche">Aún no hay usuarios</p>
            <p className="max-w-sm text-sm text-gris-texto">Crea el primero para que alguien pueda entrar a la panadería con su propio usuario.</p>
            <Button type="button" onClick={onCrear}>
              <UserPlus size={16} aria-hidden="true" />
              Nuevo usuario
            </Button>
          </div>
        ) : visibles.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-arena text-gris-texto">
              <Search size={26} />
            </span>
            <p className="font-semibold text-azul-noche">Ningún usuario coincide con lo que buscas</p>
            {hayFiltros && (
              <Button type="button" variant="secondary" onClick={limpiar}>
                Quitar filtros
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-linea">
            {visibles.map((u) => (
              <Fila key={u.id} u={u} miId={miId} ocupado={ocupado} onRestablecer={onRestablecer} onCambiarEstado={onCambiarEstado} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
