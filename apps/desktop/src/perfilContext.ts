import { createContext } from 'react';
import type { Perfil } from './social';

export const AtualizarPerfilContext = createContext<((perfil:Perfil)=>void) | null>(null);
