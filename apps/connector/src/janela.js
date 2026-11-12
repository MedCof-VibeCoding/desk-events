const $ = id => document.getElementById(id);
const api = window.conector;

function mostrar(e) {
  $('versao').textContent = `versão ${e.versao}`;
  $('tela-login').hidden = e.logado; $('tela-principal').hidden = !e.logado;
  if (!e.logado) { $('erro-login').hidden = !e.erro; $('erro-login').textContent = e.erro; return; }
  $('cartao-estado').className = 'estado' + (e.ligado ? ' ligado' : '');
  $('titulo-estado').textContent = e.ligado ? 'Conectado' : e.pausado ? 'Pausado' : 'Desconectado';
  $('detalhe-estado').textContent = e.ligado ? `${e.email} · ${e.feitos} pedido${e.feitos === 1 ? '' : 's'} atendido${e.feitos === 1 ? '' : 's'}` : e.pausado ? 'Os agentes não usam este computador até você retomar.' : e.email;
  $('erro').hidden = !e.erro; $('erro').textContent = e.erro;
  $('pasta').textContent = e.pasta;
  $('comandos').checked = e.comandos; $('iniciar').checked = e.iniciarComWindows;
  $('pausar').textContent = e.pausado ? 'Retomar' : 'Pausar';
  const log = $('log'); log.replaceChildren();
  if (!e.log.length) { const li = document.createElement('li'); li.textContent = 'Nada ainda. Peça a um agente para ler ou criar um arquivo.'; log.append(li); }
  for (const linha of e.log) { const li = document.createElement('li'); li.textContent = linha; li.title = linha; log.append(li); }
}

$('form-login').addEventListener('submit', async ev => {
  ev.preventDefault();
  $('entrar').disabled = true; $('entrar').textContent = 'Conectando…'; $('erro-login').hidden = true;
  const r = await api.entrar($('email').value, $('senha').value);
  $('entrar').disabled = false; $('entrar').textContent = 'Entrar e conectar';
  if (r?.erro) { $('erro-login').textContent = r.erro; $('erro-login').hidden = false; }
  else { $('senha').value = ''; mostrar(await api.estado()); }
});
$('trocar').addEventListener('click', async () => mostrar(await api.escolherPasta()));
$('abrir-pasta').addEventListener('click', () => api.abrirPasta());
$('site').addEventListener('click', () => api.abrirSite());
$('comandos').addEventListener('change', async ev => mostrar(await api.comandos(ev.target.checked)));
$('iniciar').addEventListener('change', async ev => mostrar(await api.iniciarComWindows(ev.target.checked)));
$('pausar').addEventListener('click', async () => { const e = await api.estado(); mostrar(await api.pausar(!e.pausado)); });
$('sair').addEventListener('click', async () => mostrar(await api.sair()));
api.aoMudar(mostrar);
api.estado().then(mostrar);
