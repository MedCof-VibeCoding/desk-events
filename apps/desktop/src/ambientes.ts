// Dados puros compartilhados pelo editor, renderizador e testes.
export const ESTILOS = [
  { id: 'classico', nome: 'Clássico', descricao: 'Carvalho, grafite e vermelho', piso: '#B79876', parede: '#18191B', madeira: '#B79876', tecido: '#44494A', destaque: '#AD293B' },
  { id: 'industrial', nome: 'Industrial', descricao: 'Concreto, tijolos e aço', piso: '#85817B', parede: '#784D3C', madeira: '#A77A4F', tecido: '#353738', destaque: '#CD7C38' },
  { id: 'jardim', nome: 'Jardim', descricao: 'Madeira clara e muito verde', piso: '#C7B18B', parede: '#DBDDCD', madeira: '#C3AA7A', tecido: '#6B8251', destaque: '#51865A' },
  { id: 'minimalista', nome: 'Minimalista', descricao: 'Tons claros e linhas simples', piso: '#D3C7AF', parede: '#E5E4DD', madeira: '#DBD0B8', tecido: '#7893A4', destaque: '#5684A4' },
  { id: 'executivo', nome: 'Executivo', descricao: 'Nogueira e estofados vinho', piso: '#79583E', parede: '#443328', madeira: '#946B43', tecido: '#542C37', destaque: '#B28B4F' },
  { id: 'tech', nome: 'Tech', descricao: 'Grafite com ciano e violeta', piso: '#343942', parede: '#1A202B', madeira: '#6E7687', tecido: '#444366', destaque: '#7771F4' },
  { id: 'criativo', nome: 'Criativo', descricao: 'Coral, mostarda e colaboração', piso: '#C5AC83', parede: '#DCCDB7', madeira: '#BCA277', tecido: '#357F85', destaque: '#D47753' },
  { id: 'cafe', nome: 'Café', descricao: 'Terracota e cantos aconchegantes', piso: '#AD8057', parede: '#825C41', madeira: '#BE9160', tecido: '#BB714D', destaque: '#E1AB67' },
  { id: 'biblioteca', nome: 'Biblioteca', descricao: 'Estantes e verde profundo', piso: '#8D6D4A', parede: '#4B5647', madeira: '#9B744A', tecido: '#3A6251', destaque: '#B49B58' },
  { id: 'estudio', nome: 'Estúdio', descricao: 'Produção, acústica e vermelho', piso: '#49484B', parede: '#222225', madeira: '#9F8265', tecido: '#444247', destaque: '#C63145' },
] as const;
export type EstiloId = typeof ESTILOS[number]['id'];
export type Estilo = typeof ESTILOS[number];
export type Categoria = 'Mesas' | 'Assentos' | 'Armários' | 'Utilidades' | 'Decoração' | 'Equipamentos';
export interface MovelDef { id: string; nome: string; categoria: Categoria; forma: string; w: number; d: number; cor?: string; tapete?: boolean; superficie?: boolean }
const def = (id: string, nome: string, categoria: Categoria, forma: string, w: number, d: number, extra: Partial<MovelDef> = {}): MovelDef => ({ id, nome, categoria, forma, w, d, ...extra });
export const MOVEIS: MovelDef[] = [
  def('mesa-carvalho','Mesa carvalho','Mesas','mesa',2,1), def('mesa-branca','Mesa branca','Mesas','mesa',2,1,{cor:'#E7E3DB'}), def('mesa-preta','Mesa preta','Mesas','mesa',2,1,{cor:'#292B30'}), def('mesa-l','Mesa em L','Mesas','mesa-l',2.5,1.8),
  def('mesa-alta','Mesa alta','Mesas','mesa-alta',1.8,.9), def('bancada-dupla','Bancada dupla','Mesas','mesa',3,1.2), def('ilha','Ilha de trabalho','Mesas','ilha',3,2), def('recepcao','Balcão de recepção','Mesas','recepcao',2.4,1),
  ...[['vermelha','#AD293B'],['preta','#343638'],['creme','#DFD8CB'],['azul','#487286']].map(([n,cor]) => def(`cadeira-${n}`,`Cadeira ${n}`,'Assentos','cadeira',.7,.7,{cor})),
  def('poltrona','Poltrona verde','Assentos','poltrona',1,1,{cor:'#6C8058'}), def('sofa-grafite','Sofá grafite','Assentos','sofa',2.4,.9,{cor:'#44494A'}), def('sofa-creme','Sofá creme','Assentos','sofa',2.4,.9,{cor:'#D9CEB8'}), def('banqueta','Banqueta','Assentos','banqueta',.6,.6),
  def('mesa-reuniao','Mesa de reunião','Mesas','mesa',3.2,1.2), def('mesa-redonda','Mesa redonda','Mesas','redonda',1.6,1.6), def('mesa-centro-redonda','Mesa de centro redonda','Mesas','centro-redonda',1,1), def('mesa-centro','Mesa de centro','Mesas','centro',1.4,.7),
  def('estante','Estante de livros','Armários','estante',1.5,.55), def('armario-baixo','Armário baixo','Armários','armario',2,.65), def('arquivo','Arquivo','Armários','arquivo',.7,.7), def('locker','Armários individuais','Armários','locker',1.4,.6),
  def('copa','Bancada de café','Utilidades','copa',2.4,.8), def('geladeira','Geladeira','Utilidades','geladeira',.85,.85), def('bebedouro','Bebedouro','Utilidades','bebedouro',.6,.6), def('quadro','Quadro móvel','Utilidades','quadro',1.6,.65),
  def('tv','Tela de apresentação','Equipamentos','tv',1.5,.6), def('divisoria-madeira','Divisória ripada','Utilidades','ripas',1.8,.25), def('divisoria-vidro','Divisória de vidro','Utilidades','vidro',1.8,.25), def('divisoria-acustica','Painel acústico','Utilidades','acustica',1.5,.3),
  def('planta-grande','Planta grande','Decoração','planta',.8,.8), def('samambaia','Samambaia','Decoração','samambaia',.7,.7), def('suculenta','Suculenta de mesa','Decoração','suculenta',.3,.3,{superficie:true}), def('luminaria','Luminária de piso','Decoração','luminaria',.6,.6),
  def('luminaria-mesa','Luminária de mesa','Decoração','luminaria-mesa',.35,.35,{superficie:true}), def('tapete-retangular','Tapete grafite','Decoração','tapete',3,2,{tapete:true,cor:'#44494A'}), def('tapete-redondo','Tapete verde','Decoração','tapete-redondo',2,2,{tapete:true,cor:'#839076'}), def('arte','Quadro decorativo','Decoração','arte',1,.4),
  def('monitor','Monitor e teclado','Equipamentos','monitor',.9,.55,{superficie:true}), def('notebook','Notebook','Equipamentos','notebook',.6,.5,{superficie:true}), def('microfone','Microfone de mesa','Equipamentos','microfone',.25,.25,{superficie:true}), def('camera','Câmera e tripé','Equipamentos','camera',.7,.7),
  def('caixa-som','Caixa de som','Equipamentos','som',.6,.6), def('cabideiro','Cabideiro','Utilidades','cabideiro',.6,.6), def('lixeira','Lixeira','Utilidades','lixeira',.4,.4), def('impressora','Mesa com impressora','Equipamentos','impressora',1.2,.7),
];
const POSTO = def('posto','Estação do agente','Mesas','posto',2.1,2.2);
export const movelDe = (id: string) => id === 'posto' ? POSTO : MOVEIS.find(m => m.id === id);
export interface ItemAmbiente { id: string; tipo: string; x: number; z: number; giro: number; slot?: number }
export interface Ambiente { versao: 1; estilo: EstiloId; itens: ItemAmbiente[] }
export interface TamanhoSala { id: 'grande' | 'compacta'; minX: number; maxX: number; minZ: number; maxZ: number; maxPostos: number }
export const TAMANHO_GRANDE: TamanhoSala = { id: 'grande', minX: -10.2, maxX: 10.2, minZ: -7.35, maxZ: 7.7, maxPostos: 12 };
export const TAMANHO_COMPACTA: TamanhoSala = { id: 'compacta', minX: -6.4, maxX: 6.4, minZ: -4.8, maxZ: 5.2, maxPostos: 6 };
/** Sala pessoal usa o piso menor; o escritório principal continua grande. */
export function tamanhoDe(compacta: boolean): TamanhoSala { return compacta ? TAMANHO_COMPACTA : TAMANHO_GRANDE; }
export const estiloDe = (id: string): Estilo => ESTILOS.find(e => e.id === id) ?? ESTILOS[0];
export const MAX_ITENS = 100;
export function limitesItem(item: ItemAmbiente, margem = 0) {
  const d = movelDe(item.tipo)!; const vira = item.giro % 2 !== 0;
  // A cadeira da estação fica ao sul da mesa antes da rotação.
  const a = item.giro * Math.PI / 2, cx = item.x + (item.tipo === 'posto' ? Math.sin(a) * .55 : 0), cz = item.z + (item.tipo === 'posto' ? Math.cos(a) * .55 : 0);
  const w = (vira ? d.d : d.w) / 2 + margem, h = (vira ? d.w : d.d) / 2 + margem;
  return { minX: cx-w, maxX: cx+w, minZ: cz-h, maxZ: cz+h };
}
export function erroPosicao(item: ItemAmbiente, itens: ItemAmbiente[], tamanho: TamanhoSala = TAMANHO_GRANDE): string | null {
  const def = movelDe(item.tipo); if (!def) return 'Móvel desconhecido.';
  if (![item.x,item.z,item.giro].every(Number.isFinite) || !Number.isInteger(item.giro) || item.giro < 0 || item.giro > 3) return 'Posição inválida.';
  const a = limitesItem(item);
  if (a.minX < tamanho.minX || a.maxX > tamanho.maxX || a.minZ < tamanho.minZ || a.maxZ > tamanho.maxZ) return 'Mantenha o móvel dentro do escritório.';
  if (def.tapete) return null;
  if (def.superficie) {
    const apoio = itens.some(o => apoia(o,item));
    if (!apoio) return 'Posicione este acessório sobre uma mesa.';
  }
  for (const outro of itens) {
    const od = movelDe(outro.tipo);
    if (outro.id === item.id || !od || od.tapete || !!od.superficie !== !!def.superficie) continue;
    const b = limitesItem(outro);
    if (a.minX < b.maxX-.02 && a.maxX > b.minX+.02 && a.minZ < b.maxZ-.02 && a.maxZ > b.minZ+.02) return 'Este espaço já está ocupado por outro móvel.';
  }
  return null;
}
function apoia(mesa:ItemAmbiente,acessorio:ItemAmbiente) {
  if(mesa.id===acessorio.id || !['mesa','ilha','posto'].includes(movelDe(mesa.tipo)?.forma??'')) return false;
  const a=limitesItem(acessorio); let b=limitesItem(mesa);
  // Nas estações só o tampo é apoio, não a área reservada à cadeira.
  if(mesa.tipo==='posto') {const w=mesa.giro%2?.95:2,d=mesa.giro%2?2:.95;b={minX:mesa.x-w/2,maxX:mesa.x+w/2,minZ:mesa.z-d/2,maxZ:mesa.z+d/2};}
  return a.minX>=b.minX && a.maxX<=b.maxX && a.minZ>=b.minZ && a.maxZ<=b.maxZ;
}
export function moverItem(ambiente:Ambiente,novo:ItemAmbiente,tamanho:TamanhoSala=TAMANHO_GRANDE): {ambiente?:Ambiente;erro?:string} {
  const antigo=ambiente.itens.find(i=>i.id===novo.id);if(!antigo)return {erro:'Móvel não encontrado.'};
  const delta=(novo.giro-antigo.giro)*Math.PI/2;
  const itens=ambiente.itens.map(i=> {
    if(i.id===novo.id)return novo;
    if(!movelDe(i.tipo)?.superficie || !apoia(antigo,i))return i;
    const dx=i.x-antigo.x,dz=i.z-antigo.z;
    return {...i,x:Math.round((novo.x+dx*Math.cos(delta)+dz*Math.sin(delta))*100)/100,z:Math.round((novo.z-dx*Math.sin(delta)+dz*Math.cos(delta))*100)/100,giro:(i.giro+novo.giro-antigo.giro+4)%4};
  });
  for(const i of itens) { if(i===ambiente.itens.find(o=>o.id===i.id))continue;const erro=erroPosicao(i,itens,tamanho);if(erro)return {erro}; }
  return {ambiente:{...ambiente,itens}};
}
export function removerItem(ambiente:Ambiente,id:string):Ambiente {
  const item=ambiente.itens.find(i=>i.id===id);if(!item)return ambiente;
  return {...ambiente,itens:ambiente.itens.filter(i=>i.id!==id && !(movelDe(i.tipo)?.superficie && apoia(item,i)))};
}
/** Seis mesas em duas fileiras, com sofá, planta, estante e copa. */
export function criarAmbienteCompacto(estilo: EstiloId = 'classico'): Ambiente {
  const itens: ItemAmbiente[] = [[-4,-1.2],[0,-1.2],[4,-1.2],[-4,2.2],[0,2.2],[4,2.2]].map(([x,z],i) => ({ id:`posto-${i}`, tipo:'posto', slot:i, x, z, giro:0 }));
  const add = (tipo: string, x: number, z: number, giro = 0) => itens.push({ id:`base-${itens.length}`, tipo, x, z, giro });
  add('sofa-grafite', -5.55, 3.4, 1); add('planta-grande', -5.4, -3.85); add('estante', 0, -4.25); add('copa', 4.7, -4.05);
  return { versao:1, estilo, itens };
}
export function criarAmbiente(estilo: EstiloId = 'classico', compacta = false): Ambiente {
  if (compacta) return criarAmbienteCompacto(estilo);
  const itens: ItemAmbiente[] = Array.from({length:12}, (_,i) => ({ id:`posto-${i}`, tipo:'posto', slot:i, x:[-5.4,-1.8,1.8,5.4][i%4], z:[-1.5,1.5,4.5][Math.floor(i/4)], giro:0 }));
  if(['industrial','minimalista','biblioteca'].includes(estilo)) itens.forEach((item,i)=>{item.x=[-5.5,0,5.5][i%3];item.z=[-1.5,.8,3.1,5.4][Math.floor(i/3)];});
  if(['tech','criativo','estudio'].includes(estilo)) itens.forEach((item,i)=>{item.giro=i%4<2?1:3;});
  if(estilo==='executivo') itens.forEach((item,i)=>{item.giro=Math.floor(i/4)===1?2:0;item.z=[-1.5,2,4.5][Math.floor(i/4)];});
  const add = (tipo: string,x: number,z: number,giro=0) => itens.push({id:`base-${itens.length}`,tipo,x,z,giro});
  add('mesa-reuniao',-6,-5.8); add('copa',4.5,-6.8); add('geladeira',7,-6.8);
  for (const x of [-7,-6,-5]) { add('cadeira-preta',x,-4.65); add('cadeira-preta',x,-6.95,2); }
  add('estante',.3,-7); add('planta-grande',-9.5,-6); add('planta-grande',9.5,7);
  add('sofa-grafite',-9.5,3,1); add('luminaria',-9.4,5); add('mesa-centro-redonda',-9.2,6.3);
  add('sofa-creme',9.5,3,3); add('estante',9.4,-6.8);
  if (estilo === 'industrial') { add('divisoria-madeira',-2.8,-5.7,1); add('locker',9.3,-3.5); }
  if (estilo === 'jardim') for (const x of [-9.3,-2.3,2.1,9.3]) add('samambaia',x,-3.6);
  if (estilo === 'minimalista') itens.splice(itens.findIndex(i=>i.tipo==='sofa-grafite'),3);
  if (estilo === 'executivo') { add('tapete-retangular',-6,-5.8); add('armario-baixo',9.4,-3.4,1); }
  if (estilo === 'tech') { add('divisoria-vidro',-2.8,-5.8,1); add('tv',9.3,-3.4); }
  if (estilo === 'criativo') { add('quadro',-2.7,-5.8,1); add('poltrona',9.2,-3.5); add('tapete-redondo',9.2,-3.5); }
  if (estilo === 'cafe') { add('mesa-redonda',3,-4.4); add('banqueta',1.7,-4.4); add('banqueta',4.3,-4.4); }
  if (estilo === 'biblioteca') for (const x of [-3,2.2]) add('estante',x,-7);
  if (estilo === 'estudio') { add('camera',9.1,-3.5); add('divisoria-acustica',-2.8,-5.8,1); add('caixa-som',1.9,-5.8); }
  return { versao:1, estilo, itens };
}
export function validarAmbiente(valor: unknown, tamanho: TamanhoSala = TAMANHO_GRANDE): valor is Ambiente {
  if (!valor || typeof valor !== 'object') return false;
  const a = valor as Ambiente;
  if (a.versao !== 1 || !ESTILOS.some(e=>e.id===a.estilo) || !Array.isArray(a.itens) || a.itens.length > MAX_ITENS) return false;
  const ids = new Set<string>(), slots = new Set<number>(), maxSlot = tamanho.maxPostos - 1;
  for (const i of a.itens) {
    if (!i || typeof i.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(i.id) || ids.has(i.id) || !movelDe(i.tipo)) return false;
    ids.add(i.id);
    if (![i.x,i.z,i.giro].every(Number.isFinite) || !Number.isInteger(i.giro) || i.giro<0 || i.giro>3) return false;
    if (i.tipo === 'posto') { if (!Number.isInteger(i.slot) || i.slot! < 0 || i.slot! > maxSlot || slots.has(i.slot!)) return false; slots.add(i.slot!); }
  }
  return slots.size <= tamanho.maxPostos && a.itens.every(i=>!erroPosicao(i,a.itens,tamanho));
}
export function lugarLivre(tipo: string, itens: ItemAmbiente[], tamanho: TamanhoSala = TAMANHO_GRANDE): ItemAmbiente | null {
  if (itens.length >= MAX_ITENS) return null;
  const item: ItemAmbiente = { id:crypto.randomUUID(),tipo,x:0,z:0,giro:0 };
  for (let z=tamanho.maxZ-.7; z>=tamanho.minZ+.5; z-=.5) for (let x=tamanho.minX+.7; x<=tamanho.maxX-.7; x+=.5) { item.x=Math.round(x*100)/100; item.z=Math.round(z*100)/100; if (!erroPosicao(item,itens,tamanho)) return {...item}; }
  return null;
}
