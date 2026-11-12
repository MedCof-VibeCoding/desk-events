import { useEffect, useState, type FormEvent } from 'react';
import { supabase, servidor, type Agente, type Aparencia, type Autonomia, type Provedor } from './supabase';
import { SkillsEscolha } from './SkillsEscolha';
import { Robot } from './Robot';
import { PERSONAGENS, LOOKS, avatarDe, normalizarAparencia, type Personagem } from './personagens';

const CORES = ['#2BB3A3', '#8B6CF0', '#F08A3C', '#E05A8A', '#3E6AE0', '#3BAA5C', '#E3A008', '#7A8399'];
const PROVEDORES: { v: Provedor; t: string }[] = [{ v: 'openai', t: 'ChatGPT' }, { v: 'google', t: 'Gemini' }, { v: 'anthropic', t: 'Claude' }];
// Sugere o modelo intermediário de cada provedor quando ele aparece na lista da conta.
const sugerir = (lista: string[]) => lista.find(m => /mini|flash|sonnet/.test(m) && !/nano|lite|preview|audio/.test(m)) ?? lista[0] ?? '';
const NIVEIS: { v: Autonomia; t: string }[] = [
  { v: 'assistido', t: 'Assistido: pede aprovação para tudo' },
  { v: 'supervisionado', t: 'Supervisionado: lê sozinho, pede para escrever' },
  { v: 'autonomo', t: 'Autônomo: só pede para ações irreversíveis' },
  { v: 'livre', t: 'Livre: age dentro da lista autorizada' }
];

export function AgentForm({ escritorioId, coresUsadas, agente, onFechar, onSalvo }: { escritorioId: string; coresUsadas: string[]; agente?: Agente; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(agente?.nome ?? '');
  const [cargo, setCargo] = useState(agente?.cargo ?? '');
  const [instrucoes, setInstrucoes] = useState(agente?.instrucoes ?? '');
  const [aparencia, setAparencia] = useState<Aparencia>(() => normalizarAparencia(agente?.aparencia ?? { corpo: 'monitor', cor: CORES.find(c => !coresUsadas.includes(c)) ?? CORES[0], acessorio: null }));
  const [autonomia, setAutonomia] = useState<Autonomia>(agente?.autonomia ?? 'supervisionado');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [provedor, setProvedor] = useState<Provedor>(agente?.provedor ?? 'openai');
  const [modelo, setModelo] = useState(agente?.modelo ?? '');
  const [modelos, setModelos] = useState<string[]>([]);
  const [avisoModelo, setAvisoModelo] = useState('');
  const [skills, setSkills] = useState<Set<string>>(new Set());
  const [skillsIniciais, setSkillsIniciais] = useState<Set<string>>(new Set());

  // Modelos disponíveis na conta do provedor escolhido.
  useEffect(() => {
    let vivo = true;
    setModelos([]); setAvisoModelo('Buscando modelos…');
    servidor<{ configurado: boolean; modelos: string[] }>(`/api/models?provedor=${provedor}`)
      .then(r => {
        if (!vivo) return;
        setModelos(r.modelos);
        setModelo(atual => (atual && (r.modelos.includes(atual) || !r.modelos.length)) ? atual : sugerir(r.modelos));
        setAvisoModelo(!r.configurado ? 'A chave deste provedor ainda não foi configurada no servidor.' : r.modelos.length ? '' : 'Nenhum modelo encontrado; digite o nome.');
      })
      .catch(e => { if (vivo) setAvisoModelo(`${(e as Error).message} Digite o nome do modelo.`); });
    return () => { vivo = false; };
  }, [provedor]);

  // Skills que o agente já tem.
  useEffect(() => {
    if (!agente) return;
    supabase.from('agente_skill').select('skill_id').eq('agente_id', agente.id).then(({ data }) => {
      const ids = new Set((data ?? []).map(l => l.skill_id as string));
      setSkills(ids); setSkillsIniciais(ids);
    });
  }, [agente]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!modelo.trim()) { setErro('Escolha o modelo de IA do agente.'); return; }
    setSalvando(true); setErro('');
    const campos = { nome: nome.trim(), cargo: cargo.trim(), instrucoes: instrucoes.trim(), aparencia, autonomia, provedor, modelo: modelo.trim() };
    const res = agente
      ? await supabase.from('agentes').update(campos).eq('id', agente.id).select('id').single()
      : await supabase.from('agentes').insert({ escritorio_id: escritorioId, ...campos }).select('id').single();
    if (res.error || !res.data) {
      setSalvando(false);
      setErro(res.error?.code === '23505' ? 'Já existe um agente com esse nome.' : res.error?.message ?? 'Não foi possível salvar.');
      return;
    }
    const id = res.data.id as string;
    const tirar = [...skillsIniciais].filter(k => !skills.has(k));
    const por = [...skills].filter(k => !skillsIniciais.has(k));
    if (tirar.length) await supabase.from('agente_skill').delete().eq('agente_id', id).in('skill_id', tirar);
    const ins = por.length ? await supabase.from('agente_skill').insert(por.map(skill_id => ({ agente_id: id, skill_id, escritorio_id: escritorioId }))) : { error: null };
    setSalvando(false);
    if (ins.error) { setErro('O agente foi salvo, mas algumas skills não foram ligadas. Tente salvar de novo.'); return; }
    onSalvo();
  }

  return (
    <div className="fundo" role="dialog" aria-modal="true" aria-labelledby="titulo-agente">
      <form className="cartao agente-form" onSubmit={salvar}>
        <h2 id="titulo-agente">{agente ? 'Editar agente' : 'Criar agente'}</h2>
        <div className="duas">
          <div>
            <label htmlFor="a-nome">Nome</label>
            <input id="a-nome" required maxLength={40} value={nome} onChange={e => setNome(e.target.value)} />
            <label htmlFor="a-cargo">Cargo</label>
            <input id="a-cargo" maxLength={120} value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Classifica os pedidos e define a prioridade" />
            <label htmlFor="a-inst">Instruções</label>
            <textarea id="a-inst" rows={5} value={instrucoes} onChange={e => setInstrucoes(e.target.value)} placeholder="O que ele faz, o que recebe e o que entrega." />
          </div>
          <div className="previa">
            <Robot aparencia={aparencia} tamanho={120} />
            <span className="rotulo" id="a-personagem">Personagem</span>
            <div className="personagens" role="group" aria-labelledby="a-personagem">
              {PERSONAGENS.map(p => (
                <button key={p.id} type="button" className="personagem-opcao" aria-pressed={avatarDe(aparencia).personagem === p.id}
                  onClick={() => setAparencia({ ...aparencia, personagem: p.id as Personagem })}>
                  <img src={avatarDe({ ...aparencia, personagem: p.id as Personagem }).imagem} alt="" width={56} height={64} />
                  <span>{p.nome}</span>
                </button>
              ))}
            </div>
            <span className="rotulo" id="a-versao">Versão</span>
            <div className="variacoes-avatar" role="group" aria-labelledby="a-versao">
              {([{ id: 'm', nome: 'Masculino' }, { id: 'f', nome: 'Feminina' }] as const).map(v => <button type="button" className="btn" key={v.id} aria-pressed={aparencia.versao === v.id} onClick={() => setAparencia({ ...aparencia, versao: v.id })}>{v.nome}</button>)}
            </div>
            <span className="rotulo" id="a-look">Look</span>
            <div className="variacoes-avatar" role="group" aria-labelledby="a-look">
              {LOOKS.map(l => <button type="button" className="btn" key={l.id} aria-pressed={aparencia.look === l.id} onClick={() => setAparencia({ ...aparencia, look: l.id })}>{l.nome}</button>)}
            </div>
            <span className="rotulo" id="a-cor">Cor de identificação</span>
            <div className="cores" role="radiogroup" aria-labelledby="a-cor">
              {CORES.map(c => <button key={c} type="button" role="radio" aria-checked={aparencia.cor === c} aria-label={`Cor ${c}`} style={{ background: c }} onClick={() => setAparencia({ ...aparencia, cor: c })} />)}
            </div>
          </div>
        </div>
        <div className="secao-form">
          <h3>Modelo de IA</h3>
          <div className="duas">
            <div>
              <label htmlFor="a-prov">Provedor</label>
              <select id="a-prov" value={provedor} onChange={e => { setProvedor(e.target.value as Provedor); setModelo(''); }}>
                {PROVEDORES.map(p => <option key={p.v} value={p.v}>{p.t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="a-modelo">Modelo</label>
              {modelos.length > 0 ? (
                <select id="a-modelo" value={modelo} onChange={e => setModelo(e.target.value)}>
                  {!modelos.includes(modelo) && modelo && <option value={modelo}>{modelo}</option>}
                  {modelos.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : <input id="a-modelo" value={modelo} onChange={e => setModelo(e.target.value)} placeholder="Nome do modelo" />}
              {avisoModelo && <p className="mudo">{avisoModelo}</p>}
            </div>
          </div>
        </div>
        <div className="secao-form">
          <h3>Skills</h3>
          <p className="mudo">Escolha o que este agente sabe fazer. Cada skill traz instruções que ele segue quando o pedido se encaixar.</p>
          <SkillsEscolha escritorioId={escritorioId} escolhidas={skills} onMudar={setSkills} />
        </div>
        <div className="secao-form">
        <label htmlFor="a-auto">Autonomia</label>
        <select id="a-auto" value={autonomia} onChange={e => setAutonomia(e.target.value as Autonomia)}>
          {NIVEIS.map(n => <option key={n.v} value={n.v}>{n.t}</option>)}
        </select>
        </div>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <div className="acoes fim">
          <button type="button" className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn primario" disabled={salvando}>{salvando ? 'Salvando…' : agente ? 'Salvar' : 'Criar agente'}</button>
        </div>
      </form>
    </div>
  );
}
