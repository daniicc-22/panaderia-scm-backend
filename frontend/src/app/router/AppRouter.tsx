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
import { ReposicionPage } from '../../pages/ReposicionPage';
import { OrdenPedidoPage } from '../../pages/OrdenPedidoPage';
import { ParametrosReposicionPage } from '../../pages/ParametrosReposicionPage';
import { AnalisisEoqPage } from '../../pages/AnalisisEoqPage';
import { InventarioPage } from '../../pages/InventarioPage';
import { ProduccionPage } from '../../pages/ProduccionPage';
import { MermasPage } from '../../pages/MermasPage';
import { DesviacionPesajePage } from '../../pages/DesviacionPesajePage';
import { ConteosPage } from '../../pages/ConteosPage';
import { ConteoDetallePage } from '../../pages/ConteoDetallePage';
import { CambiarContrasenaPage } from '../../pages/CambiarContrasenaPage';
import { UsuariosPage } from '../../pages/UsuariosPage';
import { PanaderiasPage } from '../../pages/PanaderiasPage';
import { IndicadoresPage } from '../../pages/IndicadoresPage';
import { PorRol } from '../../components/layout/PorRol';
import { TableroOperario } from '../../features/operario/TableroOperario';
import { ExistenciasOperario } from '../../features/operario/ExistenciasOperario';
import { RecetasOperario } from '../../features/operario/RecetasOperario';
import { RecetaOperario } from '../../features/operario/RecetaOperario';
import { MermaOperario } from '../../features/operario/MermaOperario';
import { ProducirOperario } from '../../features/operario/ProducirOperario';
import { ConteosOperario } from '../../features/operario/ConteosOperario';
import { ConteoOperario } from '../../features/operario/ConteoOperario';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/403" element={<ForbiddenPage />} />

      <Route element={<ProtectedRoute />}>
        {/* El operario ve en algunas rutas su propia pantalla simple (PorRol); el resto de roles, la de gestión */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/inicio" replace />} />
          <Route path="/inicio" element={<PorRol operario={<TableroOperario />} gestion={<HomePage />} />} />
          <Route path="/cambiar-contrasena" element={<CambiarContrasenaPage />} />
          <Route path="/materias-primas" element={<PorRol operario={<ExistenciasOperario />} gestion={<MateriasPrimasPage />} />} />
          <Route path="/inventario" element={<PorRol operario={<ExistenciasOperario />} gestion={<InventarioPage />} />} />
          <Route path="/produccion" element={<PorRol operario={<ProducirOperario />} gestion={<ProduccionPage />} />} />
          <Route path="/mermas" element={<PorRol operario={<MermaOperario />} gestion={<MermasPage />} />} />
          <Route path="/conteos" element={<PorRol operario={<ConteosOperario />} gestion={<ConteosPage />} />} />
          <Route path="/conteos/:id" element={<PorRol operario={<ConteoOperario />} gestion={<ConteoDetallePage />} />} />
          <Route path="/formulaciones" element={<PorRol operario={<RecetasOperario />} gestion={<FormulacionesPage />} />} />
          <Route path="/formulaciones/:id" element={<PorRol operario={<RecetaOperario />} gestion={<FormulacionDetallePage />} />} />
          <Route path="/clasificacion-abc" element={<ClasificacionAbcPage />} />
        </Route>
      </Route>

      {/* Los proveedores son datos de gestión: el operario no entra (el servidor también lo impide) */}
      <Route element={<ProtectedRoute rolesPermitidos={['administrador', 'superadministrador']} />}>
        <Route element={<AppLayout />}>
          <Route path="/proveedores" element={<ProveedoresPage />} />
          <Route path="/usuarios" element={<UsuariosPage />} />
          <Route path="/desviacion-pesaje" element={<DesviacionPesajePage />} />
          <Route path="/reposicion" element={<ReposicionPage />} />
          <Route path="/reposicion/pedido/:proveedorId" element={<OrdenPedidoPage />} />
          <Route path="/reposicion/eoq" element={<AnalisisEoqPage />} />
          <Route path="/reposicion/parametros" element={<ParametrosReposicionPage />} />
          <Route path="/indicadores" element={<IndicadoresPage />} />
        </Route>
      </Route>

      {/* Crear panaderías es solo del superadministrador (el servidor también lo impide) */}
      <Route element={<ProtectedRoute rolesPermitidos={['superadministrador']} />}>
        <Route element={<AppLayout />}>
          <Route path="/panaderias" element={<PanaderiasPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}