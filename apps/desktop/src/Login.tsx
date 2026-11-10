import { useState, type FormEvent } from 'react';
import { supabase } from './supabase';
import { PERSONAGENS } from './personagens';
import { Icon } from './Icon';
import { ConfirmarEmail } from './ConfirmarEmail';
import { urlConfirmacao } from './confirmacaoEmail';
import './workspace.css';

export function Login() {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState('');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true); setMsg(null);
    if (modo === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) setMsg({ tipo: 'erro', texto: error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message });
    } else {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: senha, options: { emailRedirectTo: urlConfirmacao(window.location.origin) } });
      if (!error && !data.session) { setSenha(''); setEmailEnviado(email.trim()); }
      if (error) setMsg({ tipo: 'erro', texto: error.message });
      else if (!data.session) setMsg({ tipo: 'ok', texto: 'Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.' });
    }
    setEnviando(false);
  }

  if (emailEnviado) return <ConfirmarEmail emailEnviado={emailEnviado} />;
  return (
    <main className="entrada-workspace">
      <section className="entrada-apresentacao" aria-label="Desk Events">
        <div className="entrada-marca"><Icon name="office" size={28} />desk<span>events</span></div>
        <div><span className="sobretitulo">PESSOAS, IDEIAS E AGENTES</span><h1>Um espaço.<br />Muitas possibilidades.</h1><p>Reúna sua equipe, dê vida aos seus agentes e acompanhe cada entrega no seu escritório virtual.</p></div>
        <div className="entrada-personagens">{PERSONAGENS.slice(0, 3).map((p, i) => <div key={p.id} className={`entrada-personagem p-${i}`}><img src={p.imagem} alt={`Personagem ${p.nome}`} /><span>{['Vamos criar?', 'Cada detalhe conta.', 'Mais uma entrega!'][i]}</span></div>)}</div>
        <p className="entrada-rodape">Seu time conectado. Seu trabalho em movimento.</p>
      </section>
      <section className="entrada-formulario">
      <form className="cartao login" onSubmit={enviar}>
        <span className="sobretitulo">BEM-VINDO AO DESK EVENTS</span>
        <h2>{modo === 'entrar' ? 'Entre no seu escritório' : 'Seu novo espaço começa aqui'}</h2>
        <p className="mudo">{modo === 'entrar' ? 'Seu time e suas próximas ideias esperam por você.' : 'Crie sua conta para organizar seu time de agentes.'}</p>
        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        <label htmlFor="senha">Senha</label>
        <input id="senha" type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} required minLength={8} value={senha} onChange={e => setSenha(e.target.value)} />
        {msg && <p className={msg.tipo === 'erro' ? 'erro' : 'sucesso'} role="status">{msg.texto}</p>}
        <button className="btn primario" disabled={enviando}>{enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar no escritório' : 'Criar conta'}</button>
        <button type="button" className="link" onClick={() => { setModo(modo === 'entrar' ? 'criar' : 'entrar'); setMsg(null); }}>
          {modo === 'entrar' ? 'Ainda não tenho conta' : 'Já tenho conta'}
        </button>
      </form>
      </section>
    </main>
  );
}
