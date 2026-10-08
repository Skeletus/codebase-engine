import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {createComposedRefresh} from '../lib/engine/adapters/composed.ts';
import {AnalysisCoordinator} from '../lib/engine/coordinator.ts';
import {typescriptDriver} from '../lib/engine/adapters/typescript.ts';
import {pythonExtension} from '../lib/engine/adapters/python.ts';
import {djangoExtension} from '../lib/engine/adapters/django.ts';
const baseline=JSON.parse(readFileSync('tests/fixtures/framework-support/F06-django/sources.json','utf8').replace(/^\uFEFF/,'')) as Record<string,string>;
const records=[];
for(const [name,mounts,children,cbv]of [['route-below',99,101,false],['route-at',100,100,false],['route-above',100,101,false],['bindings-above',100,60,true]] as const){
  const input={...baseline,'project/urls.py':"from django.urls import path, include\nurlpatterns = ["+Array(mounts).fill("path('', include('app.urls'))").join(',')+"]\n",'app/urls.py':"from django.urls import path\nfrom .views import home\nurlpatterns = ["+Array(children).fill("path('x/', home"+(cbv?'.as_view()':'')+")").join(',')+"]\n",'app/views.py':cbv?"from django.views import View\nclass home(View):\n    def get(self, request):\n        pass\n    def post(self, request):\n        pass\n    def put(self, request):\n        pass\n    def patch(self, request):\n        pass\n    def delete(self, request):\n        pass\n    def options(self, request):\n        pass\n":"def home(request):\n    pass\n"};
  const root=mkdtempSync(path.join(os.tmpdir(),'cartograph FS06 expansion ')),started=performance.now();
  try{
    for(const [file,text]of Object.entries(input)){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);}
    let outcome:string,snapshotBytes=0,registrations=0;const host=path.resolve('src-tauri/target/debug/parser-host.exe'),django=djangoExtension({host});
    try{await new AnalysisCoordinator(typescriptDriver()).analyzeAsync(root,true,[pythonExtension({host}),{reset:()=>django.reset(),analyze:async(snapshot,selection,full)=>{try{return await django.analyze(snapshot,selection,full);}finally{snapshotBytes=Buffer.byteLength(JSON.stringify(snapshot));registrations=snapshot.analysis.registrations.length;}}}]);assert.equal(registrations,mounts*children);assert(snapshotBytes<=31*1024*1024);assert(!name.endsWith('above'),'Above-budget generation cannot publish');outcome='complete';}catch(error){if(error instanceof Error&&error.message==='resource-limit')outcome='typed resource-limit; no publication';else throw error;}
    if(!cbv){assert.equal(registrations,Math.min(mounts*children,10000));if(name==='route-below'||name==='route-at'){if(outcome!=='complete')assert(snapshotBytes>31*1024*1024,'Stricter snapshot bound must explain a below/at route refusal');}}
    writeFileSync(path.join(root,'project/urls.py'),"from django.urls import path\nfrom app.views import home\nurlpatterns = [path('', home"+(cbv?'.as_view()':'')+")]\n");const recovered=(await createComposedRefresh({host:path.resolve('src-tauri/target/debug/parser-host.exe')}).analyze(root,true)).snapshot;assert.equal(recovered.analysis.registrations.length,1);
    records.push({name,status:'PASS',requestedRoutes:mounts*children,requestedSourceCallbacks:cbv?mounts*children*6:0,outcome,snapshotBytes,registrations,elapsedMs:performance.now()-started,inputHash:createHash('sha256').update(JSON.stringify(input)).digest('hex')});console.log(JSON.stringify(records.at(-1)));
  }finally{assert(path.basename(root).startsWith('cartograph FS06 expansion '));rmSync(root,{recursive:true,force:true});}
}
writeFileSync('docs/fs-06/evidence/expansion-budget-probes.json',JSON.stringify({status:'PASS',scope:'Actual source expansion with combined immutable budgets; a smaller snapshot/deadline bound may dominate below/at route quota. Not independent proof of every ceiling.',records},null,2)+'\n');
