import type { Aparencia } from './supabase';
import { roupaDe } from './pixelRoupas';

export const PIXEL_PERSONAGENS = [
  { id: 'leo', nome: 'Léo' }, { id: 'violeta', nome: 'Violeta' },
  { id: 'neo', nome: 'Neo' }, { id: 'mika', nome: 'Mika' },
  { id: 'orbit', nome: 'Orbit' }, { id: 'davi', nome: 'Davi' },
  { id: 'flora', nome: 'Flora' }, { id: 'nox', nome: 'Nox' },
  { id: 'sol', nome: 'Sol' }, { id: 'zuri', nome: 'Zuri' }
] as const;
export type PixelPersonagem = typeof PIXEL_PERSONAGENS[number]['id'];
export const SLOTS_PIXEL = [
  { id: 'cabeca', nome: 'Cabeça' }, { id: 'rosto', nome: 'Rosto' },
  { id: 'pescoco', nome: 'Pescoço' }, { id: 'bolsa', nome: 'Bolsas' },
  { id: 'mao', nome: 'Na mão' }, { id: 'pulso', nome: 'Pulso' },
  { id: 'detalhe', nome: 'Detalhes' }
] as const;
export type SlotPixel = typeof SLOTS_PIXEL[number]['id'];
export type EquipamentoPixel = Partial<Record<SlotPixel, string>>;
export type MovimentoPixel = 'Idle' | 'Walk' | 'Type' | 'Wave';
export const ATLAS_PIXEL = {
  bases: '/avatars/pixel/bases.png',
  original: '/avatars/pixel/accessories-original.png',
  extra: '/avatars/pixel/accessories-extra.png'
} as const;
export interface AcessorioPixel {
  id: string; nome: string; slot: SlotPixel; atlas: 'original' | 'extra'; indice: number;
  // Centro X, topo Y e largura em uma tela de 256 × 384.
  encaixe: readonly [number, number, number]; atras?: boolean; ocultaRosto?: boolean;
}
type Item = readonly [string, string, SlotPixel, number, number, number, boolean?, boolean?];
const originais: Item[] = [
  ['vr-coral','Visor VR coral','cabeca',128,59,116,false,true],
  ['vr-ciano','Visor VR ciano','cabeca',128,59,116,false,true],
  ['fone-gato','Fone de gatinho','cabeca',128,35,126],
  ['fone-azul','Fone azul','cabeca',128,52,120],
  ['fone-ciano','Fone luminoso','cabeca',128,52,120],
  ['oculos-preto','Óculos retangulares','rosto',128,93,65],
  ['chapeu-flor','Chapéu com flor','cabeca',128,22,148],
  ['chapeu-social','Chapéu social','cabeca',128,25,135],
  ['chapeu-neon','Chapéu luminoso','cabeca',128,20,148],
  ['coroa-floral','Tiara de flores','cabeca',128,39,111],
  ['flores-neon','Flores luminosas','cabeca',128,39,111],
  ['capuz','Capuz coral','cabeca',128,35,131,false,true],
  ['bolsa-coral','Bolsa coral','bolsa',137,150,94],
  ['bolsa-palha','Bolsa de palha','bolsa',137,150,94],
  ['bolsa-executiva','Bolsa executiva','bolsa',177,205,57],
  ['bolsa-holografica','Bolsa holográfica','bolsa',137,150,94],
  ['bolsa-folha','Bolsa botânica','bolsa',137,150,94],
  ['pochete-utilitaria','Bolsa utilitária','bolsa',132,155,85],
  ['cracha','Crachá','pescoco',128,151,42],
  ['gravata-coral','Gravata coral','pescoco',128,150,22],
  ['gravata-roxa','Gravata violeta','pescoco',128,150,22],
  ['borboleta','Gravata borboleta','pescoco',128,151,35],
  ['laco-creme','Laço de seda','pescoco',128,150,36],
  ['argola','Argola dourada','detalhe',165,117,12],
  ['bracelete','Bracelete digital','pulso',171,224,24],
  ['tablet','Tablet','mao',177,210,44],
  ['caderno','Caderno','mao',177,210,42],
  ['holograma','Tela holográfica','mao',181,204,63],
  ['ear-cuff','Ear cuff prateado','detalhe',168,105,15],
  ['fone-pescoco','Fone de pescoço','pescoco',128,147,58]
];
const extras: Item[] = [
  ['bone','Boné coral','cabeca',128,24,116],
  ['gorro','Gorro violeta','cabeca',128,23,109],
  ['bucket','Bucket turquesa','cabeca',128,23,129],
  ['tiara-cristal','Tiara de cristal','cabeca',128,32,111],
  ['orelhas-raposa','Tiara de raposa','cabeca',128,17,115],
  ['coroa','Coroa dourada','cabeca',128,15,94],
  ['oculos-redondo','Óculos redondos','rosto',128,92,65],
  ['oculos-sol','Óculos escuros','rosto',128,93,65],
  ['oculos-coracao','Óculos de coração','rosto',128,92,66],
  ['oculos-ar','Óculos de realidade aumentada','rosto',128,89,77],
  ['headset','Headset de trabalho','cabeca',128,51,119],
  ['fone-coelho','Fone de coelhinho','cabeca',128,0,125],
  ['mochila-coral','Mochila coral','bolsa',165,155,98,true],
  ['mochila-folha','Mochila folha','bolsa',165,155,98,true],
  ['mochila-tech','Mochila tecnológica','bolsa',165,155,98,true],
  ['bolsa-lua','Bolsa lunar','bolsa',139,152,93],
  ['maleta','Maleta de trabalho','mao',180,218,65],
  ['pochete','Pochete amarela','bolsa',128,213,76],
  ['lenco','Lenço turquesa','pescoco',128,147,56],
  ['bandana','Bandana coral','pescoco',128,147,53],
  ['colar','Colar de estrela','pescoco',128,153,39],
  ['broche-lua','Broche lunar','detalhe',149,168,23],
  ['presilha-raio','Presilha de raio','detalhe',155,64,21],
  ['presilha-laco','Presilha de laço','detalhe',155,64,28],
  ['relogio','Relógio inteligente','pulso',171,224,20],
  ['copo','Copo térmico','mao',179,214,27],
  ['camera','Câmera fotográfica','mao',177,210,46],
  ['controle','Controle de videogame','mao',174,213,48],
  ['caneta','Caneta digital','mao',178,214,13],
  ['drone','Drone companheiro','mao',213,161,43]
];
export const ACESSORIOS_PIXEL: AcessorioPixel[] = [
  ...originais.map((i, indice) => item(i, 'original', indice)),
  ...extras.map((i, indice) => item(i, 'extra', indice))
];
function item(i: Item, atlas: AcessorioPixel['atlas'], indice: number): AcessorioPixel {
  return { id:i[0], nome:i[1], slot:i[2], atlas, indice, encaixe:[i[3],i[4],i[5]], atras:i[6], ocultaRosto:i[7] };
}
export function pixelDe(ap: Aparencia) {
  return PIXEL_PERSONAGENS.find(p => p.id === ap.avatarPixel) ?? PIXEL_PERSONAGENS[0];
}
export function equipamentosDe(ap: Aparencia): EquipamentoPixel {
  const resultado: EquipamentoPixel = {};
  for (const slot of SLOTS_PIXEL) {
    const id = ap.acessorios?.[slot.id];
    if (ACESSORIOS_PIXEL.some(a => a.id === id && a.slot === slot.id)) resultado[slot.id] = id;
  }
  if (ACESSORIOS_PIXEL.find(a => a.id === resultado.cabeca)?.ocultaRosto) delete resultado.rosto;
  return resultado;
}
export function equiparPixel(ap: Aparencia, slot: SlotPixel, id?: string): Aparencia {
  const acessorios = equipamentosDe(ap);
  delete acessorios[slot];
  const acessorio = ACESSORIOS_PIXEL.find(a => a.id === id && a.slot === slot);
  if (acessorio) {
    acessorios[slot] = acessorio.id;
    if (acessorio.ocultaRosto) delete acessorios.rosto;
    if (slot === 'rosto' && ACESSORIOS_PIXEL.find(a => a.id === acessorios.cabeca)?.ocultaRosto) delete acessorios.cabeca;
  }
  return { ...ap, estilo: 'pixel', avatarPixel: pixelDe(ap).id, acessorios };
}
export function chavePixel(ap: Aparencia) { return JSON.stringify([pixelDe(ap).id, equipamentosDe(ap), roupaDe(ap)]); }

