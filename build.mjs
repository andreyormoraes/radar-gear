import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
mkdirSync('dist/server',{recursive:true});
const ranking=readFileSync('offer-ranking.mjs','utf8');
const html=readFileSync('index.html','utf8').replace('/* OFFER_RANKING */',()=>ranking);
const seed=JSON.parse(readFileSync('seed.json','utf8'));
writeFileSync('dist/server/index.js', 'const HTML='+JSON.stringify(html)+';\nconst seed='+JSON.stringify(seed)+';\n'+ranking+'\n'+readFileSync('import-product.mjs','utf8')+'\n'+readFileSync('identity.mjs','utf8')+'\n'+readFileSync('worker.mjs','utf8'));
