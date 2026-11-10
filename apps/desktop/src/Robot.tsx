import type { Aparencia } from './supabase';
import { avatarDe } from './personagens';

export function RobotPixels({ aparencia, ativo = true }: { aparencia: Aparencia; ativo?: boolean }) {
  return <image href={avatarDe(aparencia).imagem} x={-2} y={-3} width={16} height={19} preserveAspectRatio="xMidYMax meet" opacity={ativo ? 1 : 0.45} />;
}

export function Robot({ aparencia, ativo = true, tamanho = 96 }: { aparencia: Aparencia; ativo?: boolean; tamanho?: number }) {
  const personagem = avatarDe(aparencia);
  return <img className="personagem" src={personagem.imagem} alt={'Personagem ' + personagem.nome} width={tamanho} height={tamanho} style={{ objectFit: 'contain', opacity: ativo ? 1 : 0.45 }} />;
}
