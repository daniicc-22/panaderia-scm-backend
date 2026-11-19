import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChefHat, ShieldCheck, UserPlus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { useAuth } from '../features/auth/useAuth';
import { Indicador } from '../features/inicio/Panel';
import { ListaUsuarios } from '../features/usuarios/ListaUsuarios';
import { RestablecerContrasenaForm } from '../features/usuarios/RestablecerContrasenaForm';
import { UsuarioForm } from '../features/usuarios/UsuarioForm';
import { mensajeDeError } from '../services/errores';
import { cambiarEstadoUsuario, getPanaderiasDisponibles, getUsuarios } from '../services/usuariosService';
import type { UsuarioPanaderia } from '../types/usuario.types';

export function UsuariosPage() {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const esSuper = usuario?.rol === 'superadministrador';

  // Solo el superadministrador elige panadería; el administrador siempre trabaja en la suya
  const [panaderiaElegida, setPanaderiaElegida] = useState('');
  const [creando, setCreando] = useState(false);
  const [porRestablecer, setPorRestablecer] = useState<UsuarioPanaderia | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<UsuarioPanaderia | null>(null);
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

  const cambiar = (u: UsuarioPanaderia, activo: boolean) => {
    setAviso(null);
    cambiarEstado.mutate(
      { id: u.id, activo },
      {
        onSuccess: () => setAviso({ tipo: 'success', texto: activo ? `${u.nombre} puede entrar de nuevo.` : `${u.nombre} ya no puede entrar.` }),
        onError: (e) => setAviso({ tipo: 'error', texto: mensajeDeError(e, 'No se pudo cambiar el estado.') }),
        onSettled: () => setPorDesactivar(null),
      },
    );
  };

  const lista = data ?? [];
  const activos = lista.filter((u) => u.activo).length;
  const gestion = lista.filter((u) => u.rol !== 'operario').length;
  const operarios = lista.filter((u) => u.rol === 'operario').length;
  const sinEstrenar = lista.filter((u) => u.debe_cambiar_password).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo="Usuarios"
        subtitulo="Quién puede entrar a esta panadería"
        acciones={
          <Button type="button" onClick={() => { setAviso(null); setCreando(true); }}>
            <UserPlus size={16} aria-hidden="true" />
            Nuevo usuario
          </Button>
        }
      />

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

      {isError ? (
        <Alert variant="error">
          No se pudieron cargar los usuarios.{' '}
          <button type="button" onClick={() => refetch()} className="font-semibold underline">
            Reintentar
          </button>
        </Alert>
      ) : (
        <>
          {!isLoading && lista.length > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Indicador etiqueta="Usuarios activos" valor="—" numero={activos} detalle={`de ${lista.length} en total`} tono="verde" indice={0} />
              <Indicador etiqueta="Administradores" valor="—" numero={gestion} tono="azul" indice={1} />
              <Indicador etiqueta="Operarios" valor="—" numero={operarios} tono="amarillo" indice={2} />
              <Indicador etiqueta="Con contraseña por cambiar" valor="—" numero={sinEstrenar} detalle={sinEstrenar > 0 ? 'Aún no la han estrenado' : 'Todos ya eligieron la suya'} tono="gris" indice={3} />
            </div>
          )}

          <ListaUsuarios
            usuarios={data}
            cargando={isLoading}
            miId={usuario?.id}
            ocupado={cambiarEstado.isPending}
            onCrear={() => {
              setAviso(null);
              setCreando(true);
            }}
            onRestablecer={(u) => {
              setAviso(null);
              setPorRestablecer(u);
            }}
            onCambiarEstado={(u, activo) => (activo ? cambiar(u, true) : setPorDesactivar(u))}
          />

          <section aria-label="Qué puede hacer cada rol" className="grid gap-3 rounded-tarjeta border border-linea bg-tabla p-4 sm:grid-cols-2 sm:p-5">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-azul-suave text-azul-noche">
                <ShieldCheck size={20} />
              </span>
              <div>
                <h3 className="font-semibold text-azul-noche">Administrador</h3>
                <p className="text-sm text-gris-texto">Gestiona la panadería: reposición, costos, indicadores y usuarios. Solo puede crear operarios.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-trigo-suave text-atencion-texto">
                <ChefHat size={20} />
              </span>
              <div>
                <h3 className="font-semibold text-azul-noche">Operario</h3>
                <p className="text-sm text-gris-texto">Trabaja en planta: registra producción, mermas y conteos, y consulta recetas y existencias.</p>
              </div>
            </div>
          </section>
        </>
      )}

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

      <Modal isOpen={porDesactivar !== null} onClose={() => setPorDesactivar(null)} title="Desactivar usuario">
        {porDesactivar !== null && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-grafito">
              <span className="font-semibold">{porDesactivar.nombre}</span> ya no podrá entrar a la panadería. Su historial se conserva y puedes reactivarlo cuando quieras.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPorDesactivar(null)}>
                Cancelar
              </Button>
              <Button type="button" variant="danger" isLoading={cambiarEstado.isPending} onClick={() => cambiar(porDesactivar, false)}>
                Desactivar
              </Button>
            </div>
          </div>
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
