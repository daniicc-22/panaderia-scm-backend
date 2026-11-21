import { AppProviders } from './app/providers/AppProviders';
import { AppRouter } from './app/router/AppRouter';
import { ActualizacionApp } from './components/pwa/ActualizacionApp';

function App() {
  return (
    <AppProviders>
      <AppRouter />
      <ActualizacionApp />
    </AppProviders>
  );
}

export default App;