import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configurado, supabase } from './supabase';
import { Login } from './Login';
import { Office } from './Office';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!configurado) { setPronto(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setPronto(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configurado) {
    return (
      <main className="centro">
        <h1>Escritório de Agentes</h1>
        <p className="aviso">Falta configurar o Supabase. Copie <code>.env.example</code> para <code>.env</code> em <code>apps/desktop</code>, preencha a chave e reinicie.</p>
      </main>
    );
  }
  if (!pronto) return <main className="centro"><p>Abrindo o escritório…</p></main>;
  return session ? <Office session={session} /> : <Login />;
}
