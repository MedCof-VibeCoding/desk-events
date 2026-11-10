import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from './supabase';
import { Icon } from './Icon';
import { erroColaboracao } from './colaboracao';

const CANAIS = [{ id: 'geral', nome: 'Geral', descricao: 'Um espaço para conectar toda a equipe.' }, { id: 'eventos', nome: 'Eventos', descricao: 'Planejamento, alinhamentos e novidades dos eventos.' }, { id: 'operacao', nome: 'Operação', descricao: 'Os detalhes que fazem tudo acontecer.' }];
interface Mensagem { id: string; criado_por: string; autor: string; texto: string; criado_em: string }
export function ChatEquipe({ escritorioId, userId, nome, podeOperar }: { escritorioId: string; userId: string; nome: string; podeOperar: boolean }) {
  const [canal, setCanal] = useState('geral');
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [disponivel, setDisponivel] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const fim = useRef<HTMLDivElement>(null);
  const canalAtual = useRef(canal); canalAtual.current = canal;
  useEffect(() => {
    let ativo = true;
    setMensagens([]); setErro(''); setCarregando(true); setDisponivel(false);
    const carregar = async () => {
      const { data, error } = await supabase.from('mensagens_equipe').select('id,criado_por,autor,texto,criado_em').eq('escritorio_id', escritorioId).eq('canal', canal).order('criado_em', { ascending: false }).limit(100);
      if (!ativo) return;
      if (error) { setErro(erroColaboracao(error)); setDisponivel(false); }
      else { setMensagens(((data ?? []) as Mensagem[]).reverse()); setDisponivel(true); setErro(''); }
      setCarregando(false);
    };
    void carregar();
    const sub = supabase.channel(`chat-${escritorioId}-${canal}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens_equipe', filter: `escritorio_id=eq.${escritorioId}` }, () => void carregar()).subscribe();
    return () => { ativo = false; void supabase.removeChannel(sub); };
  }, [escritorioId, canal, tentativa]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest' }); }, [mensagens.length]);
  async function enviar(e: FormEvent) {
    e.preventDefault(); if (!texto.trim() || enviando || !disponivel) return;
    const destino = canal, conteudo = texto.trim();
    setEnviando(true); setErro('');
    try {
      const { data, error } = await supabase.from('mensagens_equipe').insert({ escritorio_id: escritorioId, canal: destino, texto: conteudo, autor: nome.slice(0, 80), criado_por: userId }).select('id,criado_por,autor,texto,criado_em').single();
      if (canalAtual.current !== destino) return;
      if (error) setErro(erroColaboracao(error));
      else { setTexto(''); if (data) setMensagens(atuais => atuais.some(m => m.id === data.id) ? atuais : [...atuais, data as Mensagem].slice(-100)); }
    } catch { if (canalAtual.current === destino) setErro('Não foi possível enviar a mensagem. Tente novamente.'); }
    finally { setEnviando(false); }
  }
  return <section className="pagina-workspace pagina-chat" aria-labelledby="titulo-chat">
    <div className="pagina-titulo"><div><span className="sobretitulo">CONVERSAS DA EQUIPE</span><h2 id="titulo-chat">Um lugar para trocar ideias</h2><p className="mudo">Converse com as pessoas do escritório. Para pedir tarefas à IA, abra um agente.</p></div><Icon name="chat" size={32} /></div>
    <div className="chat-layout"><nav className="canais" aria-label="Canais do chat"><span className="sobretitulo">CANAIS</span>{CANAIS.map(c => <button key={c.id} className={canal === c.id ? 'selecionado' : ''} aria-pressed={canal === c.id} onClick={() => { setCanal(c.id); setTexto(''); }}># <span>{c.nome}</span></button>)}<p className="mudo">Canais visíveis para todos os membros deste escritório.</p></nav>
      <div className="conversa"><header><h3># {CANAIS.find(c => c.id === canal)?.nome}</h3><p className="mudo">{CANAIS.find(c => c.id === canal)?.descricao}</p></header>
        {erro && <div className="aviso-recurso" role="alert"><p>{erro}</p><button className="btn pequeno" onClick={() => setTentativa(t => t + 1)}>Tentar novamente</button></div>}
        <div className="mensagens" aria-label="Mensagens do canal" aria-busy={carregando}>
          {carregando ? <p role="status">Carregando mensagens…</p> : disponivel && mensagens.length === 0 ? <div className="estado-vazio"><Icon name="chat" size={32} /><h3>A conversa começa aqui</h3><p>Compartilhe uma ideia ou um alinhamento com a equipe.</p></div> : mensagens.map(m => <article key={m.id} className={'mensagem' + (m.criado_por === userId ? ' minha' : '')}>
            <div className="avatar-inicial" aria-hidden="true">{m.autor.slice(0, 1).toUpperCase()}</div><div><header><strong>{m.autor}{m.criado_por === userId ? ' · você' : ''}</strong><time dateTime={m.criado_em}>{new Date(m.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></header><p>{m.texto}</p></div>
          </article>)}<div ref={fim} />
        </div>
        {podeOperar ? <form className="compor-mensagem" onSubmit={enviar}><label className="so-leitor" htmlFor="mensagem-equipe">Mensagem para o canal</label><textarea id="mensagem-equipe" placeholder={`Mensagem para #${canal}`} maxLength={4000} rows={2} value={texto} disabled={!disponivel || enviando} onChange={e => setTexto(e.target.value)} /><button className="btn primario" disabled={!disponivel || enviando || !texto.trim()}><Icon name="send" /><span>{enviando ? 'Enviando…' : 'Enviar'}</span></button></form> : <p className="mudo aviso-leitura">Seu acesso permite ler as conversas.</p>}
      </div>
    </div>
  </section>;
}
