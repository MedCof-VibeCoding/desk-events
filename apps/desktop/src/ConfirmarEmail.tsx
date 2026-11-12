import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from './supabase';
import { Icon } from './Icon';
import { MarcaIcone } from './MarcaIcone';
import { CAMINHO_CONFIRMACAO, confirmarEmail, lerLinkConfirmacao, mensagemConfirmacao, urlConfirmacao, type ResultadoConfirmacao } from './confirmacaoEmail';
import './confirmarEmail.css';

export function ConfirmarEmail({ emailEnviado }: { emailEnviado?: string }) {
  const [resultado, setResultado] = useState<ResultadoConfirmacao | { estado: 'validando' }>({ estado: emailEnviado ? 'aguardando' : 'validando' });
  const [email, setEmail] = useState(emailEnviado ?? '');
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(emailEnviado ? 60 : 0);
  const [aviso, setAviso] = useState<{ erro: boolean; texto: string } | null>(null);
  const tarefa = useRef<Promise<ResultadoConfirmacao> | null>(null);
  const link = useRef(lerLinkConfirmacao(window.location.href));
  useEffect(() => {
    if (emailEnviado) return;
    let ativo = true;
    // Um único consumo do token, inclusive no StrictMode. Não manter credenciais na URL.
    if (!tarefa.current) {
      window.history.replaceState(null, '', CAMINHO_CONFIRMACAO);
      tarefa.current = confirmarEmail(supabase.auth, link.current);
    }
    void tarefa.current.then(valor => { if (ativo) setResultado(valor); });
    return () => { ativo = false; };
  }, [emailEnviado]);
  useEffect(() => {
    if (!espera) return;
    const timer = window.setTimeout(() => setEspera(n => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [espera]);
  async function reenviar(e: FormEvent) {
    e.preventDefault();
    if (enviando || espera) return;
    setEnviando(true); setAviso(null);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: urlConfirmacao(window.location.origin) } });
      if (error) {
        const limite = error.status === 429 || error.code?.includes('rate_limit');
        setAviso({ erro: true, texto: limite ? mensagemConfirmacao(error) : 'Não foi possível reenviar agora. Confira o e-mail informado e tente novamente.' });
        if (limite) setEspera(60);
      } else {
        setAviso({ erro: false, texto: 'Se houver uma confirmação pendente para esse e-mail, você receberá um novo link. Confira também o spam.' });
        setEspera(60);
      }
    } catch { setAviso({ erro: true, texto: 'Não foi possível conectar. Confira sua conexão e tente novamente.' }); }
    finally { setEnviando(false); }
  }
  const sucesso = resultado.estado === 'sucesso', validando = resultado.estado === 'validando', falhou = resultado.estado === 'erro';
  return <main className="confirmacao-email">
    <a className="confirmacao-marca" href="/" aria-label="Desk Events, início"><MarcaIcone /><strong>desk<span>events</span></strong></a>
    <section className="confirmacao-cartao" aria-labelledby="confirmacao-titulo" aria-busy={validando}>
      <div className={'confirmacao-simbolo' + (validando ? ' validando' : '')}><Icon name={sucesso ? 'check' : falhou ? 'link' : 'inbox'} size={34} /></div>
      <span className="confirmacao-etapa">SUA CONTA NO DESK EVENTS</span>
      <div role="status" aria-live="polite">
        <h1 id="confirmacao-titulo">{sucesso ? 'E-mail confirmado!' : validando ? 'Confirmando seu e-mail…' : falhou ? 'Vamos tentar de novo?' : 'Confira seu e-mail'}</h1>
        <p>{sucesso ? 'Tudo pronto. Seu escritório, seus agentes e suas próximas ideias esperam por você.' : validando ? 'Estamos validando seu link. Só mais um instante.' : falhou ? resultado.mensagem : emailEnviado ? <>Enviamos um link para <strong>{emailEnviado}</strong>. Abra a mensagem e confirme seu e-mail para começar.</> : 'Abra o link recebido por e-mail para concluir seu cadastro. Se precisar, solicite um novo link abaixo.'}</p>
      </div>
      {sucesso ? <a href="/" className="btn primario confirmacao-continuar">Entrar no escritório <Icon name="arrow" size={18} /></a> : !validando && <>
        <form onSubmit={reenviar} className="confirmacao-reenvio">
          <label htmlFor="confirmacao-email">E-mail da sua conta</label>
          <input id="confirmacao-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com.br" />
          <button className="btn primario" disabled={enviando || espera > 0}>{enviando ? 'Enviando…' : espera ? `Reenviar em ${espera}s` : 'Reenviar confirmação'}</button>
          {aviso && <p className={aviso.erro ? 'erro' : 'sucesso'} role="status">{aviso.texto}</p>}
        </form>
        <p className="confirmacao-dica">Não encontrou a mensagem? Confira as pastas de spam e promoções.</p>
        <a href="/" className="confirmacao-voltar">Voltar para entrar</a>
      </>}
    </section>
    <p className="confirmacao-rodape">Seu time conectado. Seu trabalho em movimento.</p>
  </main>;
}
