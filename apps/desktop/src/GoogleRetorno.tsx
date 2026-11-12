import { useEffect, useRef, useState } from 'react';
import { servidor } from './supabase';
export function GoogleRetorno() {
  const [erro, setErro] = useState(''), [ok, setOk] = useState(false);
  const params = useRef(new URLSearchParams(window.location.search)), tarefa = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    let ativo = true;
    window.history.replaceState(null, '', '/google-agenda');
    if (!tarefa.current) {
      const code = params.current.get('code'), state = params.current.get('state');
      if (params.current.has('error') || !code || !state || state !== sessionStorage.getItem('desk-google-state')) { setErro('A conexão não foi concluída. Volte à sala de reunião e tente novamente.'); return; }
      sessionStorage.removeItem('desk-google-state');
      tarefa.current = servidor('/api/google', { method: 'POST', body: JSON.stringify({ acao: 'concluir', code, state }) });
    }
    tarefa.current.then(() => { if (ativo) setOk(true); }).catch(e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, []);
  return <main className="centro"><section className="cartao"><h1>{ok ? 'Google Agenda conectado' : erro ? 'Não foi possível conectar' : 'Conectando Google Agenda…'}</h1><p role="status">{erro || (ok ? 'Você já pode agendar reuniões e convidar pessoas do aplicativo.' : 'Aguarde enquanto confirmamos sua autorização.')}</p>{(ok || erro) && <a className="btn primario" href="/">Voltar ao escritório</a>}</section></main>;
}
