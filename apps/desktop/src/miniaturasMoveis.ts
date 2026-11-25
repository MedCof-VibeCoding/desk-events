import * as THREE from 'three';
import { MOVEIS, estiloDe, type EstiloId } from './ambientes';
import { montarMovel, descartarObjeto } from './moveisModulares3d';
const cache=new Map<EstiloId,Promise<Record<string,string>>>();
export function miniaturasMoveis(estilo:EstiloId):Promise<Record<string,string>> {
  const existente=cache.get(estilo);if(existente)return existente;
  const tarefa=(async()=>{
    const resultado:Record<string,string>={};
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(144,116);renderer.setPixelRatio(1);
    const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight('#FFF7EB','#77716A',2));const sol=new THREE.DirectionalLight('#FFF3E0',2);sol.position.set(4,8,5);scene.add(sol);
    const camera=new THREE.OrthographicCamera(-2,2,2,-2,.01,40);
    try {
      for(const d of MOVEIS) {
        const g=montarMovel({id:'preview',tipo:d.id,x:0,z:0,giro:0},estiloDe(estilo));g.position.y=0;scene.add(g);
        const bounds=new THREE.Box3().setFromObject(g),centro=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
        const metade=Math.max(.65,size.length()*.6),ratio=144/116;
        camera.left=-metade*ratio;camera.right=metade*ratio;camera.top=metade;camera.bottom=-metade;camera.position.copy(centro).add(new THREE.Vector3(6,6,6));camera.lookAt(centro);camera.updateProjectionMatrix();
        renderer.render(scene,camera);resultado[d.id]=renderer.domElement.toDataURL('image/png');descartarObjeto(g);
        // Distribui o catálogo entre quadros para manter o editor responsivo.
        await new Promise<void>(r=>requestAnimationFrame(()=>r()));
      }
      return resultado;
    } finally {renderer.dispose();renderer.forceContextLoss();}
  })();cache.set(estilo,tarefa);tarefa.catch(()=>cache.delete(estilo));return tarefa;
}
