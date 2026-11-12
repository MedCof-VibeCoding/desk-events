import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Agente } from './supabase';
import { Mundo } from './mundo3d';
import { OfficeScene } from './OfficeScene';
import { Pessoas3D } from './pessoas3d';
import type { MensagemCafe, PessoaPresente, Zona } from './social';

interface Props { agentes: Agente[]; ocupados: Set<string>; selecionado: string | null; onEscolher: (id: string) => void; animar?: boolean; pessoas?: PessoaPresente[]; baloes?: Record<string, MensagemCafe>; userId?: string; zona?: Zona; onZona?: (zona: Zona) => void }

// Escritório em 3D isométrico. Arraste para mover a câmera e use a roda do mouse para aproximar.
export function Office3D(props: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const etiquetas = useRef(new Map<string, HTMLButtonElement>());
  const mundo = useRef<Mundo | null>(null);
  const pessoas3d = useRef<Pessoas3D | null>(null);
  const etiquetasPessoas = useRef(new Map<string, HTMLDivElement>());
  const dados = useRef(props); dados.current = props;
  const [sem3d, setSem3d] = useState(false);
  const controle = useRef<(acao: string) => void>(() => {});
  const [zona, setZona] = useState('geral');

  useEffect(() => {
    const el = caixa.current; if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setSem3d(true); return; }
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = 'tela3d';
    el.prepend(renderer.domElement);

    const m = new Mundo(); mundo.current = m;
    const pessoas = new Pessoas3D(m.scene); pessoas3d.current = pessoas;
    pessoas.sync(dados.current.pessoas ?? []);
    m.sync(dados.current.agentes, dados.current.ocupados, dados.current.selecionado);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const alvo = new THREE.Vector3(0, 0, 0.4), DIR = new THREE.Vector3(1, 1.05, 1).normalize().multiplyScalar(60);
    let zoom = 1;
    const enquadrar = () => {
      const w = el.clientWidth || 800, h = el.clientHeight || 500;
      renderer.setSize(w, h, false);
      const meia = 13.2 / zoom, prop = w / h, PROP_SALA = 1.52;
      // Mostra a sala inteira: limita pela largura em telas estreitas.
      const mx = prop >= PROP_SALA ? meia * prop / PROP_SALA : meia, my = mx / prop;
      camera.left = -mx; camera.right = mx; camera.top = my; camera.bottom = -my;
      camera.position.copy(alvo).add(DIR); camera.lookAt(alvo); camera.updateProjectionMatrix();
    };
    enquadrar();
    controle.current = acao => {
      if (acao === 'mais') zoom = Math.min(3, zoom * 1.2);
      else if (acao === 'menos') zoom = Math.max(0.7, zoom / 1.2);
      else { setZona(acao); zoom = acao === 'geral' ? 1 : 1.7; alvo.set(acao === 'reuniao' ? -6 : acao === 'cafe' ? 5 : 0, 0, acao === 'geral' ? 0.4 : -5.5); }
      enquadrar();
    };
    const ro = new ResizeObserver(enquadrar); ro.observe(el);

    // Arrastar move a câmera; clique sem arrastar escolhe o agente.
    let arrasto: { x: number; y: number; moveu: boolean } | null = null;
    const raio = new THREE.Raycaster(), ponto = new THREE.Vector2();
    const direita = new THREE.Vector3(), frente = new THREE.Vector3();
    const down = (e: PointerEvent) => { arrasto = { x: e.clientX, y: e.clientY, moveu: false }; renderer.domElement.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!arrasto) return;
      const dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y;
      if (!arrasto.moveu && Math.hypot(dx, dy) < 5) return;
      arrasto.moveu = true; arrasto.x = e.clientX; arrasto.y = e.clientY;
      const escala = (camera.right - camera.left) / (el.clientWidth || 1);
      direita.setFromMatrixColumn(camera.matrixWorld, 0); frente.set(-DIR.x, 0, -DIR.z).normalize();
      alvo.addScaledVector(direita, -dx * escala).addScaledVector(frente, dy * escala * 1.6);
      alvo.x = Math.max(-10, Math.min(10, alvo.x)); alvo.z = Math.max(-7, Math.min(8, alvo.z));
      enquadrar();
    };
    const up = (e: PointerEvent) => {
      const a = arrasto; arrasto = null;
      if (!a || a.moveu) return;
      const r = renderer.domElement.getBoundingClientRect();
      ponto.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raio.setFromCamera(ponto, camera);
      const id = m.alvo(raio); if (id) dados.current.onEscolher(id);
    };
    const roda = (e: WheelEvent) => { e.preventDefault(); zoom = Math.max(0.7, Math.min(3, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); enquadrar(); };
    const c = renderer.domElement;
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', () => { arrasto = null; }); c.addEventListener('wheel', roda, { passive: false });

    const parado = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const v = new THREE.Vector3();
    let quadro = 0, antes = performance.now();
    const laco = (agora: number) => {
      const dt = Math.min(0.05, (agora - antes) / 1000); antes = agora;
      m.passo(dt, parado || dados.current.animar === false);
      pessoas.passo(dt, parado || dados.current.animar === false);
      renderer.render(m.scene, camera);
      const w = el.clientWidth, h = el.clientHeight;
      for (const [id, b] of etiquetasPessoas.current) {
        if (!pessoas.etiqueta(id, v)) continue;
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
  useEffect(() => { pessoas3d.current?.sync(props.pessoas ?? []); }, [props.pessoas]);
  useEffect(() => { if (props.zona) controle.current(props.zona); }, [props.zona]);

  if (sem3d) return <OfficeScene {...props} />;
  return (
    <div className="palco3d" ref={caixa} aria-label="Escritório em 3D">
      <div className="etiquetas">
        {(props.pessoas ?? []).map(p => <div key={p.user_id} ref={el => { if (el) etiquetasPessoas.current.set(p.user_id, el); else etiquetasPessoas.current.delete(p.user_id); }} className={'etiqueta etiqueta-pessoa' + (p.user_id === props.userId ? ' eu' : '')}>
          {props.baloes?.[p.user_id] && <span className="balao-pensamento">{props.baloes[p.user_id].destinatario && <small>Conversa privada</small>}{props.baloes[p.user_id].texto}</span>}
          {p.nome}{p.user_id === props.userId ? ' · você' : ''}
        </div>)}
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
