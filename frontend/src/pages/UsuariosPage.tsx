import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable, type ColumnaTabla } from '../components/tables/DataTable';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { useAuth } from '../features/auth/useAuth';
import { ETIQUETA_ROL } from '../features/usuarios/esquemaUsuario';
import { RestablecerContrasenaForm } from '../features/usuarios/RestablecerContrasenaForm';
import { UsuarioForm } from '../features/usuarios/UsuarioForm';
import { mensajeDeError } from '../services/errores';
import { cambiarEstadoUsuario, getPanaderiasDisponibles, getUsuarios } from '../services/usuariosService';
import type { UsuarioPanaderia } from '../types/usuario.types';

interface Acciones {
  miId: string | undefined;
  ocupado: boolean;
  onRestablecer: (u: UsuarioPanaderia) => void;
  onCambiarEstado: (u: UsuarioPanaderia, activo: boolean) => void;
}

function crearColumnas(a: Acciones): ColumnaTabla<UsuarioPanaderia>[] {
  return [
    {
      key: 'nombre',
      encabezado: 'Nombre',
      render: (u) => (
        <span className={`font-medium ${u.activo ? 'text-gray-900' : 'text-gray-400'}`}>
          {u.nombre}
          {u.id === a.miId && <span className="ml-2 text-xs font-normal text-gray-500">(tú)</span>}
        </span>
      ),
    },
    { key: 'usuario', encabezado: 'Usuario', render: (u) => u.nombre_usuario ?? <span className="text-amber-700">Sin usuario</span> },
    { key: 'rol', encabezado: 'Rol', render: (u) => ETIQUETA_ROL[u.rol] ?? u.rol },
    {
      key: 'estado',
      encabezado: 'Estado',
      render: (u) => (
        <span className="flex flex-wrap gap-1">
          <Badge color={u.activo ? 'green' : 'gray'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge>
          {u.debe_cambiar_password && <Badge color="yellow">Debe cambiar la contraseña</Badge>}
        </span>
      ),
    },
    {
      key: 'acciones',
      encabezado: 'Acciones',
      render: (u) =>
        u.id === a.miId ? (
          <span className="text-xs text-gray-400">Tu cuenta</span>
        ) : (
          <div className="flex gap-3 whitespace-nowrap text-sm">
            <button type="button" className="font-medium text-blue-600 hover:underline disabled:opacity-50" disabled={a.ocupado} onClick={() => a.onRestablecer(u)}>
              Nueva contraseña
            </button>
            {u.activo ? (
              <button type="button" className="font-medium text-red-600 hover:underline disabled:opacity-50" disabled={a.ocupado} onClick={() => a.onCambiarEstado(u, false)}>
                Desactivar
              </button>
            ) : (
              <button type="button" className="font-medium text-green-700 hover:underline disabled:opacity-50" disabled={a.ocupado} onClick={() => a.onCambiarEstado(u, true)}>
                Reactivar
              </button>
            )}
          </div>
        ),
    },
  ];
}

export function UsuariosPage() {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const esSuper = usuario?.rol === 'superadministrador';

  // Solo el superadministrador elige panadería; el administrador siempre trabaja en la suya
  const [panaderiaElegida, setPanaderiaElegida] = useState('');
  const [creando, setCreando] = useState(false);
  const [porRestablecer, setPorRestablecer] = useState<UsuarioPanaderia | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  const panaderias = useQuery({ queryKey: ['usuarios-panaderias'], queryFn: getPanaderiasDisponibles, enabled: esSuper });
  const panaderiaId = esSuper ? panaderiaElegida || undefined : undefined;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['usuarios', panaderiaId ?? 'propia'],
    queryFn: () => getUsuarios(panaderiaId),
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => cambiarEstadoUsuario(id, activo, panaderiaId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
  });

  const columnas = useMemo(
    () =>
      crearColumnas({
        miId: usuario?.id,
        ocupado: cambiarEstado.isPending,
        onRestablecer: (u) => {
          setAviso(null);
          setPorRestablecer(u);
        },
        onCambiarEstado: (u, activo) => {
          setAviso(null);
          cambiarEstado.mutate(
            { id: u.id, activo },
            {
              onSuccess: () => setAviso({ tipo: 'success', texto: activo ? `${u.nombre} puede entrar de nuevo.` : `${u.nombre} ya no puede entrar.` }),
              onError: (e) => setAviso({ tipo: 'error', texto: mensajeDeError(e, 'No se pudo cambiar el estado.') }),
            },
          );
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usuario?.id, cambiarEstado.isPending],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500">Quién puede entrar a esta panadería</p>
        </div>
        <Button type="button" onClick={() => { setAviso(null); setCreando(true); }}>
          Nuevo usuario
        </Button>
      </div>

      {esSuper && (
        <div className="max-w-xs">
          <Select id="usr-panaderia" label="Panadería" value={panaderiaElegida} onChange={(e) => setPanaderiaElegida(e.target.value)}>
            <option value="">La primera activa</option>
            {(panaderias.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </div>
      )}

      {aviso && <Alert variant={aviso.tipo}>{aviso.texto}</Alert>}

      <DataTable columnas={columnas} datos={data} cargando={isLoading} error={isError} onReintentar={() => refetch()} obtenerKeyFila={(u) => u.id} />

      <Modal isOpen={creando} onClose={() => setCreando(false)} title="Nuevo usuario">
        {creando && (
          <UsuarioForm
            puedeElegirRol={esSuper}
            panaderiaId={panaderiaId}
            onTerminar={(nombre) => {
              setCreando(false);
              setAviso({ tipo: 'success', texto: `${nombre} ya puede entrar con su usuario y la contraseña inicial.` });
            }}
          />
        )}
      </Modal>

      <Modal isOpen={porRestablecer !== null} onClose={() => setPorRestablecer(null)} title="Nueva contraseña">
        {porRestablecer !== null && (
          <RestablecerContrasenaForm
            key={porRestablecer.id}
            usuario={porRestablecer}
            panaderiaId={panaderiaId}
            onTerminar={() => {
              setAviso({ tipo: 'success', texto: `Contraseña de ${porRestablecer.nombre} actualizada.` });
              setPorRestablecer(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
