import { useEffect, useState } from 'react';
import { supabase, type Papel } from './supabase';
import type { Perfil, SalaAcesso } from './social';
export function AcessosSala({ sala, perfil }: { sala: SalaAcesso; perfil: Perfil }) {
  const [usuarios, setUsuarios] = useState<Perfil[]>([]), [membros, setMembros] = useState<{ user_id: string; papel: Papel }[]>([]);
  const [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false);
  const podeGerir = sala.papel === 'dono' || perfil.admin_geral;
  async function carregar() {
    const [p, m] = await Promise.all([supabase.from('perfis').select('*').not('aparencia', 'is', null).order('nome'), supabase.from('membros').select('user_id,papel').eq('escritorio_id', sala.id)]);
    if (p.error || m.error) setErro('Não foi possível carregar os acessos.'); else { setUsuarios(p.data as Perfil[]); setMembros(m.data); }
  }
  useEffect(() => { void carregar(); }, [sala.id]);
  async function alterar(pessoa: string, papel: string) {
    setOcupado(true); setErro('');
    const { error } = await supabase.rpc('gerir_membro', { sala: sala.id, pessoa, novo_papel: papel || null });
    if (error) setErro(error.message); else await carregar();
    setOcupado(false);
  }
  return <section className="config-card"><h3>{perfil.admin_geral ? 'Usuários e permissões' : 'Pessoas nesta sala'}</h3><p className="mudo">{sala.principal ? 'O escritório principal recebe todos. Visitantes não podem criar ou operar agentes.' : 'A sala é privada. Somente as pessoas autorizadas podem entrar.'} Editores podem adicionar agentes; operadores podem executar tarefas.</p>
    {erro && <p className="erro" role="alert">{erro}</p>}
    <div className="acessos-lista">{usuarios.filter(u => podeGerir || membros.some(m => m.user_id === u.user_id)).map(u => <div key={u.user_id}><span><strong>{u.nome}</strong><small>{u.admin_geral ? 'Admin geral' : 'Usuário'}</small></span><select aria-label={`Acesso de ${u.nome}`} disabled={!podeGerir || ocupado || u.user_id === sala.criado_por} value={membros.find(m => m.user_id === u.user_id)?.papel ?? ''} onChange={e => void alterar(u.user_id, e.target.value)}><option value="">{sala.principal ? 'Visitante' : 'Sem acesso'}</option><option value="leitor">Visitante</option><option value="operador">Operador</option><option value="editor">Editor</option><option value="dono">Dono</option></select></div>)}</div>
  </section>;
}
