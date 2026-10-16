import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../../guards/ProtectedRoute';
import { LoginPage } from '../../features/auth/LoginPage';
import { HomePage } from '../../pages/HomePage';
import { NotFoundPage } from '../../pages/NotFoundPage';
import { ForbiddenPage } from '../../pages/ForbiddenPage';
import { AppLayout } from '../../components/layout/AppLayout';
import { MateriasPrimasPage } from '../../pages/MateriasPrimasPage';
import { FormulacionesPage } from '../../pages/FormulacionesPage';
import { FormulacionDetallePage } from '../../pages/FormulacionDetallePage';
import { ClasificacionAbcPage } from '../../pages/ClasificacionAbcPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/403" element={<ForbiddenPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/inicio" replace />} />
          <Route path="/inicio" element={<HomePage />} />
          <Route path="/materias-primas" element={<MateriasPrimasPage />} />
          <Route path="/formulaciones" element={<FormulacionesPage />} />
          <Route path="/formulaciones/:id" element={<FormulacionDetallePage />} />
          <Route path="/clasificacion-abc" element={<ClasificacionAbcPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}