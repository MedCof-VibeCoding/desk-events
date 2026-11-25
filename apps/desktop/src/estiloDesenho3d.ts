import * as THREE from 'three';

// Aproxima os volumes 3D da arte em pixel: sombra em faixas chapadas (cel shading)
// e contorno escuro por casco invertido, que acompanha o esqueleto.
const COR_CONTORNO = '#1c1724';
const ESPESSURA_CONTORNO = 0.014; // unidades do modelo (personagem ≈ 1,85)
const RAIO_MINIMO_CONTORNO = 0.035; // brilhos e pupilas ficam sem contorno

let gradiente: THREE.DataTexture | null = null;
function gradienteCel() {
  if (!gradiente) {
    // Três faixas: sombra, meio-tom e luz, como na arte de referência.
    gradiente = new THREE.DataTexture(new Uint8Array([150, 215, 255]), 3, 1, THREE.RedFormat);
    gradiente.minFilter = THREE.NearestFilter;
    gradiente.magFilter = THREE.NearestFilter;
    gradiente.generateMipmaps = false;
    gradiente.needsUpdate = true;
  }
  return gradiente;
}

function paraCel(origem: THREE.Material, cache: Map<THREE.Material, THREE.Material>) {
  const pronto = cache.get(origem);
  if (pronto) return pronto;
  const m = origem as THREE.MeshStandardMaterial;
  const cel = new THREE.MeshToonMaterial({
    color: m.color?.clone() ?? new THREE.Color('#ffffff'),
    map: m.map ?? null,
    vertexColors: m.vertexColors,
    emissive: m.emissive?.clone() ?? new THREE.Color('#000000'),
    emissiveIntensity: m.emissiveIntensity ?? 1,
    emissiveMap: m.emissiveMap ?? null,
    transparent: m.transparent,
    opacity: m.opacity,
    alphaTest: m.alphaTest,
    side: m.side,
    gradientMap: gradienteCel()
  });
  cel.name = m.name;
  cache.set(origem, cel);
  return cel;
}

// Normais suavizadas: vértices duplicados nas quinas recebem a mesma direção,
// para o contorno não abrir frestas.
function normaisContorno(geo: THREE.BufferGeometry) {
  if (geo.getAttribute('normalContorno')) return;
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
  const soma = new Map<string, THREE.Vector3>(), chaves: string[] = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    chaves.push(k);
    const v = soma.get(k) ?? soma.set(k, new THREE.Vector3()).get(k)!;
    v.x += nor.getX(i); v.y += nor.getY(i); v.z += nor.getZ(i);
  }
  const dados = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = soma.get(chaves[i])!.clone().normalize();
    dados.set([v.x, v.y, v.z], i * 3);
  }
  geo.setAttribute('normalContorno', new THREE.BufferAttribute(dados, 3));
}

function materialContorno() {
  const m = new THREE.MeshBasicMaterial({ color: COR_CONTORNO, side: THREE.BackSide });
  m.name = 'contorno';
  m.onBeforeCompile = shader => {
    shader.uniforms.uEspessura = { value: ESPESSURA_CONTORNO };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uEspessura;\nattribute vec3 normalContorno;\nvoid main() {')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float escalaContorno = max(length(modelMatrix[0].xyz), 1e-4);
        transformed += normalize(normalContorno) * (uEspessura / escalaContorno);`);
  };
  return m;
}

/** Troca os materiais por cel shading e acrescenta o contorno. Retorna o que precisa ser liberado. */
export function aplicarEstiloDesenho(modelo: THREE.Object3D) {
  const cache = new Map<THREE.Material, THREE.Material>();
  const contorno = materialContorno();
  const malhas: THREE.Mesh[] = [];
  modelo.updateMatrixWorld(true);
  modelo.traverse(o => { if ((o as THREE.Mesh).isMesh) malhas.push(o as THREE.Mesh); });
  const escala = new THREE.Vector3();
  for (const mesh of malhas) {
    const antigos = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const novos = antigos.map(m => paraCel(m, cache));
    mesh.material = Array.isArray(mesh.material) ? novos : novos[0];
    const geo = mesh.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    mesh.getWorldScale(escala);
    const raio = (geo.boundingSphere?.radius ?? 0) * Math.max(escala.x, escala.y, escala.z);
    if (raio < RAIO_MINIMO_CONTORNO || mesh.userData.semContorno) continue;
    normaisContorno(geo);
    const skinned = mesh as THREE.SkinnedMesh;
    let casco: THREE.Mesh;
    if (skinned.isSkinnedMesh) {
      const s = new THREE.SkinnedMesh(geo, contorno);
      s.bindMode = skinned.bindMode;
      s.bind(skinned.skeleton, skinned.bindMatrix);
      s.frustumCulled = false;
      casco = s;
    } else casco = new THREE.Mesh(geo, contorno);
    casco.name = `${mesh.name}-contorno`;
    casco.castShadow = false; casco.receiveShadow = false;
    casco.userData.contorno = true;
    mesh.add(casco);
  }
  for (const m of cache.keys()) m.dispose();
  return { materiais: [...new Set(cache.values()), contorno] };
}
