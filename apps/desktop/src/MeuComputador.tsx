import { useEffect, useRef } from 'react';
import './extras.css';

export const LINK_CONECTOR = 'https://github.com/MedCof-VibeCoding/desk-events/releases/latest/download/DeskCof-Conector-Setup.exe';

export interface EstadoPc { ligado: boolean; viaConector: boolean; computador: string; pasta: string | null; comandos: boolean }
interface Props {
  estado: EstadoPc; pastaAba: string | null; pastaGuardada: string | null; ligando: boolean; podeOperar: boolean; navegadorOk: boolean; erro: string;
  onLigar: (novaPasta: boolean) => void; onDesligar: () => void; onFechar: () => void;
}

// Painel "Meu computador": o Conector instalado é o caminho principal; o navegador é a alternativa.
export function MeuComputador(p: Props) {
  const primeiro = useRef<HTMLButtonElement>(null);
  useEffect(() => { primeiro.current?.focus(); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onFechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [p]);

  const e = p.estado;
  return (
    <div className="fundo" role="dialog" aria-modal="true" aria-labelledby="titulo-pc" onClick={ev => { if (ev.target === ev.currentTarget) p.onFechar(); }}>
      <section className="cartao meu-computador">
        <div className="cabeca">
          <div>
            <h2 id="titulo-pc">Meu computador</h2>
            <p className="aviso-suave">Deixe seus agentes trabalharem com arquivos de uma pasta sua.</p>
          </div>
          <button ref={primeiro} type="button" className="btn" onClick={p.onFechar}>Fechar</button>
        </div>

        <span className={'estado-pc' + (e.ligado ? ' ligado' : '')} role="status">
          {!e.ligado ? 'Não conectado' : e.viaConector ? `Conectado pelo DeskCof Conector${e.computador ? ` em ${e.computador}` : ''}` : 'Conectado pelo navegador'}
        </span>

        {e.ligado && e.pasta && (
          <div className="pasta-atual">
            <div><span className="aviso-suave">Pasta conectada</span><br /><strong>{e.pasta}</strong>{e.viaConector && <><br /><span className="aviso-suave">Comandos: {e.comandos ? 'permitidos, com a sua aprovação' : 'desligados'}</span></>}</div>
            {!e.viaConector && p.pastaAba && <div className="acoes">
              <button type="button" className="btn" disabled={p.ligando} onClick={() => p.onLigar(true)}>Trocar pasta</button>
              <button type="button" className="btn" onClick={p.onDesligar}>Desconectar</button>
            </div>}
          </div>
        )}
        {e.viaConector && e.ligado && <p className="aviso-suave">Para trocar a pasta, pausar ou permitir comandos, abra o DeskCof Conector pelo ícone perto do relógio do Windows.</p>}

        {!(e.ligado && e.viaConector) && (
          <div className="opcao-conector">
            <span className="selo-recomendado">Recomendado</span>
            <h3>DeskCof Conector para Windows</h3>
            <p className="aviso-suave">Um programa pequeno que fica perto do relógio do Windows. Liga junto com o computador e mantém a pasta conectada o tempo todo, mesmo com o site fechado.</p>
            <ol className="passos-pc">
              <li>Baixe e abra o instalador.</li>
              <li>Entre com a mesma conta do DeskCof.</li>
              <li>Pronto: a pasta <strong>Documentos\Agentes</strong> já fica conectada.</li>
            </ol>
            <a className="btn primario botao-grande" href={LINK_CONECTOR} rel="noopener">Baixar o DeskCof Conector</a>
            <p className="aviso-suave">Se o Windows mostrar “O Windows protegeu o computador”, clique em <strong>Mais informações</strong> e depois em <strong>Executar assim mesmo</strong>. O aviso aparece porque o instalador ainda não tem assinatura digital.</p>
          </div>
        )}

        {!e.viaConector && (
          <details open={e.ligado || !!p.pastaGuardada}>
            <summary>Sem instalar nada: conectar pelo navegador</summary>
            <p className="aviso-suave">Funciona só enquanto esta aba estiver aberta, no Chrome ou no Edge, e não roda comandos. No aviso do navegador, escolha <strong>Permitir em todas as visitas</strong> para a pasta voltar sozinha da próxima vez.</p>
            {!p.podeOperar ? <p className="aviso-suave">Seu papel nesta sala não permite conectar o computador.</p>
              : !p.navegadorOk ? <p className="erro">Este navegador não permite escolher pastas. Use o Google Chrome ou o Microsoft Edge, no computador.</p>
              : !p.pastaAba && <div className="acoes">
                  {p.pastaGuardada && <button type="button" className="btn primario" disabled={p.ligando} onClick={() => p.onLigar(false)}>Reconectar “{p.pastaGuardada}”</button>}
                  <button type="button" className="btn" disabled={p.ligando} onClick={() => p.onLigar(!!p.pastaGuardada)}>{p.ligando ? 'Esperando você escolher a pasta…' : p.pastaGuardada ? 'Escolher outra pasta' : 'Conectar uma pasta'}</button>
                </div>}
          </details>
        )}
        {p.erro && <p className="erro" role="alert">{p.erro}</p>}

        <div>
          <h3>O que os agentes conseguem fazer</h3>
          <ul className="lista-pode">
            <li>Ver, ler e criar arquivos de texto (txt, md, csv, json e parecidos) dentro da pasta conectada.</li>
            <li>Gravar arquivos pede a sua aprovação em <strong>Sua mesa</strong>, conforme a autonomia do agente.</li>
            <li>Nada fora da pasta. Eles também não apagam arquivos.</li>
            <li>Comandos só pelo Conector, se você permitir, e sempre com aprovação comando a comando.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
