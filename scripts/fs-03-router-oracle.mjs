// Trusted pinned matcher API with application-owned literal data; no inspected app/config execution.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
if(!process.argv.includes('--run'))throw Error('Explicit --run required');
const root=path.resolve('node_modules/.fs03-experiments/vite8/node_modules/react-router');
assert.equal(JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version,'7.18.4');
const {matchRoutes}=await import(pathToFileURL(path.join(root,'dist/development/index.mjs')).href);
const cases=[
  {path:'/home',url:'/HOME/',params:{}},
  {path:'/users/:id',url:'/users/42',params:{id:'42'}},
  {path:'/users/:id',url:'/users/a%2Fb',params:{id:'a/b'}},
  {path:'/files/*',url:'/files/a/b',params:{'*':'a/b'}},
  {path:'/files/*',url:'/files',params:{'*':''}},
  {path:'/café',url:'/caf%C3%A9',params:{}},
];
const records=cases.map(c=>{const match=matchRoutes([{path:c.path}],c.url);assert(match);assert.deepEqual(match[0].params,c.params);return {...c,matched:true};});
const winners=matchRoutes([{path:'/:id',id:'param'},{path:'/home',id:'literal'}],'/home');assert.equal(winners[0].route.id,'literal');
const hash=value=>createHash('sha256').update(value).digest('hex');
writeFileSync('docs/fs-03/evidence/router-oracle.json',JSON.stringify({version:'7.18.4',policy:'Pinned trusted matchRoutes API; application-owned route data only; no inspected handlers/configuration run',records,outputHash:hash(JSON.stringify(records)),precedence:{oracleWinner:'literal',analysisPolicy:'precedence remains null; never infer winners from partial route sets'},unsupported:['optional segments','computed paths','custom factories','ambiguous router ownership','basename/options']},null,2)+'\n');
console.log(JSON.stringify({cases:records.length,outputHash:hash(JSON.stringify(records))}));
