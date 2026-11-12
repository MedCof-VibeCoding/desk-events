// Núcleo do Conector: avisa o escritório que está ligado e atende os pedidos dos agentes.
// Não depende do Electron, para poder ser testado sozinho.
import os from 'node:os';

export const PULSO_MS = 20_000;
export const FILA_MS = 2_000;

export class Conector {
  /**
   * @param {object} o
   * @param {import('@supabase/supabase-js').SupabaseClient} o.supabase cliente já logado
   * @param {(raiz: string, ferramenta: string, args: object, opcoes: object) => Promise<string>} o.executar
   * @param {(evento: object) => void} [o.aviso] recebe cada acontecimento, para a janela e o log
   */
  constructor({ supabase, executar, aviso = () => {} }) {
    this.supabase = supabase; this.executar = executar; this.aviso = aviso;
    this.raiz = null; this.comandos = false; this.userId = null; this.sala = null;
    this.ligado = false; this.ultimoErro = ''; this.timers = []; this.emCurso = new Set(); this.feitos = 0;
  }

  async ligar({ raiz, comandos }) {
    this.desligarTimers();
    this.raiz = raiz; this.comandos = comandos === true;
    const { data } = await this.supabase.auth.getUser();
    if (!data?.user) throw new Error('Entre com a sua conta do DeskCof.');
    this.userId = data.user.id;
    const { data: sala, error } = await this.supabase.rpc('minha_sala');
    if (error || typeof sala !== 'string') throw new Error('Sua conta ainda não tem uma sala. Entre uma vez no site e complete o seu perfil.');
    this.sala = sala;
    await this.pulso();
    this.timers.push(setInterval(() => { void this.pulso(); }, PULSO_MS));
    this.timers.push(setInterval(() => { void this.atender(); }, FILA_MS));
    this.ligado = true;
    this.aviso({ tipo: 'ligado', raiz, comandos: this.comandos });
    void this.atender();
  }

  // Registra no escritório que este computador está conectado, com a pasta e se aceita comandos.
  async pulso() {
    const nome = `conector:${os.hostname()}${this.comandos ? ' (comandos)' : ''}`;
    const { error } = await this.supabase.from('pontes').upsert({
      user_id: this.userId, escritorio_id: this.sala, nome, pasta: this.raiz, visto_em: new Date().toISOString()
    });
    if (error) { this.ultimoErro = 'Sem contato com o escritório: ' + error.message; this.aviso({ tipo: 'erro', mensagem: this.ultimoErro }); }
    else if (this.ultimoErro) { this.ultimoErro = ''; this.aviso({ tipo: 'reconectado' }); }
  }

  async atender() {
    if (!this.userId || !this.raiz) return;
    const { data: fila } = await this.supabase.from('tarefas_locais').select('id, ferramenta, args')
      .eq('user_id', this.userId).eq('estado', 'pendente').order('criado_em').limit(10);
    for (const t of fila ?? []) {
      if (this.emCurso.has(t.id)) continue;
      this.emCurso.add(t.id);
      try {
        // Só quem conseguir mudar de "pendente" para "executando" trabalha: evita rodar duas vezes.
        const { data: peguei } = await this.supabase.from('tarefas_locais').update({ estado: 'executando' }).eq('id', t.id).eq('estado', 'pendente').select('id');
        if (!peguei?.length) continue;
        const alvo = t.args?.caminho ?? t.args?.pasta ?? t.args?.comando ?? '';
        try {
          const resultado = await this.executar(this.raiz, t.ferramenta, t.args ?? {}, { comandos: this.comandos });
          await this.supabase.from('tarefas_locais').update({ estado: 'feito', resultado }).eq('id', t.id);
          this.feitos++;
          this.aviso({ tipo: 'feito', ferramenta: t.ferramenta, alvo });
        } catch (e) {
          await this.supabase.from('tarefas_locais').update({ estado: 'erro', resultado: String(e?.message || e).slice(0, 500) }).eq('id', t.id);
          this.aviso({ tipo: 'recusado', ferramenta: t.ferramenta, alvo, mensagem: String(e?.message || e) });
        }
      } finally { this.emCurso.delete(t.id); }
    }
  }

  desligarTimers() { for (const t of this.timers) clearInterval(t); this.timers = []; }

  async desligar() {
    this.desligarTimers();
    if (this.ligado && this.userId) await this.supabase.from('pontes').delete().eq('user_id', this.userId).like('nome', 'conector:%');
    this.ligado = false;
    this.aviso({ tipo: 'desligado' });
  }
}
