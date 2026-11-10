import { useEffect, useState, type FormEvent } from 'react';
import { supabase, servidor, type Aparencia, type Autonomia, type Provedor } from './supabase';
import { Robot } from './Robot';

const CORES = ['#2BB3A3', '#8B6CF0', '#F08A3C', '#E05A8A', '#3E6AE0', '#3BAA5C', '#E3A008', '#7A8399'];
const CORPOS: { v: Aparencia['corpo']; t: string }[] = [{ v: 'monitor', t: 'Monitor' }, { v: 'redondo', t: 'Redondo' }, { v: 'antenas', t: 'Duas antenas' }];
const ACESSORIOS: { v: Aparencia['acessorio']; t: string }[] = [{ v: null, t: 'Nenhum' }, { v: 'gravata', t: 'Gravata' }, { v: 'fone', t: 'Fone' }, { v: 'bone', t: 'Boné' }];
const PROVEDORES: { v: Provedor; t: string }[] = [{ v: 'anthropic', t: 'Claude' }, { v: 'openai', t: 'ChatGPT' }, { v: 'google', t: 'Gemini' }];
const NIVEIS: { v: Autonomia; t: string }[] = [
  { v: 'assistido', t: 'Assistido: pede aprovação para tudo' },
  { v: 'supervisionado', t: 'Supervisionado: lê sozinho, pede para escrever' },
  { v: 'autonomo', t: 'Autônomo: só pede para ações irreversíveis' },
  { v: 'livre', t: 'Livre: age dentro da lista autorizada' }
];

export function AgentForm({ escritorioId, onFechar, onCriado }: { escritorioId: string; onFechar: () => void; onCriado: () => void }) {
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('');
  const [instrucoes, setInstrucoes] = useState('');
  const [aparencia, setAparencia] = useState<Aparencia>({ corpo: 'monitor', cor: CORES[0], acessorio: null });
  const [provedor, setProvedor] = useState<Provedor>('anthropic');
  const [modelo, setModelo] = useState('');
  const [autonomia, setAutonomia] = useState<Autonomia>('supervisionado');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [modelos, setModelos] = useState<string[]>([]);
  const [avisoModelo, setAvisoModelo] = useState('');

  // Busca no servidor os modelos disponíveis na conta do provedor escolhido.
  useEffect(() => {
    let vivo = true;
    setModelos([]); setModelo(''); setAvisoModelo('Buscando modelos…');
    servidor<{ configurado: boolean; modelos: string[] }>(`/api/models?provedor=${provedor}`)
      .then(r => {
        if (!vivo) return;
        setModelos(r.modelos);
        setAvisoModelo(r.configurado ? (r.modelos.length ? '' : 'Nenhum modelo encontrado; digite o nome.') : 'A chave deste provedor ainda não foi configurada no servidor.');
      })
      .catch(e => { if (vivo) setAvisoModelo(`${(e as Error).message} Digite o nome do modelo.`); });
    return () => { vivo = false; };
  }, [provedor]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro('');
    const { error } = await supabase.from('agentes').insert({
      escritorio_id: escritorioId, nome: nome.trim(), cargo: cargo.trim(), instrucoes: instrucoes.trim(), aparencia, provedor, modelo: modelo.trim(), autonomia
    });
    setSalvando(false);
    if (error) setErro(error.code === '23505' ? 'Já existe um agente com esse nome.' : error.message); else onCriado();
  }

  return (
    <div className="fundo" role="dialog" aria-modal="true" aria-labelledby="titulo-agente">
      <form className="cartao agente-form" onSubmit={salvar}>
        <h2 id="titulo-agente">Criar agente</h2>
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
            <label htmlFor="a-corpo">Corpo</label>
            <select id="a-corpo" value={aparencia.corpo} onChange={e => setAparencia({ ...aparencia, corpo: e.target.value as Aparencia['corpo'] })}>
              {CORPOS.map(c => <option key={c.v} value={c.v}>{c.t}</option>)}
            </select>
            <label htmlFor="a-acess">Acessório</label>
            <select id="a-acess" value={aparencia.acessorio ?? ''} onChange={e => setAparencia({ ...aparencia, acessorio: (e.target.value || null) as Aparencia['acessorio'] })}>
              {ACESSORIOS.map(c => <option key={c.t} value={c.v ?? ''}>{c.t}</option>)}
            </select>
            <span className="rotulo" id="a-cor">Cor</span>
            <div className="cores" role="radiogroup" aria-labelledby="a-cor">
              {CORES.map(c => <button key={c} type="button" role="radio" aria-checked={aparencia.cor === c} aria-label={`Cor ${c}`} style={{ background: c }} onClick={() => setAparencia({ ...aparencia, cor: c })} />)}
            </div>
          </div>
        </div>
        <div className="duas">
          <div>
            <label htmlFor="a-prov">Modelo de IA</label>
            <select id="a-prov" value={provedor} onChange={e => setProvedor(e.target.value as Provedor)}>
              {PROVEDORES.map(p => <option key={p.v} value={p.v}>{p.t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="a-modelo">Nome do modelo</label>
            {modelos.length > 0 ? (
              <select id="a-modelo" required value={modelo} onChange={e => setModelo(e.target.value)}>
                <option value="">Escolha um modelo</option>
                {modelos.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input id="a-modelo" required value={modelo} onChange={e => setModelo(e.target.value)} placeholder="Nome do modelo" />
            )}
            {avisoModelo && <p className="mudo">{avisoModelo}</p>}
          </div>
        </div>
        <label htmlFor="a-auto">Autonomia</label>
        <select id="a-auto" value={autonomia} onChange={e => setAutonomia(e.target.value as Autonomia)}>
          {NIVEIS.map(n => <option key={n.v} value={n.v}>{n.t}</option>)}
        </select>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <div className="acoes fim">
          <button type="button" className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn primario" disabled={salvando}>Criar agente</button>
        </div>
      </form>
    </div>
  );
}
