import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const THREE = createRequire(import.meta.url)('three');

const arquivo = resolve('node_modules/.cache/workspace-tests.cjs');
await mkdir(resolve('node_modules/.cache'), { recursive: true });
await build({ stdin: { contents: `export * from './apps/desktop/src/colaboracao'; export * from './apps/desktop/src/preferencias'; export * from './apps/desktop/src/personagens'; export * from './apps/desktop/src/mundo3d'; export * from './apps/desktop/src/avatar3d'; export { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; export * from './apps/desktop/src/AgentForm'; export * from './apps/desktop/src/Workspace';`, resolveDir: process.cwd(), loader: 'tsx' }, outfile: arquivo, bundle: true, platform: 'node', format: 'cjs', external: ['three', 'react', 'react-dom', '@supabase/supabase-js'], loader: { '.png': 'dataurl', '.css': 'empty' }, define: { 'import.meta.env': '{}' }, jsx: 'automatic', logLevel: 'silent' });
const { linkReuniao, erroColaboracao, lerPreferencias, PERSONAGENS, personagemDe, avatarDe, normalizarAparencia, AvatarAnimado, ModelosAvatar, GLTFLoader, Mundo, AgentForm, Workspace } = createRequire(import.meta.url)(arquivo);
GLTFLoader.prototype.loadAsync = async () => { throw Error('Offline test'); };
after(async () => { await rm(arquivo, { force: true }); });
const aparencia = { corpo: 'monitor', cor: '#8b6cf0', acessorio: null };
const agente = { id: 'a1', escritorio_id: 'e1', nome: 'Produção', cargo: 'Operação de eventos', instrucoes: '', aparencia, provedor: 'openai', modelo: 'auto', autonomia: 'supervisionado', ativo: true };

test('links de reuniões rejeitam protocolos executáveis e credenciais', () => {
  for (const valor of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'http://example.com', 'https://user:senha@example.com', 'não é um link']) assert.equal(linkReuniao(valor), null);
  assert.equal(linkReuniao(' https://meet.google.com/abc-defg-hij '), 'https://meet.google.com/abc-defg-hij');
});
test('ausência da migração é informada como recurso indisponível', () => {
  assert.match(erroColaboracao({ code: 'PGRST205', message: 'table not found' }), /atualização do banco/);
  assert.equal(erroColaboracao({ code: '42501', message: 'Sem permissão' }), 'Sem permissão');
});
test('preferências sobrevivem a armazenamento corrompido ou bloqueado', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const simular = valor => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => valor } });
  try {
    simular('{ inválido'); assert.deepEqual(lerPreferencias('teste'), { tema: 'sistema', animar: true, vista: 'mapa' });
    simular(JSON.stringify({ tema: 'inexistente', animar: 'false', vista: 'grade' })); assert.deepEqual(lerPreferencias('teste'), { tema: 'sistema', animar: true, vista: 'grade' });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Bloqueado'); } });
    assert.equal(lerPreferencias('teste').tema, 'sistema');
  } finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage; }
});
test('agentes antigos e personagens desconhecidos mantêm aparência válida', () => {
  assert.equal(personagemDe(aparencia).id, 'atlas');
  assert.equal(personagemDe({ ...aparencia, personagem: 'removido' }).id, 'atlas');
  for (const p of PERSONAGENS) assert.equal(personagemDe({ ...aparencia, personagem: p.id }).id, p.id);
});
test('proporções dos personagens correspondem aos PNGs originais', async () => {
  for (const p of PERSONAGENS) {
    const png = await readFile(`apps/desktop/public/avatars/${p.id}-m-casual.png`);
    assert.equal(png.readUInt32BE(16), 320); assert.equal(png.readUInt32BE(20), 400);
    assert.equal(png[25], 6, 'PNG deve preservar canal alfa');
  }
});
test('troca de personagem atualiza o sprite e reutiliza texturas', () => {
  const original = THREE.TextureLoader.prototype.load;
  let cargas = 0, descartes = 0;
  THREE.TextureLoader.prototype.load = function () { cargas++; const t = new THREE.Texture(); t.addEventListener('dispose', () => descartes++); return t; };
  let m;
  try {
    m = new Mundo(); m.sync([agente], new Set(), 'a1');
    m.sync([{ ...agente, aparencia: { ...aparencia, personagem: 'pixel' } }], new Set(['a1']), 'a1');
    m.sync([{ ...agente, ativo: false, aparencia: { ...aparencia, personagem: 'pixel', cor: '#ff0000' } }], new Set(), null);
    assert.equal(cargas, 2);
    const sprites = []; m.scene.traverse(o => { if (o.isSprite) sprites.push(o); });
    assert.equal(sprites.length, 1); assert.equal(sprites[0].material.opacity, .45);
    m.passo(.05, true); const antes = m.posicao('a1'); m.passo(20, true); assert.deepEqual(m.posicao('a1'), antes);
    m.sync([], new Set(), null); assert.equal(m.posicao('a1'), null);
  } finally { m?.destruir(); THREE.TextureLoader.prototype.load = original; }
  assert.equal(descartes, 2);
});
test('mobiliário permanece no escritório ao adicionar e remover agentes', () => {
  const original = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = () => new THREE.Texture();
  const m = new Mundo();
  try {
    const estacoes = () => m.scene.children.filter(o => o.name.startsWith('estacao-'));
    const iniciais = estacoes(); assert.equal(iniciais.length, 12);
    m.sync([agente], new Set(), null); m.sync([], new Set(), null);
    assert.deepEqual(estacoes(), iniciais);
    assert.ok(m.scene.getObjectByName('area-reuniao')); assert.ok(m.scene.getObjectByName('area-cafe'));
    const bounds = new THREE.Box3().setFromObject(m.scene.getObjectByName('ambiente'));
    assert.ok(bounds.min.x >= -11 && bounds.max.x <= 11);
    assert.ok(bounds.min.z >= -8 && bounds.max.z <= 8.5);
  } finally { m.destruir(); THREE.TextureLoader.prototype.load = original; }
});
test('edição abre com a variação salva selecionada e sem seletor de modelo', () => {
  const html = renderToStaticMarkup(React.createElement(AgentForm, { escritorioId: 'e1', coresUsadas: [], agente: { ...agente, aparencia: { ...aparencia, personagem: 'foco' } }, onFechar() {}, onSalvo() {} }));
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 3);
  assert.match(html, /aria-pressed="true"[^]*?<span>Foco<\/span>/);
  assert.doesNotMatch(html, /Modelo de IA|Gemini|Claude/);
});
test('leitor vê navegação mas não recebe botão de criação de agente', () => {
  const props = { escritorio: { id: 'e1', nome: 'Eventos', pausado: false }, papel: 'leitor', userId: 'u1', email: 'teste@example.com', agentes: [agente], ocupados: new Set(), selecionado: null, pendentes: 0, mesa: false, ponte: null, painel: null, modal: null, erro: '', onAgente() {}, onCriar() {}, onEditar() {}, onMesa() {}, onFecharPainel() {}, onSair() {} };
  const leitura = renderToStaticMarkup(React.createElement(Workspace, props));
  assert.match(leitura, /Chat da equipe/); assert.match(leitura, /Reuniões/); assert.doesNotMatch(leitura, /Novo agente/);
  const editor = renderToStaticMarkup(React.createElement(Workspace, { ...props, papel: 'editor' })); assert.match(editor, /Novo agente/);
});

test('36 combinações têm GLBs animados e prévias correspondentes', async () => {
  const ids = new Set();
  for (const p of PERSONAGENS) for (const versao of ['m', 'f']) for (const look of ['casual', 'escritorio', 'evento']) {
    const a = avatarDe({ ...aparencia, personagem: p.id, versao, look }); ids.add(a.id);
    assert.deepEqual(normalizarAparencia({ ...aparencia, personagem: p.id, versao, look }), { ...aparencia, personagem: p.id, versao, look });
    const bytes = await readFile(`apps/desktop/public${a.modelo}`);
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
    assert.equal(gltf.skins.length, 1);
    for (const name of ['Idle', 'Walk', 'Run', 'Type', 'Sit', 'Talk', 'Wave']) assert.ok(gltf.animations.some(a => a.name === name));
    assert.ok((await readFile(`apps/desktop/public${a.imagem}`)).length > 1000);
  }
  assert.equal(ids.size, 36);
  assert.equal(avatarDe({ ...aparencia, personagem: 'antigo', versao: 'invalid', look: 'invalid' }).id, 'atlas-m-casual');
});

test('modelos carregam com esqueletos e animações independentes', async () => {
  const bytes = await readFile('apps/desktop/public/avatars/atlas-m-casual.glb');
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const a = new AvatarAnimado(gltf), b = new AvatarAnimado(gltf);
  try {
    let meshA, meshB;
    a.root.traverse(o => { if (o.isSkinnedMesh) meshA = o; });
    b.root.traverse(o => { if (o.isSkinnedMesh) meshB = o; });
    assert.notEqual(meshA.skeleton, meshB.skeleton); assert.notEqual(meshA.material, meshB.material);
    const before = meshB.skeleton.bones.map(o => o.quaternion.toArray());
    a.passo(.4, 'Walk');
    assert.deepEqual(meshB.skeleton.bones.map(o => o.quaternion.toArray()), before);
    assert.notDeepEqual(meshA.skeleton.bones.map(o => o.quaternion.toArray()), before);
    a.opacidade(.45); assert.equal(meshA.material.opacity, .45); assert.equal(meshB.material.opacity, 1);
    a.passo(0, 'Idle', true); const paused = meshA.skeleton.bones.map(o => o.quaternion.toArray());
    a.passo(10, 'Walk', true); assert.deepEqual(meshA.skeleton.bones.map(o => o.quaternion.toArray()), paused);
  } finally { a.destruir(); b.destruir(); }
});
