import * as THREE from 'three';

const material = (cor: string, emissive = '#000000') => new THREE.MeshLambertMaterial({ color: cor, emissive: new THREE.Color(emissive) });
const paleta = () => ({
  carvalho: material('#B79876'), madeira: material('#715844'), preto: material('#18191B'), metal: material('#343638'),
  tecido: material('#44494A'), claro: material('#DFD8CB'), vermelho: material('#AD293B'), verde: material('#47745D'),
  folha: material('#72A17C'), vaso: material('#D6C5AE'), papel: material('#F4EDE0'), luz: material('#FFE6BB', '#8A6132'),
});
type Paleta = ReturnType<typeof paleta>;

// Cantos arredondados no plano do móvel, sem texturas externas.
function bloco(pai: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, raio = 0, sombra = true) {
  let geometria: THREE.BufferGeometry;
  if (raio > 0) {
    const r = Math.min(raio, w / 2, d / 2), a = -w / 2, b = -d / 2;
    const s = new THREE.Shape();
    s.moveTo(a + r, b); s.lineTo(a + w - r, b); s.quadraticCurveTo(a + w, b, a + w, b + r);
    s.lineTo(a + w, b + d - r); s.quadraticCurveTo(a + w, b + d, a + w - r, b + d);
    s.lineTo(a + r, b + d); s.quadraticCurveTo(a, b + d, a, b + d - r);
    s.lineTo(a, b + r); s.quadraticCurveTo(a, b, a + r, b);
    geometria = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 3, steps: 1 });
    geometria.rotateX(-Math.PI / 2); geometria.translate(0, -h / 2, 0);
  } else geometria = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geometria, m); mesh.position.set(x, y, z); mesh.castShadow = sombra; mesh.receiveShadow = true; pai.add(mesh); return mesh;
}
function cilindro(pai: THREE.Object3D, raio: number, h: number, x: number, y: number, z: number, m: THREE.Material, topo = raio) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(topo, raio, h, 16), m);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; pai.add(mesh); return mesh;
}
function grupo(pai: THREE.Object3D, nome: string, x = 0, z = 0, giro = 0) {
  const g = new THREE.Group(); g.name = nome; g.position.set(x, 0, z); g.rotation.y = giro; pai.add(g); return g;
}
function planta(pai: THREE.Object3D, x: number, y: number, z: number, p: Paleta, escala = 1) {
  const g = grupo(pai, 'planta', x, z); g.position.y = y; g.scale.setScalar(escala);
  cilindro(g, .22, .42, 0, .21, 0, p.vaso, .29);
  cilindro(g, .245, .025, 0, .43, 0, p.madeira);
  cilindro(g, .035, .72, 0, .78, 0, p.verde);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, folha = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), i % 2 ? p.folha : p.verde);
    folha.scale.set(.17, .42, .11); folha.position.set(Math.cos(a) * .2, .9 + (i % 3) * .14, Math.sin(a) * .2);
    folha.rotation.set(Math.cos(a) * .65, a, Math.sin(a) * .65); folha.castShadow = true; g.add(folha);
  }
}
function cadeira(pai: THREE.Object3D, x: number, z: number, p: Paleta, giro = 0, cor = p.tecido) {
  const g = grupo(pai, 'cadeira', x, z, giro);
  bloco(g, .57, .12, .56, 0, .49, 0, cor, .12);
  bloco(g, .57, .55, .12, 0, .83, .24, cor, .05);
  cilindro(g, .045, .38, 0, .23, 0, p.metal);
  bloco(g, .6, .055, .07, 0, .055, 0, p.metal); bloco(g, .07, .055, .6, 0, .055, 0, p.metal);
  for (const lado of [-1, 1]) {
    bloco(g, .055, .2, .055, lado * .3, .62, .08, p.metal);
    bloco(g, .09, .055, .34, lado * .3, .73, .02, p.preto, .03);
  }
}
function sofa(pai: THREE.Object3D, x: number, z: number, giro: number, p: Paleta) {
  const g = grupo(pai, 'sofa', x, z, giro);
  bloco(g, 2.35, .24, .85, 0, .25, 0, p.preto, .12);
  bloco(g, 2.35, .64, .2, 0, .63, -.34, p.tecido, .08);
  for (const lado of [-1, 1]) {
    bloco(g, 1.01, .18, .64, lado * .53, .47, .04, p.tecido, .09);
    bloco(g, .18, .43, .85, lado * 1.1, .49, 0, p.tecido, .07);
    const almofada = bloco(g, .43, .34, .15, lado * .77, .73, -.12, lado === 1 ? p.vermelho : p.claro, .06);
    almofada.rotation.z = lado * .16;
  }
}
function estante(pai: THREE.Object3D, x: number, z: number, p: Paleta) {
  const g = grupo(pai, 'estante', x, z);
  bloco(g, 1.45, 2.05, .12, 0, 1.025, -.2, p.preto);
  for (const lado of [-1, 1]) bloco(g, .07, 2.1, .5, lado * .72, 1.05, 0, p.metal);
  for (let n = 0; n < 4; n++) {
    const y = .12 + n * .6; bloco(g, 1.45, .065, .5, 0, y, 0, p.carvalho);
    if (n < 3) for (let b = 0; b < 5; b++) bloco(g, .12, .26 + (b % 3) * .06, .25, -.49 + b * .2, y + .22, 0, [p.claro, p.vermelho, p.verde, p.madeira, p.papel][b]);
  }
  planta(g, .25, 1.96, 0, p, .35);
}

export function montarSala(scene: THREE.Scene) {
  const p = paleta(), sala = grupo(scene, 'ambiente');
  // Plataforma, piso de madeira e rodapés: as rotas continuam livres entre as estações.
  bloco(sala, 21.35, .34, 15.9, 0, -.23, .2, p.preto, .2);
  bloco(sala, 21, .12, 15.6, 0, -.04, .2, p.carvalho);
  const junta = material('#A38667');
  for (let z = -7.2, n = 0; z < 8; z += .72, n++) {
    bloco(sala, 21, .008, .018, 0, .025, z, junta, 0, false);
    const comprimento = Math.min(.72, 8 - z);
    for (let x = -9 + (n % 2) * 2.1; x < 10.5; x += 4.2) bloco(sala, .018, .008, comprimento, x, .025, z + comprimento / 2, junta, 0, false);
  }
  bloco(sala, 21.15, 2.65, .22, 0, 1.32, -7.65, p.preto);
  bloco(sala, .22, 2.65, 15.7, -10.55, 1.32, .1, p.preto);
  bloco(sala, 21, .09, .04, 0, .14, -7.51, p.vermelho);
  bloco(sala, .04, .09, 15.5, -10.41, .14, .2, p.vermelho);
  // Janelas com caixilhos, parapeitos e luz quente.
  const vidro = material('#91ADB0', '#263E43');
  for (const x of [-8.6, -3, 2, 7]) {
    bloco(sala, 2.3, 1.28, .08, x, 1.67, -7.49, p.metal);
    bloco(sala, 2.12, 1.1, .035, x, 1.67, -7.43, vidro, 0, false);
    bloco(sala, .045, 1.1, .04, x, 1.67, -7.4, p.preto);
    bloco(sala, 2.4, .08, .28, x, 1, -7.38, p.carvalho);
    bloco(sala, 2.2, .035, .08, x, 2.4, -7.4, p.luz, 0, false);
  }
  // Tapetes delimitam as áreas sem bloquear a circulação.
  const tapete = material('#4B5050'), borda = material('#646968');
  for (const z of [-1.5, 1.5, 4.5]) {
    bloco(sala, 14.6, .025, 2.5, 0, .045, z + .35, borda, .18, false);
    bloco(sala, 14.45, .028, 2.35, 0, .06, z + .35, tapete, .15, false);
  }
  const reuniao = grupo(sala, 'area-reuniao');
  bloco(reuniao, 6.1, .03, 2.8, -6, .05, -5.85, material('#3F4948'), .2, false);
  bloco(reuniao, 3.2, .13, 1.15, -6, .83, -5.85, p.carvalho, .4);
  for (const x of [-7, -5]) bloco(reuniao, .14, .74, .65, x, .4, -5.85, p.metal);
  for (const x of [-7, -6, -5]) { cadeira(reuniao, x, -4.75, p); cadeira(reuniao, x, -6.95, p, Math.PI); }
  bloco(reuniao, .8, .025, .4, -6, .91, -5.85, p.preto, .035);
  bloco(reuniao, .28, .02, .38, -5.15, .91, -5.8, p.papel, .02);
  cilindro(reuniao, .07, .16, -6.8, .98, -5.8, p.vermelho);
  // Divisória leve de ripas, com passagem livre pela frente.
  for (let z = -7; z < -4.5; z += .28) bloco(reuniao, .09, 1.5, .08, -1.4, .75, z, p.madeira);
  // Copa: bancada, armários, máquina de café, geladeira e banquetas.
  const cafe = grupo(sala, 'area-cafe');
  bloco(cafe, 4, 1, .8, 4.5, .53, -6.8, p.madeira, .05);
  bloco(cafe, 4.15, .09, .95, 4.5, 1.07, -6.8, p.claro, .06);
  for (const x of [3.1, 4.05, 5, 5.95]) { bloco(cafe, .9, .78, .035, x, .56, -6.38, p.carvalho); bloco(cafe, .26, .035, .04, x, .8, -6.34, p.preto); }
  bloco(cafe, .58, .5, .42, 3.3, 1.36, -6.7, p.preto, .04);
  bloco(cafe, .38, .13, .035, 3.3, 1.43, -6.47, p.metal);
  bloco(cafe, .07, .04, .025, 3.44, 1.53, -6.44, p.vermelho);
  cilindro(cafe, .065, .14, 3.3, 1.18, -6.4, p.papel);
  for (const x of [4.4, 4.7, 5]) cilindro(cafe, .07, .16, x, 1.2, -6.7, p.papel);
  bloco(cafe, .85, 1.85, .8, 7.9, .95, -6.8, p.claro, .09);
  bloco(cafe, .035, .45, .06, 7.58, 1.3, -6.37, p.preto);
  bloco(cafe, 2.7, .1, .65, 4.5, 1.03, -4.9, p.carvalho, .18);
  for (const x of [3.55, 5.45]) { bloco(cafe, .09, 1, .45, x, .5, -4.9, p.metal); cilindro(cafe, .28, .12, x, .7, -4.05, p.vermelho); cilindro(cafe, .05, .62, x, .35, -4.05, p.metal); cilindro(cafe, .22, .04, x, .04, -4.05, p.preto); }
  planta(cafe, 6, 1.13, -6.8, p, .35);
  estante(sala, .3, -7.05, p); estante(sala, 9.4, -6.95, p);
  // Lounges nas laterais, fora dos corredores usados pelos personagens.
  for (const lado of [-1, 1]) {
    bloco(sala, 1.7, .025, 3.45, lado * 9.5, .04, 4.2, material('#514243'), .2, false);
    sofa(sala, lado * 9.7, 4.1, -lado * Math.PI / 2, p);
    cilindro(sala, .37, .07, lado * 9.15, .5, 6.1, p.carvalho);
    cilindro(sala, .08, .45, lado * 9.15, .25, 6.1, p.preto);
    bloco(sala, .25, .03, .34, lado * 9.15, .55, 6.1, p.vermelho, .02);
    planta(sala, lado * 9.6, 0, 7.1, p, 1.1);
    planta(sala, lado * 9.6, 0, -3.7, p, 1.25);
    // Luminária de piso ao lado do sofá.
    cilindro(sala, .22, .05, lado * 9.7, .04, 2.45, p.preto);
    cilindro(sala, .025, 1.75, lado * 9.7, .9, 2.45, p.metal);
    cilindro(sala, .28, .25, lado * 9.7, 1.85, 2.45, p.claro, .2);
  }
  // Quadro de avisos na parede lateral.
  bloco(sala, .08, 1.1, 2.3, -10.38, 1.65, -.4, p.carvalho);
  bloco(sala, .04, .94, 2.14, -10.32, 1.65, -.4, p.claro);
  for (let i = 0; i < 6; i++) bloco(sala, .025, .23, .28, -10.28, 1.42 + Math.floor(i / 3) * .42, -1.08 + (i % 3) * .64, i % 2 ? p.vermelho : p.papel);
  planta(sala, -2.3, 0, -6.9, p, .8);
}

export interface Posto { grupo: THREE.Group; tela: THREE.MeshLambertMaterial }
export function montarPosto(scene: THREE.Scene, m: { x: number; z: number }, indice = 0): Posto {
  const p = paleta(), g = grupo(scene, `estacao-${indice + 1}`, m.x, m.z);
  bloco(g, 2, .12, .95, 0, .8, 0, p.carvalho, .12);
  for (const x of [-.85, .85]) { bloco(g, .075, .73, .075, x, .4, -.3, p.metal); bloco(g, .075, .73, .075, x, .4, .3, p.metal); bloco(g, .1, .055, .8, x, .06, 0, p.preto); }
  bloco(g, .85, .015, .42, .04, .87, .1, p.preto, .035);
  bloco(g, .78, .48, .06, 0, 1.22, -.23, p.preto, .025);
  bloco(g, .08, .18, .08, 0, .96, -.23, p.metal);
  bloco(g, .34, .025, .2, 0, .88, -.23, p.metal, .03);
  const tela = material('#193335');
  bloco(g, .69, .38, .015, 0, 1.23, -.19, tela, 0, false);
  // Interface gráfica discreta no monitor e periféricos.
  bloco(g, .035, .29, .008, -.28, 1.24, -.177, p.vermelho, 0, false);
  for (let i = 0; i < 3; i++) bloco(g, .31 - i * .06, .018, .008, -.05, 1.32 - i * .065, -.177, p.claro, 0, false);
  bloco(g, .53, .03, .18, -.07, .9, .15, p.metal, .025);
  bloco(g, .09, .04, .14, .32, .91, .15, p.claro, .04);
  cilindro(g, .07, .15, .75, .94, .22, indice % 3 === 0 ? p.vermelho : p.papel);
  if (indice % 2 === 0) planta(g, -.77, .87, -.12, p, .24);
  else { bloco(g, .27, .035, .33, -.75, .88, -.08, p.vermelho, .02); bloco(g, .24, .025, .29, -.75, .91, -.08, p.papel, .02); }
  cadeira(g, 0, 1.1, p, 0, indice % 4 === 0 ? p.vermelho : p.tecido);
  return { grupo: g, tela };
}
