import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './extras.css';

export interface Skill { id: string; nome: string; titulo: string; categoria: string; descricao: string; de_fabrica: boolean }

const ORDEM = ['Pesquisa e análise', 'Escrita e comunicação', 'Documentos', 'Marketing e vendas', 'Eventos', 'Produto e tecnologia', 'Gestão', 'Habilidades do escritório', 'Personalizadas'];
const sem = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const slug = (s: string) => sem(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'skill';

// Lista de skills para ligar ao agente: biblioteca pronta mais as criadas na sala.
export function SkillsEscolha({ escritorioId, escolhidas, onMudar }: { escritorioId: string; escolhidas: Set<string>; onMudar: (s: Set<string>) => void }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [busca, setBusca] = useState('');
  const [criando, setCriando] = useState(false);
  const [nova, setNova] = useState({ titulo: '', descricao: '', instrucoes: '' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    supabase.from('skills').select('id, nome, titulo, categoria, descricao, de_fabrica').order('titulo')
      .then(({ data, error }) => { if (!vivo) return; if (error) setErro('Não foi possível carregar as skills.'); else setSkills((data ?? []) as Skill[]); });
    return () => { vivo = false; };
  }, [escritorioId]);

  const grupos = useMemo(() => {
    const t = sem(busca.trim());
    const filtradas = skills.filter(k => !t || sem(`${k.titulo} ${k.descricao} ${k.categoria}`).includes(t));
    const mapa = new Map<string, Skill[]>();
    for (const k of filtradas) { const c = k.de_fabrica ? k.categoria : 'Personalizadas'; mapa.set(c, [...(mapa.get(c) ?? []), k]); }
    return [...mapa.entries()].sort((a, b) => (ORDEM.indexOf(a[0]) + 99) % 99 - (ORDEM.indexOf(b[0]) + 99) % 99 || a[0].localeCompare(b[0]));
  }, [skills, busca]);

  function alternar(id: string) {
    const prox = new Set(escolhidas);
    if (prox.has(id)) prox.delete(id); else prox.add(id);
    onMudar(prox);
  }

  async function criar() {
    setErro('');
    const titulo = nova.titulo.trim(), descricao = nova.descricao.trim(), instrucoes = nova.instrucoes.trim();
    if (titulo.length < 2) return setErro('Dê um nome à skill.');
    if (descricao.length < 10) return setErro('Descreva em uma frase quando usar a skill (pelo menos 10 letras).');
    if (instrucoes.length < 10) return setErro('Escreva as instruções da skill.');
    setSalvando(true);
    const nome = `${slug(titulo)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase.from('skills')
      .insert({ escritorio_id: escritorioId, nome, titulo, descricao, instrucoes, categoria: 'Personalizadas' })
      .select('id, nome, titulo, categoria, descricao, de_fabrica').single();
    setSalvando(false);
    if (error || !data) { setErro(error?.message.includes('row-level') ? 'Seu papel nesta sala não permite criar skills.' : 'Não foi possível criar a skill.'); return; }
    setSkills(lista => [...lista, data as Skill]);
    onMudar(new Set([...escolhidas, (data as Skill).id]));
    setNova({ titulo: '', descricao: '', instrucoes: '' }); setCriando(false);
  }

  const nomes = skills.filter(k => escolhidas.has(k.id)).map(k => k.titulo);
  return (
    <div className="skills-escolha">
      {nomes.length > 0 && <div className="skills-escolhidas" aria-label="Skills escolhidas">{nomes.map(n => <span key={n}>{n}</span>)}</div>}
      <div className="skills-topo">
        <label className="so-leitor" htmlFor="busca-skill">Buscar skill</label>
        <input id="busca-skill" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar skill: pesquisa, e-mail, evento…" />
        <span className="skills-contagem">{escolhidas.size} escolhida{escolhidas.size === 1 ? '' : 's'}</span>
      </div>
      <div className="skills-lista">
        {grupos.length === 0 && <p className="mudo">Nenhuma skill encontrada.</p>}
        {grupos.map(([cat, lista], i) => (
          <details key={cat} open={!!busca.trim() || i === 0 || lista.some(k => escolhidas.has(k.id))}>
            <summary>{cat} <span className="mudo">({lista.length})</span></summary>
            {lista.map(k => (
              <label key={k.id} className="skill-item">
                <input type="checkbox" checked={escolhidas.has(k.id)} onChange={() => alternar(k.id)} />
                <strong>{k.titulo}{!k.de_fabrica && <span className="skill-propria">da sua sala</span>}</strong>
                <small>{k.descricao}</small>
              </label>
            ))}
          </details>
        ))}
      </div>
      {criando ? (
        <div className="skill-nova">
          <label htmlFor="sk-titulo">Nome da skill</label>
          <input id="sk-titulo" maxLength={60} value={nova.titulo} onChange={e => setNova({ ...nova, titulo: e.target.value })} placeholder="Ex.: Resposta a inscritos" />
          <label htmlFor="sk-desc">Quando usar</label>
          <input id="sk-desc" maxLength={400} value={nova.descricao} onChange={e => setNova({ ...nova, descricao: e.target.value })} placeholder="Ex.: Responde dúvidas de inscritos sobre pagamento e certificado." />
          <label htmlFor="sk-inst">Instruções</label>
          <textarea id="sk-inst" maxLength={8000} value={nova.instrucoes} onChange={e => setNova({ ...nova, instrucoes: e.target.value })} placeholder={'Escreva em passos:\n1. Cumprimente pelo nome.\n2. Responda só com o que está na política do evento.\n3. Nunca prometa reembolso sem aprovação.'} />
          <div className="acoes">
            <button type="button" className="btn primario" disabled={salvando} onClick={() => void criar()}>{salvando ? 'Criando…' : 'Criar e escolher'}</button>
            <button type="button" className="btn" onClick={() => { setCriando(false); setErro(''); }}>Cancelar</button>
          </div>
        </div>
      ) : <button type="button" className="btn" onClick={() => setCriando(true)}>+ Criar minha própria skill</button>}
      {erro && <p className="erro" role="alert">{erro}</p>}
    </div>
  );
}
