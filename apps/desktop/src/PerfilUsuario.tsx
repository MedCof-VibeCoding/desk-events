import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { supabase, type Aparencia } from './supabase';
import type { Perfil } from './social';
import { LOOKS, PERSONAGENS, avatarDe, normalizarAparencia, type Personagem } from './personagens';
import { Robot } from './Robot';
import { MarcaIcone } from './MarcaIcone';
import './social.css';

export function PerfilUsuario({ userId, children }: { userId: string; children: (perfil: Perfil) => ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null), [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState(''), [erro, setErro] = useState(''), [salvando, setSalvando] = useState(false);
  const [atualizacaoPendente, setAtualizacaoPendente] = useState(false);
  const [aparencia, setAparencia] = useState<Aparencia>(normalizarAparencia({ corpo: 'monitor', cor: '#ff6175', acessorio: null }));
  async function carregar() {
    setCarregando(true); setErro('');
    const { data, error } = await supabase.from('perfis').select('*').eq('user_id', userId).single();
    if (error) {
      const faltaTabela = error.code === 'PGRST205' || error.code === '42P01';
      setAtualizacaoPendente(faltaTabela);
      setErro(faltaTabela ? 'A atualização de usuários e salas ainda não foi aplicada ao banco. Avise o administrador para concluir a atualização; depois clique em Tentar novamente.' : 'Não foi possível carregar seu perfil. Verifique sua conexão e tente novamente.');
    }
    else { setPerfil(data as Perfil); setNome(data.nome); if (data.aparencia) setAparencia(data.aparencia); }
    setCarregando(false);
  }
  useEffect(() => { void carregar(); }, [userId]);
  async function salvar(e: FormEvent) {
    e.preventDefault(); if (salvando || !nome.trim()) return;
    setSalvando(true); setErro('');
    const { data, error } = await supabase.from('perfis').update({ nome: nome.trim(), aparencia }).eq('user_id', userId).select('*').single();
    if (error) setErro('Não foi possível salvar seu avatar. Tente novamente.'); else setPerfil(data as Perfil);
    setSalvando(false);
  }
  if (carregando) return <main className="centro"><p>Carregando seu perfil…</p></main>;
  if (!perfil && erro) return <main className="centro"><section className="cartao login"><MarcaIcone /><h1>{atualizacaoPendente ? 'Atualização do escritório pendente' : 'Não foi possível abrir seu perfil'}</h1><p className="erro" role="alert">{erro}</p><button className="btn primario" onClick={() => void carregar()}>Tentar novamente</button><button className="link" onClick={() => void supabase.auth.signOut()}>Sair</button></section></main>;
  if (perfil?.aparencia && perfil.nome.trim()) return <>{children(perfil)}</>;
  return <main className="centro perfil-inicial"><form className="cartao" onSubmit={salvar}>
    <div className="entrada-marca"><MarcaIcone />DeskCof</div>
    <h1>Quem vai entrar no escritório?</h1><p>Crie seu avatar pessoal. É assim que as outras pessoas vão ver você nas salas.</p>
    <label htmlFor="perfil-nome">Seu nome</label><input id="perfil-nome" required maxLength={80} value={nome} onChange={e => setNome(e.target.value)} autoComplete="name" />
    <div className="perfil-previa"><Robot aparencia={aparencia} tamanho={130} /></div>
    <div className="personagens" role="group" aria-label="Personagem pessoal">{PERSONAGENS.map(p => <button type="button" key={p.id} className="personagem-opcao" aria-pressed={aparencia.personagem === p.id} onClick={() => setAparencia({ ...aparencia, personagem: p.id as Personagem })}><img src={avatarDe({ ...aparencia, personagem: p.id as Personagem }).imagem} width={56} height={64} alt="" /><span>{p.nome}</span></button>)}</div>
    <label htmlFor="perfil-versao">Versão</label><select id="perfil-versao" value={aparencia.versao} onChange={e => setAparencia({ ...aparencia, versao: e.target.value as 'm' | 'f' })}><option value="m">Masculino</option><option value="f">Feminino</option></select>
    <label htmlFor="perfil-look">Roupa</label><select id="perfil-look" value={aparencia.look} onChange={e => setAparencia({ ...aparencia, look: e.target.value as Aparencia['look'] })}>{LOOKS.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
    {erro && <p className="erro" role="alert">{erro}</p>}
    {perfil ? <button className="btn primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar avatar e entrar'}</button> : <button type="button" className="btn" onClick={() => void carregar()}>Tentar novamente</button>}
    <button type="button" className="link" onClick={() => void supabase.auth.signOut()}>Sair</button>
  </form></main>;
}
