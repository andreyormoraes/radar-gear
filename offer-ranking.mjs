function offerDate(value){
 if(value.length===10)return value;
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}
function currentCoupon(o,today=offerDate(new Date().toISOString())){
 const coupon=o?.coupon;
 return coupon&&offerDate(o.date)<=today&&(coupon.validUntil||offerDate(o.date))>=today?coupon:null;
}
function effectivePrice(o,today){
 if(!o)return null;
 const coupon=currentCoupon(o,today);
 return coupon?.eligible?coupon.price:o.price;
}
function sellerKey(o){
 return [o.product||'',o.store.trim().toLowerCase(),(o.seller||'').trim().toLowerCase()].join('|');
}
function rankOffers(rows,today=offerDate(new Date().toISOString())){
 const keys=new Set();
 const latest=rows.filter(o=>!o.historical).sort((a,b)=>b.date.localeCompare(a.date)).filter(o=>{
  const key=sellerKey(o);
  if(keys.has(key))return false;
  keys.add(key);return true;
 });
 return latest.filter(o=>o.availability!=='out-of-stock').sort((a,b)=>offerDate(b.date).localeCompare(offerDate(a.date))||effectivePrice(a,today)-effectivePrice(b,today)||a.price-b.price);
}
