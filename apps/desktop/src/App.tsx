import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configurado, supabase } from './supabase';
import { Login } from './Login';
import { Office } from './Office';
import { GoogleRetorno } from './GoogleRetorno';
import { PerfilUsuario } from './PerfilUsuario';
import { ConfirmarEmail } from './ConfirmarEmail';
import { ehPaginaConfirmacao } from './confirmacaoEmail';

const confirmacao = typeof window !== 'undefined' && ehPaginaConfirmacao(window.location.href);

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!configurado) { setPronto(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setPronto(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (configurado && confirmacao) return <ConfirmarEmail />;
  if (!configurado) {
    return (
      <main className="centro">
        <h1>Escritório de Agentes</h1>
        <p className="aviso">Falta configurar o Supabase. Copie <code>.env.example</code> para <code>.env</code> em <code>apps/desktop</code>, preencha a chave e reinicie.</p>
      </main>
    );
  }
  if (!pronto) return <main className="centro"><p>Abrindo o escritório…</p></main>;
  if (session && window.location.pathname === '/google-agenda') return <GoogleRetorno />;
  return session ? <PerfilUsuario key={session.user.id} userId={session.user.id}>{perfil => <Office session={session} perfil={perfil} />}</PerfilUsuario> : <Login />;
}
