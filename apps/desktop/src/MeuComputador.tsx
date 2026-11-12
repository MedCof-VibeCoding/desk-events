import { useEffect, useRef, useState } from 'react';
import './extras.css';

interface Props {
  ligado: boolean; pasta: string | null; ligando: boolean; podeOperar: boolean; navegadorOk: boolean; erro: string;
  onLigar: (novaPasta: boolean) => void; onDesligar: () => void; onFechar: () => void;
}

const COMANDO = 'npm run ponte -- --comandos';

// Painel que explica e liga o trabalho dos agentes numa pasta deste computador.
export function MeuComputador(p: Props) {
  const [copiado, setCopiado] = useState(false);
  const primeiro = useRef<HTMLButtonElement>(null);
  useEffect(() => { primeiro.current?.focus(); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onFechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [p]);

  async function copiar() {
    try { await navigator.clipboard.writeText(COMANDO); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* sem permissão de cópia */ }
  }

  const ligadoAqui = p.ligado && !!p.pasta;
  return (
    <div className="fundo" role="dialog" aria-modal="true" aria-labelledby="titulo-pc" onClick={e => { if (e.target === e.currentTarget) p.onFechar(); }}>
      <section className="cartao meu-computador">
        <div className="cabeca">
          <div>
            <h2 id="titulo-pc">Meu computador</h2>
            <p className="aviso-suave">Deixe seus agentes trabalharem com arquivos de uma pasta sua.</p>
          </div>
          <button ref={primeiro} type="button" className="btn" onClick={p.onFechar}>Fechar</button>
        </div>

        <span className={'estado-pc' + (p.ligado ? ' ligado' : '')} role="status">
          {ligadoAqui ? 'Conectado nesta aba' : p.ligado ? 'Conectado em outra aba ou pelo terminal' : 'Não conectado'}
        </span>

        {!p.podeOperar ? (
          <p className="aviso-suave">Seu papel nesta sala não permite conectar o computador. Volte para a sua sala para usar este recurso.</p>
        ) : ligadoAqui ? (
          <div className="pasta-atual">
            <div><span className="aviso-suave">Pasta conectada</span><br /><strong>{p.pasta}</strong></div>
            <div className="acoes">
              <button type="button" className="btn" disabled={p.ligando} onClick={() => p.onLigar(true)}>Trocar pasta</button>
              <button type="button" className="btn" onClick={p.onDesligar}>Desconectar</button>
            </div>
          </div>
        ) : (
          <>
            <ol className="passos-pc">
              <li>Clique em <strong>Conectar uma pasta</strong>.</li>
              <li>Escolha a pasta e clique em <strong>Permitir</strong> no aviso do navegador.</li>
              <li>Peça a um agente para ler ou criar arquivos nela.</li>
            </ol>
            {p.navegadorOk ? (
              <button type="button" className="btn primario botao-grande" disabled={p.ligando} onClick={() => p.onLigar(false)}>
                {p.ligando ? 'Esperando você escolher a pasta…' : 'Conectar uma pasta'}
              </button>
            ) : (
              <p className="erro">Este navegador não permite escolher pastas. Abra o escritório no Google Chrome ou no Microsoft Edge, no computador.</p>
            )}
            <p className="aviso-suave">Sugestão: crie uma pasta só para isso, como <strong>Documentos\Agentes</strong>, e coloque nela apenas o que os agentes podem ver.</p>
          </>
        )}
        {p.erro && <p className="erro" role="alert">{p.erro}</p>}

        <div>
          <h3>O que os agentes conseguem fazer</h3>
          <ul className="lista-pode">
            <li>Ver os arquivos da pasta e das subpastas.</li>
            <li>Ler arquivos de texto: txt, md, csv, json e parecidos.</li>
            <li>Criar e atualizar arquivos de texto. Dependendo da autonomia do agente, isso pede a sua aprovação em <strong>Sua mesa</strong>.</li>
            <li>Nada fora da pasta escolhida. Eles também não apagam arquivos.</li>
          </ul>
        </div>

        <p className="aviso-suave">A conexão vale enquanto esta aba do escritório estiver aberta. Ao fechar a aba, ela se desliga sozinha. Exemplo de pedido: “Leia notas.txt e grave um resumo em resumo.md”.</p>

        <details>
          <summary>Avançado: deixar os agentes rodarem comandos</summary>
          <p className="aviso-suave">Rodar comandos exige o programa da ponte, instalado junto com o código do projeto. Cada comando só roda depois que você aprovar em Sua mesa. Na pasta do projeto, rode:</p>
          <div className="comando-copiar"><code>{COMANDO}</code><button type="button" className="btn" onClick={() => void copiar()}>{copiado ? 'Copiado' : 'Copiar'}</button></div>
        </details>
      </section>
    </div>
  );
}
