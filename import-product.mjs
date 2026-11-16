const retailers={
 'kabum.com.br':'KaBuM!', 'pichau.com.br':'Pichau', 'amazon.com.br':'Amazon Brasil',
 'magazineluiza.com.br':'Magalu', 'terabyteshop.com.br':'TerabyteShop',
 'miranda.com.br':'Miranda', 'mercadolivre.com.br':'Mercado Livre',
 'www.asus.com':'ASUS', 'www.logitechg.com':'Logitech G', 'hyperx.com':'HyperX'
};
const knownBrands=['Logitech','HyperX','ASUS','Acer','AOC','Samsung','LG','Dell','Alienware','Corsair','Razer','Redragon','SteelSeries','BenQ','Gigabyte','MSI','Philips','Lenovo','HP','ViewSonic','Cooler Master','Fifine','JBL','Edifier','Keychron','Attack Shark','Fantech','Machenike','Philco','Duex','Bluecase','PCYes','Multilaser','Positivo'];
function linkedStore(url){
 return retailers[url.hostname]||retailers[url.hostname.replace(/^www\./,'')]||
   (url.hostname==='produto.mercadolivre.com.br'?'Mercado Livre':'');
}
function productLink(value){
 const url=new URL(secureUrl(value));
 url.hash='';
 for(const key of [...url.searchParams.keys()]){
  if(/^(utm_|gad_|gclid$|fbclid$|ref_)/i.test(key))url.searchParams.delete(key);
 }
 if(url.hostname.replace(/^www\./,'')==='amazon.com.br'){
  const asin=url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1];
  if(asin){url.pathname='/dp/'+asin.toUpperCase();url.search='';}
 }
 return url;
}
function codeCandidate(value){
 const code=typeof value==='string'?value.trim().toUpperCase():'';
 if(!/^[A-Z0-9][A-Z0-9._/-]{3,35}$/.test(code)||!/[A-Z]/.test(code)||!/\d/.test(code))return '';
 if(/^(?:\d+(?:HZ|DPI|FPS|MS|P|K|GB|TB|MM|CM|W)|FULLHD|[248]K|B0[A-Z0-9]{8}|[123]0[0-9]0[Pp])$/.test(code))return '';
 return code;
}
function slugCode(url,brand){
 const path=url.pathname.replace(/\/$/,'');
 const store=linkedStore(url);
 const tail=path.split('/').at(-1)||'';
 if(!brand||!((store==='KaBuM!'&&/^\/produto\/\d+\/[^/]+$/.test(path))||
    (store==='Pichau'&&/(monitor|mouse|teclado|headset|webcam|microfone|fone|mousepad)/i.test(tail))))return '';
 const segments=tail.split('-');
 const last=segments.at(-1);
 const logitech=brandKey(brand)==='logitech'&&tail.match(/(\d{3}-\d{6})$/);
 if(logitech)return logitech[1];
 const compound=tail.match(/(?:^|-)(hx-mc[0-9]+[a-z]?)$/i);
 return codeCandidate(compound?.[1]||last);
}
function textValue(value){
 if(typeof value==='string')return value;
 return typeof value?.name==='string'?value.name:'';
}
function detectBrand(title){
 return knownBrands.find(brand=>new RegExp('(?:^|[^a-z0-9])'+brand+'(?:[^a-z0-9]|$)','i').test(title))||'';
}
function categoryFor(title){
 const patterns=[['Mousepad',/mouse\s?pad/i],['Monitor',/\bmonitor\b/i],['Teclado',/teclado|keyboard/i],['Mouse',/\bmouse\b/i],['Headset e fone',/headset|fone|headphone/i],['Webcam',/webcam|câmera usb/i],['Microfone',/microfone|microphone/i],['Caixa de som',/caixa de som|speaker/i],['Controle',/controle|gamepad/i]];
 return patterns.find(([,pattern])=>pattern.test(title))?.[0]||'Outro periférico';
}
function findProduct(data){
 if(!data||typeof data!=='object')return null;
 if(Array.isArray(data))return data.map(findProduct).find(Boolean)||null;
 if([data['@type']].flat().some(type=>typeof type==='string'&&/(?:^|\/)Product$/.test(type)))return data;
 return findProduct(data['@graph'])||findProduct(data.mainEntity);
}
function metadata(html,name){
 for(const tag of html.matchAll(/<meta\b[^>]+>/gi)){
  const entries=[...tag[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)];
  const fields=Object.fromEntries(entries.map(([,key,value])=>[key.toLowerCase(),value]));
  if((fields.property||fields.name)?.toLowerCase()===name)return (fields.content||'').replaceAll('&amp;','&').replaceAll('&#39;',"'");
 }
 return '';
}
function extractPage(html,url,title){
 let data;
 for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{data=findProduct(JSON.parse(match[1].trim()));}catch{continue;}
  if(data)break;
 }
 const titleText=[data?.name,metadata(html,'og:title'),title,url.pathname.replaceAll('-',' ')].filter(Boolean).join(' ');
 const brand=textValue(data?.brand)||detectBrand(titleText);
 const explicit=textValue(data?.mpn);
 const numericLogitech=brand&&brandKey(brand)==='logitech'&&/^\d{3}-\d{6}$/.test(explicit)?explicit:'';
 const mpn=codeCandidate(explicit)||numericLogitech||codeCandidate(textValue(data?.model))||slugCode(url,brand);
 const imageValue=[data?.image].flat()[0];
 const rawImage=(typeof imageValue==='string'?imageValue:imageValue?.url||imageValue?.contentUrl)||metadata(html,'og:image');
 let image='';
 try{if(rawImage)image=secureUrl(new URL(rawImage,url).href);}catch{}
 const available=[data?.offers].flat().find(offer=>offer?.['@type']==='Offer'&&offer.priceCurrency==='BRL'&&/(?:InStock|LimitedAvailability)$/.test(offer.availability||'')&&Number(offer.price)>0&&Number(offer.price)<=1e6);
 return {brand,category:categoryFor(titleText),sku:mpn,image,price:available?Number(available.price):null,store:linkedStore(url),seller:textValue(available?.seller)};
}
async function importLinkedProduct(url,title,fetchPage=fetch){
 const fallback=extractPage('',url,title);
 if(!linkedStore(url))return {...fallback,sourceUnavailable:true};
 let target=url,timeout;
 try{
  const controller=new AbortController();
  timeout=setTimeout(()=>controller.abort(),6500);
  for(let i=0;i<3;i++){
   if(!linkedStore(target)||target.protocol!=='https:'||target.port||target.username||target.password)break;
   const response=await fetchPage(target,{signal:controller.signal,redirect:'manual',headers:{Accept:'text/html','Accept-Language':'pt-BR'}});
   if([301,302,303,307,308].includes(response.status)){
    const next=response.headers.get('Location');
    await response.body?.cancel();
    if(!next)break;
    target=new URL(next,target);
    continue;
   }
   if(!response.ok||!response.headers.get('Content-Type')?.includes('text/html')){await response.body?.cancel();break;}
   const reader=response.body.getReader();
   const decoder=new TextDecoder();
   let size=0,html='';
   try{
    while(size<1400000){
     const {value,done}=await reader.read();
     if(done)break;
     size+=value.byteLength;
     html+=decoder.decode(value,{stream:true});
    }
   }finally{await reader.cancel().catch(()=>{});}
   return extractPage(html,target,title);
  }
 }catch{}
 finally{if(timeout!==undefined)clearTimeout(timeout);}
 return {...fallback,sourceUnavailable:true};
}
