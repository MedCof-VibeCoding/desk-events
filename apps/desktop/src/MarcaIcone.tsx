import './marca.css';

export function MarcaIcone({ tamanho = 44 }: { tamanho?: number }) {
  return <img className="icone-marca" src="/brand/desk-events-128.png" width={tamanho} height={tamanho} alt="" aria-hidden="true" draggable={false} />;
}
