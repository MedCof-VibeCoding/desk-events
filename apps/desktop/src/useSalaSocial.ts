import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { presentesAtivos, baloesAtivos, type MensagemCafe, type Perfil, type PessoaPresente, type Zona } from './social';

export function useSalaSocial(sala: string | undefined, perfil: Perfil) {
  const [pessoas, setPessoas] = useState<PessoaPresente[]>([]), [mensagens, setMensagens] = useState<MensagemCafe[]>([]);
  const [zona, setZona] = useState<Zona>('geral'), [erro, setErro] = useState('');
  const [agora, setAgora] = useState(Date.now());
  const instancia = useRef(crypto.randomUUID()), area = useRef<Zona>('geral');
  const atual = useRef(sala), leitura = useRef(0), fila = useRef(Promise.resolve()); atual.current = sala;
  const registrar = useCallback((sala: string, area: Zona, instancia: string) => {
    const tarefa = fila.current.then(() => supabase.rpc('marcar_presenca', { sala, area, instancia }));
    fila.current = tarefa.then(() => {}, () => {});
    return tarefa;
  }, []);
  const carregar = useCallback(async () => {
    if (!sala) return;
    const pedido = ++leitura.current;
    const [presencas, chat] = await Promise.all([
      supabase.from('presencas').select('user_id,zona,x,z,visto_em,perfis(nome,aparencia)').eq('escritorio_id', sala).gte('visto_em', new Date(Date.now() - 70_000).toISOString()),
      supabase.from('mensagens_cafe').select('id,user_id,destinatario,texto,criado_em').eq('escritorio_id', sala).order('criado_em', { ascending: false }).limit(60)
    ]);
    if (atual.current !== sala || leitura.current !== pedido) return;
    if (presencas.error || chat.error) { setErro('Não foi possível atualizar as pessoas e conversas desta sala.'); return; }
    setPessoas((presencas.data ?? []).flatMap(linha => {
      const p = linha.perfis as unknown as Pick<Perfil, 'nome' | 'aparencia'>;
      return p?.aparencia ? [{ user_id: linha.user_id, nome: p.nome, aparencia: p.aparencia, zona: linha.zona as Zona, x: linha.x, z: linha.z, visto_em: linha.visto_em }] : [];
    }));
    setMensagens((chat.data ?? []).reverse());
  }, [sala]);
  useEffect(() => {
    if (!sala) return;
    const sessao = crypto.randomUUID(); instancia.current = sessao;
    area.current = 'geral'; setZona('geral'); setPessoas([]); setMensagens([]); setErro('');
    let ativo = true;
    const marcar = async () => {
      const { error } = await registrar(sala, area.current, sessao);
      if (!ativo) return;
      if (error) setErro('Não foi possível entrar nesta sala. Verifique seu acesso.');
      else { setErro(''); void carregar(); }
    };
    void marcar();
    const sub = supabase.channel(`social-${sala}-${perfil.user_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presencas', filter: `escritorio_id=eq.${sala}` }, () => void carregar())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens_cafe', filter: `escritorio_id=eq.${sala}` }, () => void carregar())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'perfis' }, () => void carregar()).subscribe();
    const batimento = setInterval(() => void marcar(), 20_000), relogio = setInterval(() => setAgora(Date.now()), 1_000);
    const voltar = () => { if (document.visibilityState === 'visible') void marcar(); };
    document.addEventListener('visibilitychange', voltar);
    return () => { ativo = false; leitura.current++; clearInterval(batimento); clearInterval(relogio); document.removeEventListener('visibilitychange', voltar); void supabase.removeChannel(sub); fila.current = fila.current.then(async () => { await supabase.rpc('sair_sala', { instancia: sessao }); }); };
  }, [sala, perfil.user_id, carregar, registrar]);
  async function ir(para: Zona) {
    if (!sala) return;
    const { error } = await registrar(sala, para, instancia.current);
    if (atual.current !== sala) return;
    if (error) { setErro('Não foi possível mudar de área. Tente novamente.'); return; }
    area.current = para; setZona(para); setErro(''); await carregar();
  }
  async function falar(texto: string, destinatario: string | null) {
    const { error } = await supabase.rpc('falar_cafe', { sala, mensagem: texto, para: destinatario });
    if (error) throw new Error(error.message);
    await carregar();
  }
  const presentes = useMemo(() => presentesAtivos(pessoas, agora), [pessoas, agora]);
  const baloes = useMemo(() => baloesAtivos(mensagens, presentes, agora), [mensagens, presentes, agora]);
  return { pessoas: presentes, mensagens, baloes, zona, ir, falar, erro };
}
