import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Agente } from './supabase';
import { Mundo } from './mundo3d';
import { OfficeScene } from './OfficeScene';

interface Props { agentes: Agente[]; ocupados: Set<string>; selecionado: string | null; onEscolher: (id: string) => void }

// Escritório em 3D isométrico. Arraste para mover a câmera e use a roda do mouse para aproximar.
export function Office3D(props: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const etiquetas = useRef(new Map<string, HTMLButtonElement>());
  const mundo = useRef<Mundo | null>(null);
  const dados = useRef(props); dados.current = props;
  const [sem3d, setSem3d] = useState(false);

  useEffect(() => {
    const el = caixa.current; if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setSem3d(true); return; }
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = 'tela3d';
    el.prepend(renderer.domElement);

    const m = new Mundo(); mundo.current = m;
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
      m.passo(dt, parado);
      renderer.render(m.scene, camera);
      const w = el.clientWidth, h = el.clientHeight;
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
      m.destruir(); mundo.current = null;
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  useEffect(() => { mundo.current?.sync(props.agentes, props.ocupados, props.selecionado); }, [props.agentes, props.ocupados, props.selecionado]);

  if (sem3d) return <OfficeScene {...props} />;
  return (
    <div className="palco3d" ref={caixa} aria-label="Escritório em 3D">
      <div className="etiquetas">
        {props.agentes.map(a => (
          <button key={a.id} ref={el => { if (el) etiquetas.current.set(a.id, el); else etiquetas.current.delete(a.id); }}
            className={'etiqueta' + (props.selecionado === a.id ? ' escolhida' : '')} style={{ borderLeftColor: a.aparencia.cor }}
            onClick={() => props.onEscolher(a.id)} aria-pressed={props.selecionado === a.id}>
            {a.nome}<span className="luz" aria-hidden="true" />
            <span className="so-leitor">{props.ocupados.has(a.id) ? ', trabalhando' : ', livre'}</span>
          </button>
        ))}
      </div>
      <p className="dica3d">Arraste para mover a câmera. Use a roda do mouse para aproximar.</p>
    </div>
  );
}
