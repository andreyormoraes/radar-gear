const products={webcam:'960-001087',c920s:'960-001257',headset:'981-001262',superlight2:'910-006629'};
const defaultFeatured=['webcam','c920s','headset','superlight2'];
const productNames={webcam:'Logitech C922 Pro Stream',c920s:'Logitech C920s Pro HD preta',headset:'Logitech G Pro X 2 Lightspeed preto',superlight2:'Logitech G PRO X SUPERLIGHT 2 preto'};
const parseRows=rows=>rows.results.map(row=>({...JSON.parse(row.data),id:row.id}));
async function personal(db,id,kind){
 return parseRows(await db.prepare('SELECT id,data FROM account_records WHERE account=? AND kind=? ORDER BY rowid').bind(id,kind).all());
}
function writePersonal(db,viewer,kind,id,data){
 return db.prepare('INSERT INTO account_records(account,kind,id,data) VALUES (?,?,?,?) ON CONFLICT DO NOTHING').bind(viewer.id,kind,id,JSON.stringify(data)).run();
}
const defaultCep='';
function cep(value){
 const match=typeof value==='string'&&value.trim().match(/^([0-9]{5})-?([0-9]{3})$/);
 if(!match||match[1]+match[2]==='00000000')throw new Error('Informe um CEP brasileiro com 8 dígitos.');
 return match[1]+'-'+match[2];
}
const normalizeSku=value=>value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g,'');
const categories=['Mouse','Teclado','Headset e fone','Webcam','Microfone','Mousepad','Monitor','Caixa de som','Controle','Outro periférico'];
const legacyCategories={webcam:'Webcam',c920s:'Webcam',headset:'Headset e fone',superlight2:'Mouse'};
const brandKey=brand=>{const key=normalizeSku(brand.normalize('NFD')).toLowerCase();return key==='logitechg'?'logitech':key;};
function productMeta(p){
 return {...p,brand:p.brand||'Logitech',category:p.category||legacyCategories[p.id]||'Outro periférico',variant:p.variant||'',sku:p.sku||'',image:p.image||(brandKey(p.brand||'Logitech')==='hyperx'&&['4P4F8AA','HXMC004B'].includes(normalizeSku(p.sku||''))?'https://media.pichau.com.br/media/catalog/product/cache/74c1057f7991b4edb2bc7bdaa94de933/4/p/4p4f8aa1.jpg':'')};
}
function codeId(brand,sku){
 const brandId=brandKey(brand);
 return 'sku-'+(brandId==='logitech'?'':brandId+'~')+normalizeSku(sku).toLowerCase();
}
function researchId(p){return 'research-'+p.id.slice(4);}
function calendarDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const parsed=new Date(value+'T12:00:00Z');
 return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===value;
}
const panelAccount=viewer=>viewer.owner?'!owner':viewer.id;
async function archivedIds(db,viewer){return new Set((await personal(db,panelAccount(viewer),'archived')).map(p=>p.id));}
async function deadlines(db,viewer){
 return new Map((await personal(db,panelAccount(viewer),'deadline')).map(row=>[row.id,row.until]));
}
async function savePreference(db,viewer,kind,id,data){
 return db.prepare("INSERT INTO account_records(account,kind,id,data) VALUES (?,?,?,?) ON CONFLICT(account,kind,id) DO UPDATE SET data=excluded.data").bind(panelAccount(viewer),kind,id,JSON.stringify(data)).run();
}
async function requestedProducts(db){
 const rows=await db.prepare("SELECT p.id, p.data FROM account_records p WHERE p.kind='catalog' AND NOT EXISTS (SELECT 1 FROM account_records d WHERE d.account=p.account AND d.kind='deadline' AND d.id=p.id AND nullif(json_extract(d.data,'$.until'),'') < ?) AND NOT EXISTS (SELECT 1 FROM account_records a WHERE a.account=p.account AND a.kind='archived' AND a.id=p.id) ORDER BY p.rowid").bind(dateKey(new Date())).all();
 const unique=new Map();
 for(const row of parseRows(rows)){
  const {brand,category,sku,name,variant}=productMeta(row);
  if(!sku)continue;
  const id=codeId(brand,sku);
  if(!unique.has(id))unique.set(id,{id,brand,category,sku,name,variant});
 }
 return [...unique.values()];
}

async function catalog(db){
 const rows=await db.prepare('SELECT id, data FROM catalog ORDER BY rowid').all();
 return rows.results.map(row=>({...JSON.parse(row.data),id:row.id}));
}

const optionalString={type:'string'};
const offerSchema={
 type:'object',
 required:['product','store','url','price'],
 properties:{
  product:{type:'string',description:'ID do produto retornado por ler_radar'},store:{type:'string'},url:{type:'string'},price:{type:'number'},
  observedOn:{type:'string',description:'Data original de uma leitura histórica anterior à consulta (AAAA-MM-DD).'},seller:optionalString,source:optionalString,image:optionalString,cep:optionalString,shipping:{type:'number'},delivery:optionalString,installments:optionalString,
  advertised:{type:'number'},card:{type:'number'},
  buyUrl:{type:'string',description:'URL direta da página de compra, sem intermediário.'},availability:{enum:['in-stock','out-of-stock'],description:'Somente se o estoque puder ser verificado na página da loja.'},
  coupon:{type:'object',description:'Cupom confirmado desta oferta. eligible só para um desconto utilizável em geral, sem restrição de conta.',required:['price','source','eligible'],properties:{
   price:{type:'number'},source:optionalString,eligible:{type:'boolean'},code:optionalString,conditions:optionalString,validUntil:optionalString
  }}
 }
};
const mcpTools=[
 {name:'identificar_produto',description:'Confirme o código do fabricante de um cadastro pendente do proprietário, preservando os registros. Use apenas após verificar o modelo exato na fonte.',inputSchema:{type:'object',required:['product','sku'],properties:{product:{type:'string'},sku:{type:'string'}}}},
 {name:'ler_radar',description:'Leia o catálogo atualizado de produtos monitorados, ofertas, decisões e últimas consultas.',inputSchema:{type:'object',properties:{}}},
 {name:'registrar_consulta',description:'Salve uma consulta de preços para os produtos do catálogo. Informe cep em cada oferta com frete ou prazo. Registre ofertas somente com SKU, loja e preço verificáveis. Omita frete e prazo se não confirmados para o CEP. O mesmo dia e fonte são atualizados sem duplicação.',inputSchema:{type:'object',required:['offers','note'],properties:{offers:{type:'array',items:offerSchema,maxItems:80},note:{type:'string'}}}}
];
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const dateKey=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
function amount(value,min,required=false){
 if(value==null||value===''){if(!required)return null;throw new Error('Informe o preço.');}
 if(!['string','number'].includes(typeof value)||!Number.isFinite(Number(value))||Number(value)<min||Number(value)>1e6)throw new Error('Confira os valores em reais.');
 return Math.round(Number(value)*100)/100;
}
function secureUrl(input){
 const value=clean(input,700);
 if(!value.startsWith('https://'))throw new Error('Informe o link HTTPS da fonte.');
 const url=new URL(value);
 if(url.username||url.password)throw new Error('Use um link sem credenciais.');
 return url.href;
}
function product(value,registered){if(!Object.hasOwn(products,value)&&!registered.some(p=>p.id===value))throw new Error('Selecione um produto válido.');return value;}
function verifiedCoupon(coupon,price,date){
 if(!coupon)return null;
 const discounted=amount(coupon.price,.01,true);
 const validUntil=clean(coupon.validUntil,10);
 if(discounted>=price||typeof coupon.eligible!=='boolean'||(validUntil&&(!calendarDate(validUntil)||validUntil<offerDate(date))))throw new Error('Confira o valor e a validade do cupom.');
 return {price:discounted,source:secureUrl(coupon.source),eligible:coupon.eligible,code:clean(coupon.code,80),conditions:clean(coupon.conditions,240),validUntil};
}
function offer(o,date,registered){
 const store=clean(o.store,100),price=amount(o.price,.01,true);
 if(!store)throw new Error('Informe a loja ou vendedor.');
 return {product:product(o.product,registered),cep:o.cep?cep(o.cep):defaultCep,store,url:secureUrl(o.url),buyUrl:o.buyUrl?secureUrl(o.buyUrl):'',availability:['in-stock','out-of-stock'].includes(o.availability)?o.availability:'',price,coupon:verifiedCoupon(o.coupon,price,date),
  image:o.image?secureUrl(o.image):'',seller:clean(o.seller,100),source:o.source?secureUrl(o.source):'',shipping:amount(o.shipping,0),delivery:clean(o.delivery,80),
  installments:clean(o.installments,80),card:amount(o.card,.01),advertised:amount(o.advertised,.01),date};
}
async function readOwner(db){
 const keys=['offers','decisions','runs'];
 const snapshots=await db.batch(keys.map(key=>db.prepare('SELECT id, data FROM '+key)));
 const data=Object.fromEntries(keys.map((key,i)=>[key,[...(seed[key]||[]),...snapshots[i].results.map(row=>({...JSON.parse(row.data),id:row.id}))]]));
 data.catalog=await catalog(db);
 data.catalog=data.catalog.map(productMeta);
 data.products=[...Object.entries(products).map(([id,sku])=>productMeta({id,sku,name:productNames[id]})),...data.catalog];
 return data;
}
async function readFeatured(db,shared){
 const flags=await db.prepare('SELECT id, enabled FROM featured_products').all();
 const enabled=new Set(defaultFeatured);
 for(const row of flags.results){
  if(row.enabled)enabled.add(row.id);else enabled.delete(row.id);
 }
 return shared.products.filter(p=>enabled.has(p.id)).map(({id,name,sku,brand,category,variant,link})=>{
  const offers=shared.offers.filter(o=>o.product===id);
  const best=rankOffers(offers)[0];
  const offerDay=offerDate;
  const newest=best?offerDay(best.date):null;
  const prior=new Map();
  if(best){
   const cutoff=new Date(Date.parse(newest+'T12:00:00Z')-60*86400000).toISOString().slice(0,10);
   for(const item of offers){
    const date=offerDay(item.date);
    if(date<newest&&date>=cutoff)prior.set(date,Math.min(item.price,prior.get(date)??Infinity));
   }
  }
  const prices=[...prior.values()].sort((a,b)=>a-b), n=prices.length;
  const baseline=n>=3?(prices[Math.floor((n-1)/2)]+prices[Math.floor(n/2)])/2:null;
  const savings=best&&baseline?100*(baseline-best.price)/baseline:null;
  const priceHistory=offers.map(({price,date,store,seller,url,historical,installments,card,coupon,buyUrl,availability})=>({price,date,store,seller,url,historical,installments,card,coupon,buyUrl,availability}));
  return {id,name,sku,brand,category,variant,link,priceHistory,savings,price:effectivePrice(best),coupon:currentCoupon(best),date:best?.date??null,store:best?.store??null,url:best?.url??null};
 }).sort((a,b)=>(b.savings??-Infinity)-(a.savings??-Infinity)||(a.price==null)-(b.price==null));
}
async function read(db,viewer){
 const shared=await readOwner(db);
 const archived=await archivedIds(db,viewer);
 const deadline=await deadlines(db,viewer), today=dateKey(new Date());
 const profile=(await personal(db,panelAccount(viewer),'profile'))[0]||{};
 const withDeadline=p=>({...p,until:deadline.get(p.id)||'',trackingEnded:!!deadline.get(p.id)&&deadline.get(p.id)<today});
 const photos=await personal(db,panelAccount(viewer),'photo');
 const ownerHidden=viewer.owner?archived:await archivedIds(db,{owner:true});
 const featured=await readFeatured(db,{...shared,products:shared.products.filter(p=>!ownerHidden.has(p.id))});
 if(viewer.owner){
  const archivedProducts=shared.products.filter(p=>archived.has(p.id));
  shared.products=shared.products.filter(p=>!archived.has(p.id)).map(withDeadline);
  const monitoring=shared.products.filter(p=>!p.trackingEnded);
  const owned=new Set(monitoring.filter(p=>p.sku).map(p=>codeId(p.brand,p.sku)));
  const research=(await requestedProducts(db)).filter(p=>!owned.has(p.id)).map(p=>({...p,id:researchId(p)}));
  const matching=new Map(shared.products.filter(p=>p.sku).map(p=>[researchId({id:codeId(p.brand,p.sku)}),p.id]));
  const oldResearch=shared.offers.filter(o=>matching.has(o.product)).map(o=>({...o,product:matching.get(o.product)}));
  return {...shared,profile,monitoring,archived:archivedProducts,photos,offers:[...shared.offers.filter(o=>!archived.has(o.product)&&!o.product.startsWith("research-")),...oldResearch],decisions:shared.decisions.filter(o=>!archived.has(o.product)),research,researchHistory:shared.offers.filter(o=>o.product.startsWith("research-")),featured,viewer};
 }
 const [records,offers,decisions]=await Promise.all(['catalog','offers','decisions'].map(kind=>personal(db,viewer.id,kind)));
 const archivedProducts=records.filter(p=>archived.has(p.id)).map(productMeta);
 const catalog=records.filter(p=>!archived.has(p.id)).map(productMeta).map(withDeadline);
 const bySku=new Map(shared.products.filter(p=>p.sku).map(p=>[codeId(p.brand,p.sku),p.id]));
 const tracked=new Map();
 for(const p of catalog.filter(p=>p.sku)){
  tracked.set(researchId({id:codeId(p.brand,p.sku)}),p.id);
  const official=bySku.get(codeId(p.brand,p.sku));
  if(official)tracked.set(official,p.id);
 }
 const automatic=shared.offers.filter(o=>tracked.has(o.product)&&(!deadline.get(tracked.get(o.product))||(o.date.length===10?o.date:dateKey(o.date))<=deadline.get(tracked.get(o.product)))&&(o.historical||o.id.startsWith('seed-')||o.id.startsWith('consulta|')||o.id.startsWith('import|'))).map(o=>{
  const {id,product,price,date,store,url,historical,installments,card,advertised,image,seller,coupon,buyUrl,availability}=o;
  return {id,product:tracked.get(product),price,date,store,url,historical,installments,card,advertised,image,seller,coupon,buyUrl,availability};
 });
 return {catalog,profile,archived:archivedProducts,photos,offers:[...automatic,...offers.filter(o=>!archived.has(o.product))],decisions:decisions.filter(o=>!archived.has(o.product)),products:catalog,runs:[],featured,viewer};
}
function write(db,table,id,data,update=false){
 const conflict=update?' ON CONFLICT(id) DO UPDATE SET data=excluded.data':' ON CONFLICT(id) DO NOTHING';
 return db.prepare('INSERT INTO '+table+' (id,data) VALUES (?,?)'+conflict).bind(id,JSON.stringify(data));
}
async function recordRun(db,args){
 const date=new Date().toISOString(),key=dateKey(date), note=clean(args.note,650);
 if(!note||!Array.isArray(args.offers)||args.offers.length>80)throw new Error('Informe o resumo e até 80 ofertas verificadas.');
 const registered=(await catalog(db)).filter(p=>p.sku);
 const owner={owner:true};
 const [hidden,limits,requested]=await Promise.all([archivedIds(db,owner),deadlines(db,owner),requestedProducts(db)]);
 const research=requested.map(p=>({id:researchId(p)}));
 const active=new Set([...Object.keys(products),...registered.map(p=>p.id)].filter(id=>!hidden.has(id)&&(!limits.get(id)||limits.get(id)>=key)));
 for(const item of research)active.add(item.id);
 const eligible=args.offers.filter(o=>active.has(o.product));
 const offers=eligible.map(o=>{
  if(!o.observedOn)return offer(o,date,[...registered,...research]);
  if(!calendarDate(o.observedOn)||o.observedOn>=key)throw new Error('O histórico exige uma data válida anterior à consulta.');
  return {...offer({...o,shipping:null,delivery:'',coupon:null},o.observedOn,[...registered,...research]),historical:true};
 });
 const actions=offers.map(o=>write(db,'offers',[o.historical?'historico':'consulta',o.historical?o.date:key,o.product,o.store.toLowerCase(),o.seller.toLowerCase(),o.cep].join('|'),o,true));
 actions.push(write(db,'runs','consulta|'+key,{date,note},true));
 await db.batch(actions);
 return {date,offerCount:offers.length,skipped:args.offers.length-eligible.length,products,cep:defaultCep,offers};
}
async function identifyProduct(db,viewer,body){
   const sku=clean(body.sku,50).toUpperCase();
   if(!/^[A-Z0-9][A-Z0-9 ._/-]{2,49}$/.test(sku)||normalizeSku(sku).length<3)return json({error:'Confira o código do fabricante.'},400);
   const records=viewer.owner?await catalog(db):await personal(db,viewer.id,'catalog');
   const row=records.find(p=>p.id===body.product&&!p.sku);
   if(!row)return json({error:'Produto pendente não encontrado.'},404);
   if(records.some(p=>p.sku&&codeId(productMeta(p).brand,p.sku)===codeId(row.brand,sku))||
      (viewer.owner&&brandKey(row.brand)==='logitech'&&Object.values(products).some(code=>normalizeSku(code)===normalizeSku(sku))))return json({error:'Esse produto já está no Radar.'},409);
   const data=JSON.stringify({...row,sku});
   const statement=viewer.owner?
    db.prepare("UPDATE catalog SET data=? WHERE id=? AND coalesce(json_extract(data,'$.sku'),'')=''").bind(data,row.id):
    db.prepare("UPDATE account_records SET data=? WHERE account=? AND kind='catalog' AND id=? AND coalesce(json_extract(data,'$.sku'),'')=''").bind(data,viewer.id,row.id);
   if(!(await statement.run()).meta.changes)return json({error:'Atualize o painel e tente novamente.'},409);
   return json({saved:true});
  }
async function mcp(request,env){
 const {id,method,params}=await request.json();
 if(id==null)return new Response(null,{status:202});
 const reply=result=>json({jsonrpc:'2.0',id,result});
 if(method==='server/discover')return reply({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(method==='initialize')return reply({protocolVersion:params?.protocolVersion||'2026-07-28',serverInfo:{name:'radar-logitech',version:'1.0.0'},capabilities:{tools:{}}});
 if(method==='ping')return reply({});
 if(method==='tools/list')return reply({tools:mcpTools});
 if(method==='tools/call'){
  try{
   const name=params?.name;
   const viewer=await account(request,env);
   if(!viewer)throw new Error('Entre com sua conta para acessar o Radar.');
   if(['registrar_consulta','identificar_produto'].includes(name)&&!viewer.owner)throw new Error('A consulta compartilhada é reservada ao administrador.');
   if(name==='identificar_produto'){
    const response=await identifyProduct(env.DB,viewer,params.arguments||{});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error);
    return reply({content:[{type:'text',text:JSON.stringify(result)}]});
   }
   const value=name==='ler_radar'?await read(env.DB,viewer):name==='registrar_consulta'?await recordRun(env.DB,params.arguments||{}):null;
   if(value===null)throw new Error('Ferramenta inexistente.');
   if(viewer.id==='!job'&&name==='ler_radar'){
    const {monitoring,research,offers,researchHistory,runs}=value;
    return reply({content:[{type:'text',text:JSON.stringify({monitoring,research,offers,researchHistory,runs})}]});
   }
   return reply({content:[{type:'text',text:JSON.stringify(value)}]});
  }catch(error){console.error(error);return reply({isError:true,content:[{type:'text',text:error.message}]});}
 }
 return json({jsonrpc:'2.0',id,error:{code:-32601,message:'Método inexistente.'}});
}
export default {async fetch(request,env){
 const url=new URL(request.url),method=request.method;
 try{
  if(url.pathname==='/mcp'&&method==='POST')return await mcp(request,env);
  const viewer=await account(request,env);
  if(!viewer)return json({error:'Entre com sua conta para acessar o Radar.'},401);
  if(url.pathname==='/'&&method==='GET')return new Response(HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  if(url.pathname==='/api/radar'&&method==='GET')return json(await read(env.DB,viewer));
  if(url.pathname==='/api/featured'&&method==='POST'){
   if(!viewer.owner||request.headers.get('Origin')!==url.origin)return json({error:'Somente o administrador pode alterar os destaques.'},403);
   const body=await request.json();
   if(typeof body.enabled!=='boolean')return json({error:'Escolha se o produto deve aparecer nos destaques.'},400);
   let id;
   try{id=product(body.product,await catalog(env.DB));}catch(error){return json({error:error.message},400);}
   await env.DB.prepare('INSERT INTO featured_products(id,enabled) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled').bind(id,Number(body.enabled)).run();
   return json({saved:true});
  }
  if(url.pathname==='/api/consultas'&&method==='POST'){
   if(!viewer.owner)return json({error:'Somente o administrador pode salvar consultas compartilhadas.'},403);
   const origin=request.headers.get('Origin');
   if(origin&&origin!==url.origin)return json({error:'Origem inválida.'},403);
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Envie a consulta no formato JSON.'},415);
   try{return json(await recordRun(env.DB,await request.json()));}
   catch(error){return json({error:error.message},400);}
  }
  if(url.pathname==='/api/profile'&&method==='POST'){
   if(request.headers.get('Origin')!==url.origin)return json({error:'Abra o Radar para editar seu perfil.'},403);
   const body=await request.json(),name=clean(body.name,60);
   let destination;
   try{destination=cep(body.cep);}catch(error){return json({error:error.message},400);}
   if(!name)return json({error:'Informe o nome que você quer ver no Radar.'},400);
   await savePreference(env.DB,viewer,'profile','preferences',{name,cep:destination});
   return json({saved:true});
  }
  if(url.pathname==='/api/products/deadline'&&method==='POST'){
   if(request.headers.get('Origin')!==url.origin)return json({error:'Abra o Radar para editar o prazo.'},403);
   const body=await request.json(),until=body.until;
   if(until!==''&&!calendarDate(until))return json({error:'Escolha uma data válida.'},400);
   const records=viewer.owner?await catalog(env.DB):await personal(env.DB,viewer.id,'catalog');
   if(!(viewer.owner&&Object.hasOwn(products,body.product))&&!records.some(p=>p.id===body.product))return json({error:'Produto não encontrado no seu painel.'},404);
   await savePreference(env.DB,viewer,'deadline',body.product,{until});
   return json({saved:true});
  }
  if(url.pathname==='/api/products/photo'&&method==='POST'){
   if(request.headers.get('Origin')!==url.origin)return json({error:'Abra o painel para alterar a foto.'},403);
   const body=await request.json();
   const records=viewer.owner?await catalog(env.DB):await personal(env.DB,viewer.id,'catalog');
   if(!(viewer.owner&&Object.hasOwn(products,body.product))&&!records.some(p=>p.id===body.product))return json({error:'Produto não encontrado no seu painel.'},404);
   const account=panelAccount(viewer);
   let image;
   try{image=secureUrl(body.image);}catch{return json({error:'Cole um endereço HTTPS direto da imagem.'},400);}
   await env.DB.prepare("INSERT INTO account_records(account,kind,id,data) VALUES (?,'photo',?,?) ON CONFLICT(account,kind,id) DO UPDATE SET data=excluded.data").bind(account,body.product,JSON.stringify({image})).run();
   return json({saved:true});
  }
  if(url.pathname==='/api/products/archive'&&method==='POST'){
   if(request.headers.get('Origin')!==url.origin)return json({error:'Abra o painel para alterar o acompanhamento.'},403);
   const body=await request.json();
   if(typeof body.archived!=='boolean')return json({error:'Escolha se deseja arquivar ou restaurar.'},400);
   const records=viewer.owner?await catalog(env.DB):await personal(env.DB,viewer.id,'catalog');
   if(!(viewer.owner&&Object.hasOwn(products,body.product))&&!records.some(p=>p.id===body.product))return json({error:'Produto não encontrado no seu painel.'},404);
   const account=panelAccount(viewer);
   if(body.archived)await writePersonal(env.DB,{id:account},'archived',body.product,{});
   else await env.DB.prepare("DELETE FROM account_records WHERE account=? AND kind='archived' AND id=?").bind(account,body.product).run();
   return json({saved:true});
  }
  if(url.pathname==='/api/products/identify'&&method==='POST'){
   if(request.headers.get('Origin')!==url.origin)return json({error:'Abra o painel para identificar o produto.'},403);
   return identifyProduct(env.DB,viewer,await request.json());
  }
  if(url.pathname==='/api/products'&&method==='POST'){
   if(request.headers.get('Origin')!==url.origin)return json({error:'Abra o painel para cadastrar.'},403);
   const body=await request.json();
   const name=clean(body.name,90),variant=clean(body.variant,90);
   if(!name)return json({error:'Informe o nome do produto.'},400);
   let retailerUrl;
   try{if(body.link)retailerUrl=productLink(body.link);}catch{return json({error:'Cole um link HTTPS válido da loja.'},400);}
   const suppliedSku=clean(body.sku,50).toUpperCase();
   if(!suppliedSku&&!retailerUrl)return json({error:'Cole o link do produto para o Radar identificá-lo.'},400);
   let imported={};
   if(retailerUrl){
    try{imported=await importLinkedProduct(retailerUrl,name);}
    catch(error){console.warn('Importação da loja indisponível:',error?.name||'erro');}
   }
   const brand=clean(body.brand,45)||clean(imported.brand,45)||detectBrand(name)||'Marca a confirmar';
   const category=categories.includes(body.category)?body.category:imported.category||categoryFor(name);
   const sku=suppliedSku||imported.sku||'';
   const link=retailerUrl?.href||'';
   if(sku&&(!/^[A-Z0-9][A-Z0-9 ._/-]{2,49}$/.test(sku)||normalizeSku(sku).length<3))return json({error:'Confira o código do fabricante.'},400);
   if(viewer.owner&&brandKey(brand)==='logitech'&&Object.values(products).some(code=>normalizeSku(code)===normalizeSku(sku)))return json({error:'Esse produto já está no Radar.'},409);
   const records=viewer.owner?await catalog(env.DB):await personal(env.DB,viewer.id,'catalog');
   if(sku&&records.some(p=>p.sku&&codeId(productMeta(p).brand,p.sku)===codeId(brand,sku)))return json({error:'Esse produto já está no Radar.'},409);
   const identity=[brandKey(brand),name.toLowerCase(),variant.toLowerCase()];
   const digest=sku?null:await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(identity)));
   const id=sku?codeId(brand,sku):'pending-'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
   const data={name,brand,category,sku,variant,link,image:imported.image||''};
   const account=panelAccount(viewer);
   const productWrite=viewer.owner?write(env.DB,'catalog',id,data):
    env.DB.prepare("INSERT INTO account_records(account,kind,id,data) VALUES (?,'catalog',?,?) ON CONFLICT DO NOTHING").bind(account,id,JSON.stringify(data));
   const actions=[productWrite];
   const verified=sku&&imported.sku&&normalizeSku(sku)===normalizeSku(imported.sku)&&brandKey(brand)===brandKey(imported.brand||brand);
   const initialPrice=!!(verified&&imported.price&&imported.store);
   if(initialPrice){
    const date=new Date().toISOString();
    const initial={product:id,price:imported.price,store:imported.store,url:link,date,seller:imported.seller,image:imported.image||'',buyUrl:link,availability:'in-stock'};
    const key=['import',dateKey(date),id,imported.store].join('|');
    actions.push(viewer.owner?write(env.DB,'offers',key,initial,true):
     env.DB.prepare("INSERT INTO account_records(account,kind,id,data) VALUES (?,'offers',?,?) ON CONFLICT(account,kind,id) DO UPDATE SET data=excluded.data").bind(account,key,JSON.stringify(initial)));
   }
   const [result]=await env.DB.batch(actions);
   if(!result.meta.changes)return json({error:'Esse produto já está no seu Radar. Se ele foi removido, use Restaurar.'},409);
   return json({id,sku,hasImage:!!data.image,initialPrice},201);
  }
  if(['/api/offers','/api/decisions'].includes(url.pathname)&&method==='POST'){
   if(request.headers.get('Origin')!==url.origin)return json({error:'Abra o painel para salvar o registro.'},403);
   const o=await request.json(),date=new Date().toISOString();
   if(!/^[0-9a-f-]{36}$/i.test(o.id||''))return json({error:'Identificador de registro inválido.'},400);
   const table=url.pathname==='/api/offers'?'offers':'decisions';
   let value;
   const registered=viewer.owner?await catalog(env.DB):await personal(env.DB,viewer.id,'catalog');
   if(!viewer.owner&&!registered.some(p=>p.id===o.product))return json({error:"Selecione um produto do seu painel."},400);
   try{
    if(table==='offers')value=offer(o,date,registered);
    else{
     if(!['buy','wait'].includes(o.choice))throw new Error('Escolha uma decisão.');
     value={product:product(o.product,registered),choice:o.choice,note:clean(o.note,500),date};
    }
   }catch(error){return json({error:error.message},400);}
   if(viewer.owner)await write(env.DB,table,o.id,value).run();
   else await writePersonal(env.DB,viewer,table,o.id,value);
   return json({saved:true});
  }
 }catch(error){console.error(error);return json({error:'O painel não conseguiu acessar os registros. Tente novamente.'},500);}
 return new Response('Página não encontrada',{status:404});
}};
