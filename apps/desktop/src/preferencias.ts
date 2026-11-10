import { useEffect, useState } from 'react';
export interface Preferencias { tema: 'sistema' | 'claro' | 'escuro'; animar: boolean; vista: 'mapa' | 'grade' }
const PADRAO: Preferencias = { tema: 'sistema', animar: true, vista: 'mapa' };
export function lerPreferencias(chave: string): Preferencias {
  try {
    const p = JSON.parse(localStorage.getItem(chave) || '{}');
    return { tema: ['sistema', 'claro', 'escuro'].includes(p?.tema) ? p.tema : PADRAO.tema,
      animar: typeof p?.animar === 'boolean' ? p.animar : PADRAO.animar,
      vista: p?.vista === 'grade' ? 'grade' : PADRAO.vista };
  } catch { return { ...PADRAO }; }
}
export function usePreferencias(userId: string) {
  const chave = `desk-events:preferencias:${userId}`;
  const [preferencias, setPreferencias] = useState(() => lerPreferencias(chave));
  useEffect(() => { try { localStorage.setItem(chave, JSON.stringify(preferencias)); } catch { /* preferências continuam válidas nesta sessão */ } }, [chave, preferencias]);
  return [preferencias, setPreferencias] as const;
}
