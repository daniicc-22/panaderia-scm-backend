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
import { ProveedoresPage } from '../../pages/ProveedoresPage';
import { InventarioPage } from '../../pages/InventarioPage';
import { ProduccionPage } from '../../pages/ProduccionPage';
import { ConteosPage } from '../../pages/ConteosPage';
import { ConteoDetallePage } from '../../pages/ConteoDetallePage';

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
          <Route path="/inventario" element={<InventarioPage />} />
          <Route path="/produccion" element={<ProduccionPage />} />
          <Route path="/conteos" element={<ConteosPage />} />
          <Route path="/conteos/:id" element={<ConteoDetallePage />} />
          <Route path="/formulaciones" element={<FormulacionesPage />} />
          <Route path="/formulaciones/:id" element={<FormulacionDetallePage />} />
          <Route path="/clasificacion-abc" element={<ClasificacionAbcPage />} />
        </Route>
      </Route>

      {/* Los proveedores son datos de gestión: el operario no entra (el servidor también lo impide) */}
      <Route element={<ProtectedRoute rolesPermitidos={['administrador', 'superadministrador']} />}>
        <Route element={<AppLayout />}>
          <Route path="/proveedores" element={<ProveedoresPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}