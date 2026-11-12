import { useState, type FormEvent } from 'react';
import type { MensagemCafe, PessoaPresente } from './social';
export function Cafe({ pessoas, mensagens, userId, onEnviar }: { pessoas: PessoaPresente[]; mensagens: MensagemCafe[]; userId: string; onEnviar: (texto: string, para: string | null) => Promise<void> }) {
  const [texto, setTexto] = useState(''), [para, setPara] = useState(''), [erro, setErro] = useState(''), [enviando, setEnviando] = useState(false);
  async function enviar(e: FormEvent) {
    e.preventDefault(); if (!texto.trim() || enviando) return;
    setEnviando(true); setErro('');
    try { await onEnviar(texto.trim(), para || null); setTexto(''); } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível enviar.'); } finally { setEnviando(false); }
  }
  return <section className="cafe-conversa" aria-label="Conversa do café"><h3>Café · conversa livre</h3><p className="mudo">Sua mensagem aparece em um balão acima do seu avatar por alguns segundos.</p>
    <div className="cafe-historico" aria-live="polite" aria-relevant="additions">{mensagens.slice(-12).map(m => <p key={m.id}><strong>{pessoas.find(p => p.user_id === m.user_id)?.nome ?? (m.user_id === userId ? 'Você' : 'Participante')}{m.destinatario ? ' · privado' : ''}: </strong>{m.texto}</p>)}</div>
    <form onSubmit={enviar}><label htmlFor="cafe-para">Conversar com</label><select id="cafe-para" value={para} onChange={e => setPara(e.target.value)}><option value="">Todos no café</option>{pessoas.filter(p => p.zona === 'cafe' && p.user_id !== userId).map(p => <option key={p.user_id} value={p.user_id}>{p.nome} · privado</option>)}</select>
      <label htmlFor="cafe-texto">Mensagem</label><div className="linha-acoes"><input id="cafe-texto" maxLength={280} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Compartilhe uma ideia…" required /><button className="btn primario" disabled={enviando || !texto.trim()}>{enviando ? 'Enviando…' : 'Enviar'}</button></div>{erro && <p className="erro" role="alert">{erro}</p>}
    </form></section>;
}
