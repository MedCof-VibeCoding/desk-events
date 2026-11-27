import type { PedidoVisita } from './visitas';

/** Lista de quem pediu para entrar. Aceitar cria um visitante leitor. */
export function PedidosVisita({ pedidos, onDecidir, aviso }: { pedidos: PedidoVisita[]; onDecidir: (id: string, aceitar: boolean) => void; aviso?: string }) {
  if (!pedidos.length) return null;
  return <section className="config-card"><h3>Pedidos de visita</h3><p className="mudo">{aviso ?? 'Quem você aceitar entra como visitante e só observa. Um papel maior continua na lista de acessos.'}</p>
    <div className="acessos-lista">{pedidos.map(p => <div key={p.id}><span><strong>{p.nome}</strong><small>quer visitar esta sala</small></span><span className="linha-acoes"><button className="btn pequeno primario" onClick={() => onDecidir(p.id, true)}>Aceitar</button><button className="btn pequeno" onClick={() => onDecidir(p.id, false)}>Recusar</button></span></div>)}</div>
  </section>;
}
