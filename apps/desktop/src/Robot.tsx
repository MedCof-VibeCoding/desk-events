import type { Aparencia } from './supabase';
import { avatarDe } from './personagens';
import { PixelAvatar } from './PixelAvatar';

export function RobotPixels({ aparencia, ativo = true }: { aparencia: Aparencia; ativo?: boolean }) {
  if (aparencia.estilo === 'pixel') return <foreignObject x={-2} y={-3} width={16} height={19}><PixelAvatar aparencia={aparencia} ativo={ativo} tamanho={16}/></foreignObject>;
  return <image href={avatarDe(aparencia).imagem} x={-2} y={-3} width={16} height={19} preserveAspectRatio="xMidYMax meet" opacity={ativo ? 1 : 0.45} />;
}

export function Robot({ aparencia, ativo = true, tamanho = 96 }: { aparencia: Aparencia; ativo?: boolean; tamanho?: number }) {
  if (aparencia.estilo === 'pixel') return <PixelAvatar aparencia={aparencia} ativo={ativo} tamanho={tamanho}/>;
  const personagem = avatarDe(aparencia);
  return <img className="personagem" src={personagem.imagem} alt={'Personagem ' + personagem.nome} width={tamanho} height={tamanho} style={{ objectFit: 'contain', opacity: ativo ? 1 : 0.45 }} />;
}
