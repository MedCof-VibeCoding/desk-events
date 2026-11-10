import { useState, type FormEvent } from 'react';
import { supabase, type Agente, type Aparencia, type Autonomia } from './supabase';
import { Robot } from './Robot';
import { PERSONAGENS, LOOKS, avatarDe, normalizarAparencia, type Personagem } from './personagens';

const CORES = ['#2BB3A3', '#8B6CF0', '#F08A3C', '#E05A8A', '#3E6AE0', '#3BAA5C', '#E3A008', '#7A8399'];
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

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro('');
    const campos = { nome: nome.trim(), cargo: cargo.trim(), instrucoes: instrucoes.trim(), aparencia, autonomia };
    const { error } = agente
      ? await supabase.from('agentes').update(campos).eq('id', agente.id)
      : await supabase.from('agentes').insert({ escritorio_id: escritorioId, ...campos, provedor: 'openai', modelo: 'gpt-4.1-mini' });
    setSalvando(false);
    if (error) setErro(error.code === '23505' ? 'Já existe um agente com esse nome.' : error.message); else onSalvo();
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
        <label htmlFor="a-auto">Autonomia</label>
        <select id="a-auto" value={autonomia} onChange={e => setAutonomia(e.target.value as Autonomia)}>
          {NIVEIS.map(n => <option key={n.v} value={n.v}>{n.t}</option>)}
        </select>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <div className="acoes fim">
          <button type="button" className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn primario" disabled={salvando}>{salvando ? 'Salvando…' : agente ? 'Salvar' : 'Criar agente'}</button>
        </div>
      </form>
    </div>
  );
}
