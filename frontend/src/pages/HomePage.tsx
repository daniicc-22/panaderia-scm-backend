import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../services/healthService';
import { getRoles } from '../services/rolesService';
import { useAuth } from '../features/auth/AuthContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { LoadingState } from '../components/feedback/LoadingState';
import { ErrorState } from '../components/feedback/ErrorState';

export function HomePage() {
  const { usuario } = useAuth();

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  });

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Hola, {usuario?.nombre}
        </h1>
        <p className="text-gray-600">Este es el panel inicial del sistema.</p>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-medium text-gray-900">Estado del servidor</h2>
        {healthQuery.isLoading && <LoadingState mensaje="Consultando /health..." />}
        {healthQuery.isError && (
          <ErrorState
            mensaje="No se pudo conectar con el backend."
            onReintentar={() => healthQuery.refetch()}
          />
        )}
        {healthQuery.data && (
          <p className="text-sm text-gray-700">
            Estado: <Badge color="green">{healthQuery.data.status}</Badge> —{' '}
            {healthQuery.data.mensaje}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-medium text-gray-900">Roles registrados</h2>
        {rolesQuery.isLoading && <LoadingState mensaje="Consultando /roles..." />}
        {rolesQuery.isError && (
          <ErrorState
            mensaje="No se pudieron cargar los roles."
            onReintentar={() => rolesQuery.refetch()}
          />
        )}
        {rolesQuery.data && (
          <ul className="flex flex-col gap-2">
            {rolesQuery.data.map((rol) => (
              <li key={rol.id} className="flex items-center gap-2 text-sm text-gray-700">
                <Badge color="blue">{rol.codigo}</Badge>
                {rol.nombre}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}