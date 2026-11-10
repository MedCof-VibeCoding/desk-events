import { useEffect, useRef } from 'react';
import type { Agente } from './supabase';
import { RobotPixels, corEscura } from './Robot';

// Cena do escritório em estilo de jogo: os agentes andam pela sala quando estão livres
// e voltam para a mesa quando recebem uma ficha.
const W = 320, H = 196, COLS = 4, VEL = 30;
const MESAS_X = [62, 126, 190, 254];
const mesa = (i: number) => ({ x: MESAS_X[i % COLS], y: 62 + (Math.floor(i / COLS) % 3) * 42 });
const casa = (i: number) => { const m = mesa(i); return { x: m.x - 22, y: m.y + 14 }; };
const FAIXAS = [94, 136, 178];
const PONTOS = [{ x: 24, y: 54 }, { x: 300, y: 54 }, { x: 300, y: 180 }, { x: 22, y: 180 }, { x: 158, y: 52 }, { x: 94, y: 52 }];

type P = { x: number; y: number };
interface Vida { x: number; y: number; rota: P[]; espera: number; ocupado: boolean; festa: number }

const faixaPerto = (y: number) => FAIXAS.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
const colunaLivre = (x: number) => MESAS_X.every(c => Math.abs(x - c) > 21);
function colunaPerto(x: number) {
  if (colunaLivre(x)) return x;
  for (let d = 1; d < 40; d++) { if (colunaLivre(x - d)) return x - d; if (colunaLivre(x + d)) return x + d; }
  return x;
}
// Caminho em linhas retas pelos corredores, sem atravessar as mesas.
function tracar(de: P, para: P): P[] {
  const fa = faixaPerto(de.y), fb = faixaPerto(para.y);
  const sobe = colunaLivre(de.x) ? de.x : colunaPerto(de.x);
  const desce = colunaLivre(para.x) ? para.x : colunaPerto(para.x);
  const pts: P[] = [{ x: sobe, y: de.y }, { x: sobe, y: fa }, { x: desce, y: fa }, { x: desce, y: fb }, { x: para.x, y: fb }, para];
  return pts.filter((p, i) => i === 0 ? (p.x !== de.x || p.y !== de.y) : (p.x !== pts[i - 1].x || p.y !== pts[i - 1].y));
}
const sorteio = (a: number, b: number) => a + Math.random() * (b - a);

export function OfficeScene({ agentes, ocupados, selecionado, onEscolher }: {
  agentes: Agente[]; ocupados: Set<string>; selecionado: string | null; onEscolher: (id: string) => void;
}) {
  const camada = useRef<SVGGElement>(null);
  const grupos = useRef(new Map<string, SVGGElement>());
  const telas = useRef(new Map<string, SVGRectElement>());
  const vidas = useRef(new Map<string, Vida>());
  const dados = useRef({ agentes, ocupados });
  dados.current = { agentes, ocupados };

  useEffect(() => {
    const parado = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let quadro = 0, antes = performance.now(), n = 0;
    const passo = (agora: number) => {
      const dt = Math.min(0.05, (agora - antes) / 1000); antes = agora; n++;
      const { agentes: lista, ocupados: occ } = dados.current;
      lista.forEach((a, i) => {
        const lar = casa(i);
        let v = vidas.current.get(a.id);
        if (!v) { v = { x: lar.x, y: lar.y, rota: [], espera: sorteio(1, 5), ocupado: false, festa: 0 }; vidas.current.set(a.id, v); }
        const ocupado = occ.has(a.id) && a.ativo;
        if (ocupado && !v.ocupado) v.rota = tracar(v, lar);
        if (!ocupado && v.ocupado) { v.festa = 1.4; v.espera = 2.5; }
        v.ocupado = ocupado;
        if (parado) { v.x = lar.x; v.y = lar.y; v.rota = []; }
        else if (v.rota.length) {
          const alvo = v.rota[0], dx = alvo.x - v.x, dy = alvo.y - v.y, d = Math.hypot(dx, dy), anda = VEL * dt;
          if (d <= anda) { v.x = alvo.x; v.y = alvo.y; v.rota.shift(); } else { v.x += (dx / d) * anda; v.y += (dy / d) * anda; }
        } else if (!ocupado && a.ativo) {
          v.espera -= dt;
          if (v.espera <= 0) {
            const r = Math.random();
            const destino = r < 0.3 ? lar : r < 0.7 ? PONTOS[Math.floor(Math.random() * PONTOS.length)] : { x: Math.round(sorteio(20, 300)), y: FAIXAS[Math.floor(Math.random() * FAIXAS.length)] };
            v.rota = tracar(v, destino); v.espera = sorteio(2, 7);
          }
        }
        if (v.festa > 0) v.festa -= dt;
        const g = grupos.current.get(a.id);
        if (g) {
          g.setAttribute('transform', `translate(${Math.round(v.x) - 6},${Math.round(v.y) - 16})`);
          const naMesa = !v.rota.length && ocupado;
          g.setAttribute('class', 'ag' + (v.rota.length ? ' andando' : '') + (naMesa ? ' digitando' : '') + (v.festa > 0 && !v.rota.length ? ' feliz' : '') + (a.ativo ? '' : ' desligado'));
          g.dataset.y = String(v.y);
          telas.current.get(a.id)?.setAttribute('class', naMesa ? 'tela ligada' : 'tela');
        }
      });
      // Quem está mais abaixo na sala aparece na frente.
      if (n % 8 === 0 && camada.current) {
        [...camada.current.children].sort((p, q) => Number((p as SVGGElement).dataset.y) - Number((q as SVGGElement).dataset.y)).forEach(el => camada.current!.appendChild(el));
      }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, []);

  const piso: JSX.Element[] = [];
  for (let y = 36; y < H; y += 16) for (let x = 0; x < W; x += 16) if (((x + y) / 16) % 2 === 0) piso.push(<rect key={`${x}-${y}`} x={x} y={y} width={16} height={16} className="c-piso2" />);

  return (
    <svg className="cena" viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" role="group" aria-label="Escritório com os agentes">
      <rect width={W} height={H} className="c-piso" />{piso}
      <rect width={W} height={34} className="c-parede" /><rect y={30} width={W} height={4} className="c-rodape" />
      {/* janelas, quadro e relógio */}
      {[14, 262].map(x => <g key={x}><rect x={x} y={6} width={44} height={20} className="c-moldura" /><rect x={x + 2} y={8} width={40} height={16} className="c-ceu" /><rect x={x + 21} y={8} width={2} height={16} className="c-moldura" /></g>)}
      <rect x={110} y={5} width={100} height={22} className="c-moldura" /><rect x={112} y={7} width={96} height={18} className="c-quadro" />
      {['#1FA39A', '#7C5CE6', '#EB7D2F', '#D9487E', '#E3A008'].map((c, i) => <rect key={c} x={116 + i * 18} y={10} width={12} height={3} fill={c} />)}
      {ocupadosNotas(agentes, ocupados)}
      {/* café, bebedouro, planta e sofá */}
      <rect x={12} y={36} width={20} height={12} className="c-movel" /><rect x={15} y={30} width={8} height={8} fill="#3B3F4F" /><rect x={21} y={32} width={1} height={1} fill="#FF5D5D" /><rect x={25} y={33} width={4} height={4} fill="#F2F2F2" />
      <rect x={293} y={28} width={8} height={8} fill="#9BD7FF" /><rect x={292} y={36} width={10} height={12} fill="#E4E8EF" /><rect x={294} y={40} width={1} height={2} fill="#E15A5A" /><rect x={298} y={40} width={1} height={2} fill="#4C7BEA" />
      <rect x={296} y={150} width={4} height={14} fill="#2F7F3C" /><rect x={292} y={146} width={12} height={10} fill="#46A35A" /><rect x={294} y={164} width={8} height={7} fill="#C4693D" />
      <rect x={8} y={154} width={30} height={8} className="c-sofa2" /><rect x={8} y={160} width={30} height={10} className="c-sofa" /><rect x={8} y={156} width={4} height={14} className="c-sofa2" /><rect x={34} y={156} width={4} height={14} className="c-sofa2" />
      {/* mesas */}
      {agentes.map((a, i) => { const m = mesa(i); return (
        <g key={a.id} className={selecionado === a.id ? 'posto escolhido' : 'posto'}>
          <rect x={m.x - 16} y={m.y - 2} width={32} height={20} rx={1} className="c-marca" />
          <rect x={m.x - 5} y={m.y - 9} width={10} height={8} fill="#2B3142" />
          <rect ref={el => { if (el) telas.current.set(a.id, el); else telas.current.delete(a.id); }} x={m.x - 4} y={m.y - 8} width={8} height={6} className="tela" />
          <rect x={m.x - 14} y={m.y} width={28} height={5} className="c-tampo" /><rect x={m.x - 14} y={m.y + 5} width={28} height={8} className="c-frente" />
          <rect x={m.x - 13} y={m.y + 13} width={2} height={3} className="c-perna" /><rect x={m.x + 11} y={m.y + 13} width={2} height={3} className="c-perna" />
          <rect x={m.x + 7} y={m.y - 3} width={3} height={3} fill="#F2F2F2" />
        </g>
      ); })}
      {/* agentes */}
      <g ref={camada}>
        {agentes.map((a, i) => { const c = casa(i); return (
          <g key={a.id} className="ag" data-y={c.y} transform={`translate(${c.x - 6},${c.y - 16})`} tabIndex={0} role="button"
            aria-label={`${a.nome}${ocupados.has(a.id) ? ', trabalhando' : ', livre'}. Abrir tarefas.`} aria-pressed={selecionado === a.id}
            ref={el => { if (el) grupos.current.set(a.id, el); else grupos.current.delete(a.id); }}
            onClick={() => onEscolher(a.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEscolher(a.id); } }}>
            <rect x={-6} y={-12} width={24} height={30} fill="transparent" />
            <ellipse cx={6} cy={16} rx={6} ry={1.5} className="c-sombra" />
            {selecionado === a.id && <rect x={-2} y={16.5} width={16} height={1.5} className="c-escolha" />}
            <g className="corpo">
              <rect className="pa" x={3} y={14} width={2} height={2} fill={corEscura(a.aparencia, a.ativo)} /><rect className="pb" x={7} y={14} width={2} height={2} fill={corEscura(a.aparencia, a.ativo)} />
              <RobotPixels aparencia={a.aparencia} ativo={a.ativo} />
            </g>
            <g className="balao"><rect x={11} y={-19} width={13} height={8} fill="#1C2030" /><rect x={12} y={-18} width={11} height={6} fill="#FFFFFF" /><rect className="p1" x={14} y={-16} width={1} height={2} fill="#3B4252" /><rect className="p2" x={17} y={-16} width={1} height={2} fill="#3B4252" /><rect className="p3" x={20} y={-16} width={1} height={2} fill="#3B4252" /></g>
            <text x={6} y={-2} className="c-nome">{a.nome}</text>
          </g>
        ); })}
      </g>
    </svg>
  );
}

// Uma nota no quadro para cada agente trabalhando.
function ocupadosNotas(agentes: Agente[], ocupados: Set<string>) {
  return agentes.filter(a => ocupados.has(a.id)).slice(0, 10).map((a, i) => <rect key={a.id} x={116 + (i % 5) * 18 + 1} y={15 + Math.floor(i / 5) * 5} width={5} height={4} fill={a.aparencia.cor} />);
}
