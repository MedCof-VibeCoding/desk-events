import { useState, type FormEvent } from 'react';
import { supabase } from './supabase';

export function Login() {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true); setMsg(null);
    if (modo === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) setMsg({ tipo: 'erro', texto: error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message });
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password: senha });
      if (error) setMsg({ tipo: 'erro', texto: error.message });
      else if (!data.session) setMsg({ tipo: 'ok', texto: 'Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.' });
    }
    setEnviando(false);
  }

  return (
    <main className="centro">
      <form className="cartao login" onSubmit={enviar}>
        <h1>Escritório de Agentes</h1>
        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        <label htmlFor="senha">Senha</label>
        <input id="senha" type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} required minLength={8} value={senha} onChange={e => setSenha(e.target.value)} />
        {msg && <p className={msg.tipo === 'erro' ? 'erro' : 'sucesso'} role="status">{msg.texto}</p>}
        <button className="btn primario" disabled={enviando}>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</button>
        <button type="button" className="link" onClick={() => { setModo(modo === 'entrar' ? 'criar' : 'entrar'); setMsg(null); }}>
          {modo === 'entrar' ? 'Ainda não tenho conta' : 'Já tenho conta'}
        </button>
      </form>
    </main>
  );
}
