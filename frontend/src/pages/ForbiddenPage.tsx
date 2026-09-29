import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 text-center">
      <h1 className="text-4xl font-bold text-gray-900">403</h1>
      <p className="text-gray-600">No tienes permiso para ver esta página.</p>
      <Link to="/inicio">
        <Button>Volver al inicio</Button>
      </Link>
    </div>
  );
}