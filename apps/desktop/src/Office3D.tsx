import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Agente } from './supabase';
import { Mundo } from './mundo3d';
import { OfficeScene } from './OfficeScene';
import { Pessoas3D } from './pessoas3d';
import type { MensagemCafe, PessoaPresente, Zona } from './social';
import type { Ambiente } from './ambientes';
import { MapaAmbiente } from './MapaAmbiente';
import { anelFachadas } from './fachadas3d';
import type { SalaVitrine } from './visitas';

interface Props { ambiente?: Ambiente; compacta?: boolean; principal?: boolean; vitrine?: SalaVitrine[]; onEntrar?: (id: string) => void; onPedir?: (id: string) => void; editandoAmbiente?: boolean; movelSelecionado?: string|null; onMovel?: (id:string|null)=>void; onMoverMovel?: (id:string,x:number,z:number)=>void; agentes: Agente[]; ocupados: Set<string>; selecionado: string | null; onEscolher: (id: string) => void; onEditarAparencia?: () => void; animar?: boolean; pessoas?: PessoaPresente[]; baloes?: Record<string, MensagemCafe>; userId?: string; zona?: Zona; onZona?: (zona: Zona) => void }

// Escritório em 3D isométrico. Arraste para mover a câmera e use a roda do mouse para aproximar.
export function Office3D(props: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const etiquetas = useRef(new Map<string, HTMLButtonElement>());
  const etiquetasSalas = useRef(new Map<string, HTMLButtonElement>());
  const abertaRef = useRef<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const mundo = useRef<Mundo | null>(null);
  const pessoas3d = useRef<Pessoas3D | null>(null);
  const etiquetasPessoas = useRef(new Map<string, HTMLElement>());
  const dados = useRef(props); dados.current = props;
  const [sem3d, setSem3d] = useState(false);
  const controle = useRef<(acao: string) => void>(() => {});
  const [zona, setZona] = useState('geral');
  const clicarSala = (id: string) => {
    const sala = dados.current.vitrine?.find(s => s.id === id);
    if (!sala) return;
    if (sala.papel) { setAberta(null); abertaRef.current = null; dados.current.onEntrar?.(id); return; }
    if (abertaRef.current === id && sala.pedido !== 'pendente') { dados.current.onPedir?.(id); return; }
    abertaRef.current = id; setAberta(id);
  };
  const clicarRef = useRef(clicarSala); clicarRef.current = clicarSala;
  const limitesCamera = () => {
    if (dados.current.compacta) return { minX: -5.5, maxX: 5.5, minZ: -4, maxZ: 4.2, meia: 8.4, zoomMin: 0.7, geral: [0, .2] as const, reuniao: [-4.5, -3.2] as const, cafe: [4.2, -3.2] as const };
    const extra = dados.current.principal ? (anelFachadas(dados.current.vitrine?.length ?? 0) + 1) * 4 : 0;
    return { minX: -10 - extra, maxX: 10 + extra, minZ: -7 - extra, maxZ: 8 + extra, meia: 14.6, zoomMin: dados.current.principal ? 0.35 : 0.7, geral: [0, .4] as const, reuniao: [-6, -5.5] as const, cafe: [5, -5.5] as const };
  };

  useEffect(() => {
    const el = caixa.current; if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setSem3d(true); return; }
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = 'tela3d';
    el.prepend(renderer.domElement);

    const m = new Mundo(!!dados.current.compacta); mundo.current = m;
    if(dados.current.ambiente) m.configurar(dados.current.ambiente, !!dados.current.compacta);
    if(dados.current.principal && !dados.current.editandoAmbiente) m.mostrarFachadas((dados.current.vitrine ?? []).map(s => ({ id: s.id, minha: s.papel === 'dono', pendentes: s.pedidos_pendentes })));
    const pessoas = new Pessoas3D(m.scene, (de,para)=>m.caminho(de,para), p=>m.posicaoLivre(p), (de,para)=>m.limitarPasso(de,para)); pessoas3d.current = pessoas;
    pessoas.sync(dados.current.pessoas ?? []);
    m.sync(dados.current.agentes, dados.current.ocupados, dados.current.selecionado);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const alvo = new THREE.Vector3(0, 0, 0.4), DIR = new THREE.Vector3(1, 1.05, 1).normalize().multiplyScalar(60);
    let zoom = 1;
    const enquadrar = () => {
      const w = el.clientWidth || 800, h = el.clientHeight || 500;
      renderer.setSize(w, h, false);
      const meia = limitesCamera().meia / zoom, prop = w / h, PROP_SALA = dados.current.compacta ? 1.28 : 1.52;
      // Mostra a sala inteira: limita pela largura em telas estreitas.
      const mx = prop >= PROP_SALA ? meia * prop / PROP_SALA : meia, my = mx / prop;
      camera.left = -mx; camera.right = mx; camera.top = my; camera.bottom = -my;
      camera.position.copy(alvo).add(DIR); camera.lookAt(alvo); camera.updateProjectionMatrix();
    };
    enquadrar();
    controle.current = acao => {
      const lim = limitesCamera();
      if (acao === 'mais') zoom = Math.min(3, zoom * 1.2);
      else if (acao === 'menos') zoom = Math.max(lim.zoomMin, zoom / 1.2);
      else if (acao === 'vitrine' || (acao === 'geral' && dados.current.principal && (dados.current.vitrine?.length ?? 0) > 0)) { setZona('geral'); const n = dados.current.vitrine?.length ?? 0; zoom = n > 26 ? 0.38 : n > 8 ? 0.48 : 0.55; alvo.set(0, 0, lim.geral[1]); }
      else { setZona(acao); zoom = acao === 'geral' ? 1 : 1.7; const foco = acao === 'reuniao' ? lim.reuniao : acao === 'cafe' ? lim.cafe : lim.geral; alvo.set(foco[0], 0, foco[1]); }
      enquadrar();
    };
    const ro = new ResizeObserver(enquadrar); ro.observe(el);

    // Arrastar move a câmera; clique sem arrastar escolhe o agente ou a própria aparência.
    let arrasto: { x: number; y: number; moveu: boolean } | null = null;
    const raio = new THREE.Raycaster(), ponto = new THREE.Vector2();
    const direita = new THREE.Vector3(), frente = new THREE.Vector3();
    let movendo: {id:string; x:number; z:number; inicio:THREE.Vector3} | null = null;
    const plano = new THREE.Plane(new THREE.Vector3(0,1,0),0);
    const apontar = (e:PointerEvent) => { const r=renderer.domElement.getBoundingClientRect(); ponto.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1); raio.setFromCamera(ponto,camera); };
    const down = (e: PointerEvent) => {
      if(e.button!==0) return;
      arrasto = { x: e.clientX, y: e.clientY, moveu: false }; renderer.domElement.setPointerCapture(e.pointerId);
      if(dados.current.editandoAmbiente) { apontar(e); const id=m.alvoMovel(raio); dados.current.onMovel?.(id); const item=dados.current.ambiente?.itens.find(i=>i.id===id); const inicio=raio.ray.intersectPlane(plano,new THREE.Vector3()); if(item&&inicio)movendo={id:item.id,x:item.x,z:item.z,inicio}; }
    };
    const move = (e: PointerEvent) => {
      if (!arrasto) return;
      const dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y;
      if (!arrasto.moveu && Math.hypot(dx, dy) < 5) return;
      arrasto.moveu = true; arrasto.x = e.clientX; arrasto.y = e.clientY;
      if(movendo) {apontar(e);const fim=raio.ray.intersectPlane(plano,new THREE.Vector3());if(fim)m.preverMovel(movendo.id,Math.round((movendo.x+fim.x-movendo.inicio.x)*4)/4,Math.round((movendo.z+fim.z-movendo.inicio.z)*4)/4);return;}
      const escala = (camera.right - camera.left) / (el.clientWidth || 1);
      direita.setFromMatrixColumn(camera.matrixWorld, 0); frente.set(-DIR.x, 0, -DIR.z).normalize();
      alvo.addScaledVector(direita, -dx * escala).addScaledVector(frente, dy * escala * 1.6);
      const lim = limitesCamera();
      alvo.x = Math.max(lim.minX, Math.min(lim.maxX, alvo.x)); alvo.z = Math.max(lim.minZ, Math.min(lim.maxZ, alvo.z));
      enquadrar();
    };
    const up = (e: PointerEvent) => {
      const a = arrasto; arrasto = null;
      if(movendo) { const item=movendo;movendo=null;m.preverMovel(item.id,item.x,item.z);if(a?.moveu){apontar(e);const fim=raio.ray.intersectPlane(plano,new THREE.Vector3());if(fim)dados.current.onMoverMovel?.(item.id,Math.round((item.x+fim.x-item.inicio.x)*4)/4,Math.round((item.z+fim.z-item.inicio.z)*4)/4);}return; }
      if(dados.current.editandoAmbiente) return;
      if (!a || a.moveu) return;
      const r = renderer.domElement.getBoundingClientRect();
      ponto.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raio.setFromCamera(ponto, camera);
      const fachada = m.alvoFachada(raio), agente = m.alvo(raio), pessoa = pessoas.alvo(raio);
      if (fachada && (!agente || fachada.distancia <= agente.distancia) && (!pessoa || fachada.distancia <= pessoa.distancia)) { clicarRef.current(fachada.id); return; }
      if (pessoa && pessoa.id === dados.current.userId && (!agente || pessoa.distancia <= agente.distancia)) { dados.current.onEditarAparencia?.(); return; }
      if (agente) dados.current.onEscolher(agente.id);
    };
    const roda = (e: WheelEvent) => { e.preventDefault(); zoom = Math.max(limitesCamera().zoomMin, Math.min(3, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); enquadrar(); };
    const c = renderer.domElement;
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', () => { arrasto = null; if(movendo)m.preverMovel(movendo.id,movendo.x,movendo.z);movendo=null; }); c.addEventListener('wheel', roda, { passive: false });

    const parado = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const v = new THREE.Vector3();
    let quadro = 0, antes = performance.now();
    const laco = (agora: number) => {
      const dt = Math.min(0.05, (agora - antes) / 1000); antes = agora;
      m.passo(dt, parado || dados.current.animar === false || !!dados.current.editandoAmbiente);
      pessoas.passo(dt, parado || dados.current.animar === false || !!dados.current.editandoAmbiente);
      renderer.render(m.scene, camera);
      const w = el.clientWidth, h = el.clientHeight;
      for (const [id, b] of etiquetasPessoas.current) {
        if (!pessoas.etiqueta(id, v)) continue;
        v.project(camera);
        b.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      }
      for (const [id, b] of etiquetasSalas.current) {
        if (!m.etiquetaFachada(id, v)) continue;
        v.project(camera);
        b.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      }
      for (const [id, b] of etiquetas.current) {
        if (!m.etiqueta(id, v)) continue;
        v.project(camera);
        b.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
        b.classList.toggle('trabalhando', m.ocupadoNaMesa(id));
      }
      quadro = requestAnimationFrame(laco);
    };
    quadro = requestAnimationFrame(laco);

    return () => {
      cancelAnimationFrame(quadro); ro.disconnect();
      pessoas.destruir(); pessoas3d.current = null; m.destruir(); mundo.current = null; controle.current = () => {};
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  useEffect(() => { mundo.current?.sync(props.agentes, props.ocupados, props.selecionado); }, [props.agentes, props.ocupados, props.selecionado]);
  useEffect(() => { if(props.ambiente) {mundo.current?.configurar(props.ambiente, !!props.compacta);pessoas3d.current?.recalcular();} }, [props.ambiente, props.compacta]);
  useEffect(() => {
    const lista = props.principal && !props.editandoAmbiente ? (props.vitrine ?? []) : [];
    mundo.current?.mostrarFachadas(lista.map(s => ({ id: s.id, minha: s.papel === 'dono', pendentes: s.pedidos_pendentes })));
  }, [props.vitrine, props.principal, props.editandoAmbiente]);
  const enquadrouVitrine = useRef(false);
  useEffect(() => {
    if (!enquadrouVitrine.current && props.principal && (props.vitrine?.length ?? 0) > 0) { enquadrouVitrine.current = true; controle.current('vitrine'); }
  }, [props.principal, props.vitrine]);
  useEffect(() => {mundo.current?.selecionarMovel(props.editandoAmbiente ? props.movelSelecionado ?? null : null);},[props.editandoAmbiente,props.movelSelecionado,props.ambiente]);
  useEffect(() => { pessoas3d.current?.sync(props.pessoas ?? []); }, [props.pessoas]);
  useEffect(() => { if (props.zona) controle.current(props.zona); }, [props.zona]);

  if (sem3d) return <>{props.ambiente ? <><MapaAmbiente ambiente={props.ambiente} selecionado={props.movelSelecionado} onSelecionar={props.editandoAmbiente ? props.onMovel : undefined}/><div className="linha-acoes"><button className="btn pequeno" onClick={()=>props.onEditarAparencia?.()}>Alterar minha aparência</button>{props.agentes.map(a=><button key={a.id} className="btn pequeno" onClick={()=>props.onEscolher(a.id)}>{a.nome}</button>)}</div></> : <OfficeScene {...props} />}{props.principal && !props.editandoAmbiente && <div className="linha-acoes">{(props.vitrine ?? []).map(s => <button key={s.id} className="btn pequeno" onClick={() => clicarSala(s.id)}>{s.dono_nome} · {s.papel === 'dono' ? 'Sua sala' : s.papel ? 'Entrar' : s.pedido === 'pendente' ? 'Aguardando' : aberta === s.id ? 'Confirmar visita' : 'Pedir visita'}</button>)}</div>}</>;
  return (
    <div className="palco3d" ref={caixa} aria-label="Escritório em 3D">
      <div className="etiquetas">
        {(props.pessoas ?? []).map(p => {
          const eu = p.user_id === props.userId;
          const conteudo = <>
            {props.baloes?.[p.user_id] && <span className="balao-pensamento">{props.baloes[p.user_id].destinatario && <small>Conversa privada</small>}{props.baloes[p.user_id].texto}</span>}
            {p.nome}{eu ? ' · você' : ''}
          </>;
          const guardar = (el: HTMLElement | null) => { if (el) etiquetasPessoas.current.set(p.user_id, el); else etiquetasPessoas.current.delete(p.user_id); };
          return eu
            ? <button type="button" key={p.user_id} ref={guardar} className="etiqueta etiqueta-pessoa eu" onClick={() => props.onEditarAparencia?.()} aria-label={`Alterar a aparência de ${p.nome}`}>{conteudo}</button>
            : <div key={p.user_id} ref={guardar} className="etiqueta etiqueta-pessoa">{conteudo}</div>;
        })}
        {(props.principal && !props.editandoAmbiente ? props.vitrine ?? [] : []).map(s => (
          <button key={s.id} ref={el => { if (el) etiquetasSalas.current.set(s.id, el); else etiquetasSalas.current.delete(s.id); }}
            className={'etiqueta etiqueta-sala' + (aberta === s.id ? ' aberta' : '') + (s.papel ? ' liberada' : '')}
            onClick={() => clicarSala(s.id)}
            aria-label={s.papel ? `Entrar na sala de ${s.dono_nome}` : `Sala de ${s.dono_nome}`}>
            <strong>{s.dono_nome}</strong>
            <small>{s.papel === 'dono' ? 'Sua sala' : s.papel ? 'Entrar' : s.pedido === 'pendente' ? 'Aguardando o dono' : aberta === s.id ? 'Toque de novo para pedir' : 'Pedir visita'}</small>
            {s.pedidos_pendentes > 0 && <em>{s.pedidos_pendentes}</em>}
          </button>
        ))}
        {props.agentes.map(a => (
          <button key={a.id} ref={el => { if (el) etiquetas.current.set(a.id, el); else etiquetas.current.delete(a.id); }}
            className={'etiqueta' + (props.selecionado === a.id ? ' escolhida' : '')} style={{ borderLeftColor: a.aparencia.cor }}
            onClick={() => props.onEscolher(a.id)} aria-pressed={props.selecionado === a.id}>
            {a.nome}<span className="luz" aria-hidden="true" />
            <span className="so-leitor">{!a.ativo ? ', desativado' : props.ocupados.has(a.id) ? ', trabalhando' : ', disponível'}</span>
          </button>
        ))}
      </div>
      <div className="zonas-escritorio" role="group" aria-label="Áreas do escritório">{[{ id: 'geral', nome: 'Visão geral' }, { id: 'reuniao', nome: 'Sala de reunião' }, { id: 'cafe', nome: 'Café' }].map(z => <button key={z.id} aria-pressed={zona === z.id} onClick={() => props.onZona ? props.onZona(z.id as Zona) : controle.current(z.id)}>{z.nome}</button>)}</div>
      <div className="controles-camera" role="group" aria-label="Controles da câmera"><button aria-label="Afastar câmera" onClick={() => controle.current('menos')}>−</button><button onClick={() => controle.current('geral')}>Centralizar</button><button aria-label="Aproximar câmera" onClick={() => controle.current('mais')}>+</button></div>
      <p className="dica3d">Arraste para explorar · role para aproximar</p>
    </div>
  );
}
