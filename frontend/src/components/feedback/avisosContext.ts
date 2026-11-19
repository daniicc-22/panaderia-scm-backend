import { createContext, useContext } from 'react';

export type TipoAviso = 'exito' | 'info' | 'error';

export interface ContextoAvisos {
  avisar: (texto: string, tipo?: TipoAviso) => void;
}

export const AvisosContext = createContext<ContextoAvisos>({ avisar: () => {} });

// Aviso breve al guardar: se ve aunque la pantalla se haya desplazado
export const useAvisos = () => useContext(AvisosContext);
