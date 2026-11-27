import type { Aparencia } from './supabase';

export const ROUPAS_PIXEL = [
  {id:'basica',nome:'Básica'}, {id:'casual',nome:'Casual'},
  {id:'executiva',nome:'Executiva'}, {id:'futurista',nome:'Futurista'}
] as const;
export const CORES_ROUPA = [
  {id:'marinho',nome:'Azul-marinho',cor:'#29324d'},
  {id:'coral',nome:'Coral',cor:'#df6675'},
  {id:'creme',nome:'Creme',cor:'#dfd4bd'},
  {id:'verde',nome:'Verde',cor:'#3c8065'},
  {id:'violeta',nome:'Violeta',cor:'#805bb0'},
  {id:'azul',nome:'Azul',cor:'#397faf'},
  {id:'vermelho',nome:'Vermelho',cor:'#c8343c'},
  {id:'bordo',nome:'Bordô',cor:'#7a1f33'}
] as const;
export const CORES_CALCA = [
  {id:'grafite',nome:'Grafite',cor:'#45434e'},
  {id:'jeans',nome:'Jeans',cor:'#52799a'},
  {id:'bege',nome:'Bege',cor:'#b8a58a'},
  {id:'preto',nome:'Preto',cor:'#252630'}
] as const;
export const CORES_CALCADO = [
  {id:'cinza',nome:'Cinza',cor:'#93929d'},
  {id:'branco',nome:'Branco',cor:'#e9e4dc'},
  {id:'coral',nome:'Coral',cor:'#df6675'},
  {id:'preto',nome:'Preto',cor:'#34343c'}
] as const;
export interface RoupaPixel {
  modelo:typeof ROUPAS_PIXEL[number]['id'];
  superior:typeof CORES_ROUPA[number]['id'];
  inferior:typeof CORES_CALCA[number]['id'];
  calcado:typeof CORES_CALCADO[number]['id'];
}
export const ROUPA_PADRAO:RoupaPixel={modelo:'basica',superior:'marinho',inferior:'grafite',calcado:'cinza'};
export function roupaDe(ap:Aparencia):RoupaPixel {
  const r=ap.roupaPixel;
  return {
    modelo:ROUPAS_PIXEL.find(x=>x.id===r?.modelo)?.id??ROUPA_PADRAO.modelo,
    superior:CORES_ROUPA.find(x=>x.id===r?.superior)?.id??ROUPA_PADRAO.superior,
    inferior:CORES_CALCA.find(x=>x.id===r?.inferior)?.id??ROUPA_PADRAO.inferior,
    calcado:CORES_CALCADO.find(x=>x.id===r?.calcado)?.id??ROUPA_PADRAO.calcado
  };
}
export function mudarRoupa(ap:Aparencia,roupa:Partial<RoupaPixel>):Aparencia {
  return {...ap,roupaPixel:roupaDe({...ap,roupaPixel:{...roupaDe(ap),...roupa}})};
}
