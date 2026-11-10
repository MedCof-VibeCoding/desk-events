import type { Aparencia } from './supabase';

// Robô em pixel art, montado por peças: corpo, cor e acessório.
const CORPOS: Record<Aparencia['corpo'], string[]> = {
  monitor: ['.....AA.....', '.....KK.....', '..KKKKKKKK..', '.KbbbbbbbbK.', 'KbFFFFFFFFbK', 'KbFEEFFEEFbK', 'KbFEEFFEEFbK', 'KbFFFFFFFFbK', '.KbbbbbbbbK.', '..KKKKKKKK..', '....KKKK....', '..BbbbbbbB..', '.BbbbLLbbbB.', 'BbbbbbbbbbbB'],
  redondo: ['.....AA.....', '.....KK.....', '...KKKKKK...', '..KbbbbbbK..', '.KbFFFFFFbK.', 'KbFEEFFEEFbK', 'KbFEEFFEEFbK', '.KbFFFFFFbK.', '..KbbbbbbK..', '...KKKKKK...', '....KKKK....', '..BbbbbbbB..', '.BbbbLLbbbB.', 'BbbbbbbbbbbB'],
  antenas: ['..AA....AA..', '..KK....KK..', '..KKKKKKKK..', '.KbbbbbbbbK.', 'KbFFFFFFFFbK', 'KbFEEFFEEFbK', 'KbFEEFFEEFbK', 'KbFFFFFFFFbK', '.KbbbbbbbbK.', '..KKKKKKKK..', '....KKKK....', '..BbbbbbbB..', '.BbbbLLbbbB.', 'BbbbbbbbbbbB']
};
const ACESSORIOS: Record<string, [number, number, number, number, string][]> = {
  gravata: [[5, 11, 2, 1, '#D14646'], [5, 12, 2, 2, '#D14646']],
  fone: [[0, 4, 1, 4, '#2B3142'], [11, 4, 1, 4, '#2B3142'], [1, 2, 10, 1, '#2B3142']],
  bone: [[2, 1, 8, 2, '#2D55F5'], [8, 2, 4, 1, '#2D55F5']]
};

function escurecer(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = (v: number) => Math.max(0, Math.round(v * 0.72)).toString(16).padStart(2, '0');
  return Number.isNaN(n) ? '#555555' : `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

function paleta(aparencia: Aparencia, ativo: boolean) {
  const cor = /^#[0-9a-fA-F]{6}$/.test(aparencia.cor) ? aparencia.cor : '#2BB3A3';
  return { K: '#1C2030', b: cor, B: escurecer(cor), F: '#151A2A', E: ativo ? '#7DF9FF' : '#4A5568', A: ativo ? '#3DDC84' : '#6B7487', L: ativo ? '#3DDC84' : '#8A93A6' } as Record<string, string>;
}

// Os pixels do robô, para usar dentro de qualquer SVG (cartão ou cena do escritório).
export function RobotPixels({ aparencia, ativo = true }: { aparencia: Aparencia; ativo?: boolean }) {
  const pal = paleta(aparencia, ativo);
  const linhas = CORPOS[aparencia.corpo] ?? CORPOS.monitor;
  const px: JSX.Element[] = [];
  linhas.forEach((linha, y) => [...linha].forEach((ch, x) => { if (ch !== '.') px.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={pal[ch]} />); }));
  const extra = aparencia.acessorio ? ACESSORIOS[aparencia.acessorio] ?? [] : [];
  return <>{px}{extra.map(([x, y, w, h, f], i) => <rect key={`a${i}`} x={x} y={y} width={w} height={h} fill={f} />)}</>;
}
export const corEscura = (aparencia: Aparencia) => paleta(aparencia, true).B;

export function Robot({ aparencia, ativo = true, tamanho = 96 }: { aparencia: Aparencia; ativo?: boolean; tamanho?: number }) {
  return (
    <svg viewBox="0 0 12 14" width={tamanho} height={(tamanho * 14) / 12} shapeRendering="crispEdges" role="img" aria-label="Robô do agente">
      <RobotPixels aparencia={aparencia} ativo={ativo} />
    </svg>
  );
}
