import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
if(!process.argv.includes('--run'))throw Error('Opt in with --run; developer utilities only');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixturePath='tests/fixtures/framework-support/F04-node-next/fixture.json';
const sources=JSON.parse(readFileSync(fixturePath,'utf8')).sources;
const require=createRequire(import.meta.url),records=[];
for(const [tuple,version,root]of [['next15','15.5.27','node_modules/.fs04-experiments/next15/node_modules/next'],['next16-preservation','16.3.6','node_modules/next'],['next16-patch','16.3.8','node_modules/.fs04-experiments/next16/node_modules/next']]) {
  const pkg=JSON.parse(readFileSync(root+'/package.json','utf8'));assert.equal(pkg.version,version);
  const {normalizeAppPath}=require(path.resolve(root+'/dist/shared/lib/router/utils/app-paths.js'));
  const {autoImplementMethods}=require(path.resolve(root+'/dist/server/route-modules/app-route/helpers/auto-implement-methods.js'));
  const {extractInterceptionRouteInformation}=require(path.resolve(root+'/dist/shared/lib/router/utils/interception-routes.js'));
  const {getRouteRegex}=require(path.resolve(root+'/dist/shared/lib/router/utils/route-regex.js'));
  const {getRouteMatcher}=require(path.resolve(root+'/dist/shared/lib/router/utils/route-matcher.js'));
  const {getPathMatch}=require(path.resolve(root+'/dist/shared/lib/router/utils/path-match.js'));
  const interceptions=['/feed/@modal/(..)photo/[id]','/feed/@modal/(.)photo/[id]','/feed/@modal/(...)photo/[id]'].map(input=>({input,...extractInterceptionRouteInformation(input)}));
  const matcherCases=['/base/api/items/[id]','/base/products/[...slug]','/base/shop/[[...slug]]'].map(pattern=>({pattern,tests:['/base/api/items/7','/base/api/items/7/','/BASE/api/items/7','/base/products/a/b','/base/shop','/base/shop/a'].map(destination=>({destination,matches:!!getRouteMatcher(getRouteRegex(pattern))(destination)}))}));
  const rewriteCases=['/base/old/:path*'].map(pattern=>({pattern,tests:['/base/old','/base/old/a/b','/BASE/old/a','/base/other'].map(destination=>({destination,matches:!!getPathMatch(pattern)(destination)}))}));
  // These inert sentinels are not fixture exports and are never called.
  const GET=()=>{throw Error('must not execute')},POST=()=>{throw Error('must not execute')};
  const methods=autoImplementMethods({GET,POST});assert.equal(methods.HEAD,GET);
  const routes=Object.keys(sources).filter(file=>file.startsWith('app/') && !file.includes('/_') && !file.includes('/(.') && /\/(?:page|route)\.tsx?$/.test(file)).map(file=>({file,pattern:('/base'+normalizeAppPath(file.slice(3).replace(/\.tsx?$/,''))).replace(/\/$/,'')}));
  const runtimeExecutable=tuple==='next15' ? path.resolve('node_modules/.fs03-experiments/vite7/node_modules/node/bin/node.exe') : process.execPath;
  const childCode=`const assert=require('node:assert/strict'),{normalizeAppPath}=require(${JSON.stringify(path.resolve(root+'/dist/shared/lib/router/utils/app-paths.js'))}),{autoImplementMethods}=require(${JSON.stringify(path.resolve(root+'/dist/server/route-modules/app-route/helpers/auto-implement-methods.js'))});const GET=()=>{throw Error('never invoke fixture logic')},methods=autoImplementMethods({GET});assert.equal(methods.HEAD,GET);console.log(JSON.stringify({node:process.versions.node,routes:${JSON.stringify(Object.keys(sources).filter(file=>file.startsWith('app/')&&!file.includes('/_')&&!file.includes('/(.')&&/\/(?:page|route)\.tsx?$/.test(file)))}.map(file=>({file,pattern:('/base'+normalizeAppPath(file.slice(3).replace(/\\.tsx?$/,''))).replace(/\\/$/,'')}))}));`;
  const child=JSON.parse(execFileSync(runtimeExecutable,['--eval',childCode],{encoding:'utf8',timeout:30000}));assert.deepEqual(child.routes,routes);assert.equal(child.node,tuple==='next15' ? '22.23.3' : '24.19.0');
  for(const profile of ['node-development','node-production','browser'])records.push({tuple,version,node:child.node,profile,fixtureHash:hash(readFileSync(fixturePath)),routes,interceptions,matcherCases,rewriteCases,derived:{HEAD:'GET',OPTIONS:typeof methods.OPTIONS},utilityHashes:['app-paths','interception-routes','route-regex','route-matcher','path-match'].map(name=>hash(readFileSync(root+'/dist/shared/lib/router/utils/'+name+'.js'))).concat(hash(readFileSync(root+'/dist/server/route-modules/app-route/helpers/auto-implement-methods.js'))),license:pkg.license,policy:'Pinned framework utilities over literal strings/inert sentinels; no application/config/plugin loaded'});
}
writeFileSync('docs/fs-04/evidence/next-oracles.json',JSON.stringify(records.map(r=>({...r,outputHash:hash(JSON.stringify(r.routes))})),null,2)+'\n');
const root=path.resolve('.next/fs04-node-oracle');mkdirSync(root,{recursive:true});
try {
  const nodeFixtureBytes=readFileSync('tests/fixtures/framework-support/F04-node-next/node.json'),files=JSON.parse(nodeFixtureBytes.toString()).sources;
  for(const [file,text]of Object.entries(files))writeFileSync(path.join(root,file),text);
  const code="import {createRequire} from 'node:module';import path from 'node:path';import {fileURLToPath} from 'node:url';const r=createRequire(import.meta.url);console.log(JSON.stringify({node:process.versions.node,importTargets:['./node.js','oracle-node/selected','#selected'].map(s=>path.basename(fileURLToPath(import.meta.resolve(s)))),requireTargets:['./cjs','./cjs.cjs'].map(s=>{try{return {specifier:s,target:path.basename(r.resolve(s))}}catch(e){return {specifier:s,error:e.code}}})}));";
  writeFileSync(path.join(root,'oracle.mjs'),code);
  const nodeRecords=[];
  for(const [version,executable]of [['22.23.3','node_modules/.fs03-experiments/vite7/node_modules/node/bin/node.exe'],['24.19.0',process.execPath]]){const output=JSON.parse(execFileSync(path.resolve(executable),[path.join(root,'oracle.mjs')],{encoding:'utf8',timeout:30000}));assert.equal(output.node,version);nodeRecords.push({...output,fixtureHash:hash(nodeFixtureBytes),sourceHash:hash(JSON.stringify(files)),scriptHash:hash(code),outputHash:hash(JSON.stringify(output)),policy:'Resolve names only; target modules never loaded or evaluated'});}
  writeFileSync('docs/fs-04/evidence/node-oracles.json',JSON.stringify(nodeRecords,null,2)+'\n');
  const erasureCode=`const {stripTypeScriptTypes}=require('node:module');const cases=[{source:'import type {X} from "./types.ts";export function f(value:number):number{return value}',accepted:true},{source:'export enum Color {Red,Blue}',accepted:false},{source:'class Item {constructor(public value:number){}}',accepted:false}];console.log(JSON.stringify({node:process.versions.node,cases:cases.map(({source,accepted})=>{try{const output=stripTypeScriptTypes(source,{mode:'strip'});return {source,expected:accepted,accepted:true,output}}catch(error){return {source,expected:accepted,accepted:false,error:error.code}}})}));`;
  const erasure=[];for(const executable of ['node_modules/.fs03-experiments/vite7/node_modules/node/bin/node.exe',process.execPath]){const output=JSON.parse(execFileSync(path.resolve(executable),['--eval',erasureCode],{encoding:'utf8',timeout:30000}));assert(output.cases.every(item=>item.accepted===item.expected));erasure.push({...output,scriptHash:hash(erasureCode),outputHash:hash(JSON.stringify(output)),policy:'Pinned Node strip utility parses controlled strings; stripped application text is never executed'});}
  writeFileSync('docs/fs-04/evidence/node-erasure-oracles.json',JSON.stringify(erasure,null,2)+'\n');
} finally {assert(root.endsWith(path.join('.next','fs04-node-oracle')));rmSync(root,{recursive:true,force:true});}
console.log('PASS: nine pinned Next utility profiles and two Node resolver oracles');
