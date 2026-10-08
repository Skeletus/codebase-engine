import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {traceCalls} from "../../lib/engine/behavior.ts";
import {createHash} from "node:crypto";
import {readWitnessEvidence} from "../../lib/engine/index.ts";
import type {CodeSnapshot} from "../../lib/engine/types.ts";
import {RepositoryRefresh} from "../../lib/engine/refresh.ts";
import {createComposedRefresh} from "../../lib/engine/adapters/composed.ts";
const sources=JSON.parse(readFileSync(new URL("../fixtures/framework-support/F06-django/sources.json",import.meta.url),"utf8").replace(/^\uFEFF/,"")) as Record<string,string>;
const qualificationHarnessHash=createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex');
async function fixture(change:Record<string,string>,run:(root:string)=>Promise<void>){const root=mkdtempSync(path.join(os.tmpdir(),"cartograph FS06 "));try{for(const [file,source]of Object.entries({...sources,...change})){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),source);}await run(root);}finally{assert(path.basename(root).startsWith("cartograph FS06 "));rmSync(root,{recursive:true,force:true});}}
const host=path.resolve("src-tauri/target/debug/parser-host.exe");
test('FS06 real Windows watch publishes complete settings and template edits and pause retains prior publication',async()=>fixture({'app/views.py':"from django.shortcuts import render\ndef home(request):\n    return render(request, 'page.html')\n",'templates/page.html':'initial'},async root=>{
  const driver=createComposedRefresh({host});const publications:CodeSnapshot[]=[];
  let release:(()=>void)|undefined;let hold=false;
  const statuses:string[]=[];
  const refresh=new RepositoryRefresh({analyze:()=>{throw Error('async only');},analyzeAsync:async full=>{const candidate=await driver.analyze(root,full);if(hold)await new Promise<void>(resolve=>{release=resolve;});return candidate;},publish:snapshot=>{publications.push(snapshot);},status:status=>{statuses.push(status.state+':'+status.message);},debounceMs:100,auditMs:30000});
  const until=async(predicate:()=>boolean)=>{const deadline=performance.now()+20000;while(!predicate()){assert(performance.now()<deadline,'watch publication deadline');await new Promise(resolve=>setTimeout(resolve,25));}};
  try{
    await refresh.runAsync(true);refresh.start();
    writeFileSync(path.join(root,'templates/page.html'),'updated café 😀\r\n');await until(()=>publications.length>=2);refresh.pause();
    assert.deepEqual(publications.at(-1),(await createComposedRefresh({host}).analyze(root,true)).snapshot);
    refresh.start();const count=publications.length;writeFileSync(path.join(root,'project/settings.py'),sources['project/settings.py']+'\n# settings changed\n');await until(()=>publications.length>count);refresh.pause();
    assert.deepEqual(publications.at(-1),(await createComposedRefresh({host}).analyze(root,true)).snapshot);
    // Source, topology and qualification metadata edits use the same complete
    // publication path. Watchers are paused for independent fresh comparisons.
    for(const [file,text]of [['app/service.py','def serve():\n    return 42\n'],['app/newmodel.py','from django.db import models\nclass Added(models.Model):\n    value = models.IntegerField()\n'],['app/urls.py',"from django.urls import path\nfrom .views import home\napp_name = 'changed'\nurlpatterns = [path('changed/', home, name='changed')]\n"],['pyproject.toml',sources['pyproject.toml'].replace('5.2.18','5.2.17')],['pyproject.toml',sources['pyproject.toml']]] as const){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);await refresh.runAsync(false);assert.deepEqual(publications.at(-1),(await createComposedRefresh({host}).analyze(root,true)).snapshot);}
    rmSync(path.join(root,'app/newmodel.py'));await refresh.runAsync(false);assert.deepEqual(publications.at(-1),(await createComposedRefresh({host}).analyze(root,true)).snapshot);
    refresh.pause();const prior=publications.at(-1),before=publications.length;hold=true;
    const pending=refresh.runAsync(true);await until(()=>!!release);refresh.pause();release!();await assert.rejects(pending,/unstable_generation/);assert.equal(publications.length,before);assert.equal(publications.at(-1),prior);
    hold=false;await refresh.runAsync(true);assert.deepEqual(publications.at(-1),(await createComposedRefresh({host}).analyze(root,true)).snapshot);
  }finally{release?.();refresh.close();writeFileSync('docs/fs-06/evidence/watch-statuses.json',JSON.stringify(statuses,null,2)+'\n');}
}));
type OracleRoute={pattern:string;name:string;actions:Record<string,string>;rootMethods:string[]|null};
type QualificationOracle={tuple:string;status:string;profile:string;oracleScriptHash:string;result:{python:string;django:string;drf:string;routers:{router:string;useRegexPath:boolean;trailingSlash:boolean;routes:OracleRoute[]}[];converters:{converter:string;pattern:string;url:string;matched:boolean;trailingSlash:boolean}[];decorators:{decorator:string;async:boolean;methods:string[];isAsync:boolean}[];suffixes:{regex:boolean;required:boolean;allowed:string[]|null;patterns:string[]}[];includes:{declaredApp:string|null;namespace:string|null;name:string}[]}};
const qualificationOracles=JSON.parse(readFileSync(new URL('../../docs/fs-06/evidence/framework-oracles.json',import.meta.url),'utf8')) as QualificationOracle[];
const qualificationTuples={django52:sources['pyproject.toml'],django60:'[project]\nname="controlled-django"\nrequires-python="==3.13.16"\ndependencies=["Django==6.0.9", "djangorestframework==3.17.2"]\n'};
async function qualifyCase(tuple:keyof typeof qualificationTuples,group:string,id:string,change:Record<string,string>,assertions:(snapshot:CodeSnapshot)=>void){
  const input={...sources,...change,'pyproject.toml':qualificationTuples[tuple]};
  await fixture(input,async root=>{
    const started=performance.now();
    const driver=createComposedRefresh({host}),snapshot=(await driver.analyze(root,true)).snapshot;
    assertions(snapshot);assert.deepEqual((await driver.analyze(root,false)).snapshot,snapshot);
    for(const fact of [...snapshot.analysis.registrations,...snapshot.analysis.bindings])for(const witness of fact.witnesses)assert.equal(readWitnessEvidence(snapshot,witness).state,witness.role==='framework-rule'?'rule':'current');
    const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
    mkdirSync('docs/fs-06/evidence/qualification',{recursive:true});
    writeFileSync(`docs/fs-06/evidence/qualification/${tuple}-${group}-${id}.json`,JSON.stringify({status:'PASS',tuple,testHash:qualificationHarnessHash,oracleProgramHash:qualificationOracles.find(row=>row.tuple===tuple)?.oracleScriptHash,profile:'static-python-declared-environment',extractor:'django/fs-06/1',group,id,resources:{sourceBytes:Object.values(input).reduce((sum,text)=>sum+Buffer.byteLength(text),0),largestFileBytes:Math.max(...Object.values(input).map(text=>Buffer.byteLength(text))),snapshotBytes:Buffer.byteLength(JSON.stringify(snapshot)),elapsedMs:performance.now()-started,rssBytes:process.memoryUsage().rss,outcome:'complete generation; all framework witnesses current',workerCommitLimitBytes:536870912,workerFileDeadlineMs:2000},inputHash:hash(JSON.stringify(Object.entries(input).sort())),outputHash:hash(JSON.stringify({analysis:snapshot.analysis,behavior:snapshot.behavior,relationships:snapshot.relationships,files:snapshot.files})),variants:snapshot.analysis.variants.filter(v=>v.resolverId==='django-static').map(v=>v.id),facts:{registrations:snapshot.analysis.registrations.length,bindings:snapshot.analysis.bindings.length},gaps:[...new Set(snapshot.analysis.gaps.map(g=>g.reason))].sort(),checks:['semantic assertions','all witnesses current','full/incremental equivalence']},null,2)+'\n');
  });
}
test("FS06 literal routing keeps order, namespaces, distinct registrations and framework calls separate",async()=>fixture({},async root=>{
  const driver=createComposedRefresh({host});const first=(await driver.analyze(root,true)).snapshot;
  const routes=first.analysis.registrations.filter(r=>r.conditions.includes("settings:project/settings.py"));
  assert.deepEqual(routes.map(r=>r.rawPattern),["/","/items/<int:pk>/","/nested/hello/","/nested/hello/"]);
  assert.deepEqual(routes.map(r=>r.precedence),[0,1,2,3]);assert.equal(new Set(routes.map(r=>r.id)).size,4);
  assert(routes[2].conditions.includes("url-name:app:hello"));assert(routes[2].prefixWitnesses.some(w=>w.role!=="framework-rule"&&w.site.file==="project/urls.py"));
  assert.deepEqual(routes[0].methodState,{state:"all",values:[]});assert.deepEqual(routes[1].methodState,{state:"known",values:["GET","HEAD","OPTIONS"]});
  const dispatch=first.analysis.bindings.find(b=>b.sourceId===routes[1].id&&b.kind==="lifecycle");assert(dispatch);assert(traceCalls(first,dispatch.targetId).calls.some(call=>first.behavior.declarations.find(d=>d.id===call.target)?.name==="serve"));
  assert.equal(first.behavior.relations.filter(r=>r.relation==="calls"&&r.site.file==="app/views.py").length,2);
  assert.deepEqual((await driver.analyze(root,false)).snapshot,first);
}));
test("FS06 source sentinels are never executed and similarly named APIs cannot register URLs",async()=>fixture({"project/urls.py":"def path(*args, **kwargs):\n    raise RuntimeError('EXECUTION_SENTINEL')\nurlpatterns = [path('fake/', other)]\n"},async root=>{
  const first=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
  assert.equal(first.analysis.registrations.length,0);assert(first.files.some(f=>f.path==="project/urls.py"));
}));
test("FS06 repeated mounts at identical prefixes retain source-backed distinct IDs",async()=>fixture({"project/urls.py":"from django.urls import path, include\nurlpatterns = [path('same/', include('app.urls')), path('same/', include('app.urls'))]\n"},async root=>{
  const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
  const routes=snapshot.analysis.registrations;assert.equal(routes.length,4);assert.equal(new Set(routes.map(r=>r.id)).size,4);
  assert(routes.every(r=>r.prefixWitnesses.filter(w=>w.role==="registration").length===1));
}));
for(const [tuple,metadata]of Object.entries({django52:sources["pyproject.toml"],django60:'[project]\nname="controlled-django"\nrequires-python="==3.13.16"\ndependencies=["Django==6.0.9", "djangorestframework==3.17.2"]\n'})){
  test(`FS06 ${tuple} local C3 mixin override and custom dispatch boundary`,async()=>fixture({"pyproject.toml":metadata,"app/views.py":"from django.views import View\nfrom .service import serve\nclass GetMixin:\n    def get(self, request):\n        serve()\nclass ItemView(GetMixin, View):\n    def post(self, request):\n        serve()\ndef home(request):\n    serve()\nclass Custom(View):\n    def dispatch(self, request):\n        serve()\n","project/urls.py":"from django.urls import path\nfrom app.views import ItemView, Custom\nurlpatterns = [path('good/', ItemView.as_view()), path('custom/', Custom.as_view())]\n"},async root=>{
    const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
    assert.deepEqual(snapshot.analysis.registrations[0].methodState,{state:"known",values:["GET","HEAD","OPTIONS","POST"]});
    assert.equal(snapshot.analysis.registrations[0].handlerId,null);
    assert.deepEqual(snapshot.analysis.registrations[1].methodState,{state:"unknown",values:[]});
    assert.equal(snapshot.analysis.registrations[1].handlerId,null);
    const targets=snapshot.analysis.bindings.filter(b=>b.sourceId===snapshot.analysis.registrations[0].id).map(b=>snapshot.behavior.declarations.find(d=>d.id===b.targetId)?.name);
    assert(targets.includes("get"));assert(targets.includes("post"));
  }));
  test(`FS06 ${tuple} DRF api_view methods preserve external OPTIONS`,async()=>fixture({"pyproject.toml":metadata,"app/views.py":"from rest_framework.decorators import api_view\nfrom .service import serve\n@api_view(['GET'])\ndef home(request):\n    serve()\n","project/urls.py":"from django.urls import path\nfrom app.views import home\nurlpatterns = [path('api/', home)]\n"},async root=>{
    const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;const route=snapshot.analysis.registrations[0];
    assert.deepEqual(route.methodState,{state:"known",values:["GET","OPTIONS"]});assert.equal(route.handlerId,null);
    assert(snapshot.analysis.bindings.some(b=>b.sourceId===route.id&&b.witnesses.some(w=>w.role==="framework-rule"&&w.ruleId==="cbv-method:GET")));
  }));
  test(`FS06 ${tuple} path-mode SimpleRouter list/detail/custom action declarations`,async()=>fixture({"pyproject.toml":metadata,"app/views.py":"from rest_framework.viewsets import ViewSet\nfrom rest_framework.decorators import action\nfrom .service import serve\nclass Items(ViewSet):\n    def list(self, request):\n        serve()\n    def retrieve(self, request, pk):\n        serve()\n    @action(detail=False, methods=['post'])\n    def refresh(self, request):\n        serve()\n","project/urls.py":"from rest_framework.routers import SimpleRouter\nfrom app.views import Items\nrouter = SimpleRouter(use_regex_path=False)\nrouter.register('items', Items, basename='item')\nurlpatterns = router.urls\n"},async root=>{
    const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;const routes=snapshot.analysis.registrations;
    assert.deepEqual(routes.map(r=>r.rawPattern),["/items/","/items/refresh/","/items/<str:pk>/"]);
    assert.deepEqual(routes.map(r=>r.methodState?.values),[["GET","HEAD","OPTIONS"],["OPTIONS","POST"],["GET","HEAD","OPTIONS"]]);
    assert(routes.every(r=>r.matcher.state==="supported"&&r.handlerId===null));
    assert(snapshot.analysis.bindings.some(b=>b.sourceId===routes[0].id&&b.witnesses.some(w=>w.role==="framework-rule"&&w.ruleId.includes("drf-action-method:HEAD:list"))));
    assert.equal(snapshot.analysis.bindings.filter(b=>b.kind==="lifecycle"&&routes.some(r=>r.id===b.sourceId)).length,3);
  }));
  test(`FS06 ${tuple} DefaultRouter path-mode suffix declarations preserve unsupported matchers and external root`,async()=>fixture({"pyproject.toml":metadata,"app/views.py":"from rest_framework.viewsets import ViewSet\nclass Items(ViewSet):\n    def list(self, request):\n        pass\n    def retrieve(self, request, pk):\n        pass\n","project/urls.py":"from rest_framework.routers import DefaultRouter\nfrom app.views import Items\nrouter = DefaultRouter(use_regex_path=False)\nrouter.register('items', Items, basename='item')\nurlpatterns = router.urls\n"},async root=>{
    const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
    const routes=snapshot.analysis.registrations;
    assert.deepEqual(routes.map(r=>r.rawPattern),['/items/','/items<drf_format_suffix:format>','/items/<str:pk>/','/items/<str:pk><drf_format_suffix:format>','/','/<drf_format_suffix:format>']);
    assert(routes.every(r=>r.handlerId===null));
    assert.deepEqual(routes.map(r=>r.matcher.state),['supported','unsupported','supported','unsupported','supported','unsupported']);
    assert(routes.every(r=>JSON.stringify(r.methodState)===JSON.stringify({state:'known',values:['GET','HEAD','OPTIONS']})));
    assert(!snapshot.analysis.bindings.some(b=>routes.slice(-2).some(r=>r.id===b.sourceId)));
    assert(routes.every(r=>r.witnesses.some(w=>w.role==='registration')));
  }));
  test(`FS06 ${tuple} manager and QuerySet declarations never establish custom runtime dispatch`,async()=>fixture({"pyproject.toml":metadata,"app/models.py":"from django.db import models\nclass ItemQuerySet(models.QuerySet):\n    def active(self):\n        return self.filter(active=True)\nclass ItemManager(models.Manager):\n    def get_queryset(self):\n        return ItemQuerySet(self.model)\nclass Item(models.Model):\n    objects = models.Manager()\n    custom = ItemManager()\n","app/views.py":"from .models import Item\ndef home(request):\n    return Item.custom.active()\n"},async root=>{
    const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
    const rules=snapshot.analysis.bindings.flatMap(b=>b.witnesses.filter(w=>w.role==='framework-rule').map(w=>w.ruleId));
    assert(rules.includes('orm-class-declaration:django.db.models.QuerySet:no-runtime-dispatch'));
    assert(rules.includes('orm-class-declaration:django.db.models.Manager:no-runtime-dispatch'));
    assert(rules.includes('standard-manager-declaration:no-query-execution'));
    assert(rules.some(r=>r==='orm-method-declaration:custom-dispatch-unresolved'));
    assert(snapshot.analysis.gaps.some(g=>g.reason==='custom-resolver'));
    assert(!rules.some(r=>r.startsWith('orm-intent:active:')));
  }));
  test(`FS06 ${tuple} all pinned APIView and generic CBV classes retain method-specific external boundaries`,async()=>{
    const records=JSON.parse(readFileSync(new URL('../../docs/fs-06/evidence/framework-oracles.json',import.meta.url),'utf8')) as {tuple:string;status:string;result:{framework:{name:string;httpMethods:string[]}[]}}[];
    const record=records.find(r=>r.tuple===tuple);assert(record&&record.status==='PASS');
    const classes=record.result.framework.filter(c=>!c.name.startsWith('rest_framework.viewsets.'));
    assert.equal(classes.length,15);
    const views=classes.map((c,index)=>{const parts=c.name.split('.'),name=parts.pop()!,modulePath=parts.join('.');return `from ${modulePath} import ${name} as Base${index}\nclass Local${index}(Base${index}):\n    def get(self, request):\n        return serve()\n`;}).join('\n');
    const urls="from django.urls import path\nfrom app.views import "+classes.map((_,i)=>'Local'+i).join(', ')+"\nurlpatterns = ["+classes.map((_,i)=>`path('${i}/', Local${i}.as_view())`).join(', ')+"]\n";
    await fixture({'pyproject.toml':metadata,'app/views.py':'from .service import serve\n'+views,'project/urls.py':urls},async root=>{
      const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
      assert.equal(snapshot.analysis.registrations.length,classes.length);
      for(const [index,c]of classes.entries()){
        const route=snapshot.analysis.registrations[index];
        assert.deepEqual(route.methodState,{state:'known',values:[...new Set([...c.httpMethods,'GET','HEAD'])].sort()});
        assert.equal(route.handlerId,null);
        const bindings=snapshot.analysis.bindings.filter(b=>b.sourceId===route.id);
        assert(bindings.some(b=>b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId==='cbv-method:GET')));
        assert(!bindings.some(b=>b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId==='cbv-method:OPTIONS')));
      }
    });
  });
}
test("FS06 templates preserve literal lookup and named URL witnesses without executing render",async()=>fixture({"app/views.py":"from django.shortcuts import render\ndef home(request):\n    return render(request, 'page.html')\n","project/urls.py":"from django.urls import path\nfrom app.views import home\nurlpatterns = [path('', home, name='home')]\n","templates/page.html":"{% extends 'base.html' %}{% block content %}{% include 'part.html' %}{% url 'home' %}{% endblock %}","templates/base.html":"{% block content %}{% endblock %}","templates/part.html":"hello"},async root=>{
  const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
  assert.deepEqual(snapshot.analysis.resources.filter(r=>r.path.endsWith('.html')).map(r=>r.path).sort(),['templates/base.html','templates/page.html','templates/part.html']);
  assert(snapshot.analysis.bindings.some(b=>b.kind==="asset"&&b.targetId==="templates/page.html"));
  assert(snapshot.analysis.bindings.some(b=>b.sourceId==="templates/page.html"&&b.targetId===snapshot.analysis.registrations[0].id));
  assert(snapshot.analysis.bindings.some(b=>b.sourceId==="templates/page.html"&&b.targetId==="templates/base.html"));
}));
test("FS06 models, ORM intent, signals and admin remain declared framework relationships",async()=>fixture({"app/models.py":"from django.db import models\nclass Item(models.Model):\n    name = models.CharField(max_length=30)\n    parent = models.ForeignKey('self', on_delete=models.CASCADE)\n","app/views.py":"from .models import Item\nfrom django.db.models.signals import post_save\nfrom django.dispatch import receiver\nfrom django.contrib import admin\ndef home(request):\n    return Item.objects.filter(name='x')\n@receiver(post_save)\ndef saved(sender, **kwargs):\n    pass\npost_save.connect(saved)\nadmin.site.register(Item)\n","project/urls.py":"from django.urls import path\nfrom app.views import home\nurlpatterns = [path('', home)]\n"},async root=>{
  const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
  const rules=snapshot.analysis.bindings.flatMap(b=>b.witnesses.filter(w=>w.role==="framework-rule").map(w=>w.ruleId));
  assert(rules.some(r=>r.startsWith('model-field:CharField')));assert(rules.some(r=>r.startsWith('model-relationship:ForeignKey')));
  assert(rules.some(r=>r.includes('orm-intent:filter:lazy-queryset')));assert(rules.some(r=>r.startsWith('signal-receiver:')));assert(rules.some(r=>r.startsWith('signal-connect:')));assert(rules.includes('admin-register-declaration'));
  assert(!snapshot.relationships.some(r=>r.source.endsWith('models.py')&&r.target.endsWith('.html')));
}));
test("FS06 explicit settings variant follows bounded named literal inheritance and missing selection stays unresolved",async()=>fixture({"project/base.py":sources['project/settings.py'],"project/selected.py":"from .base import ROOT_URLCONF, INSTALLED_APPS, MIDDLEWARE, TEMPLATES\n"},async root=>{
  const snapshot=(await createComposedRefresh({host,settingsModules:{'.':['project.selected']}}).analyze(root,true)).snapshot;
  const routes=snapshot.analysis.registrations;assert.equal(routes.length,4);
  assert(routes.every(r=>r.conditions.includes('settings:project/selected.py')));
  assert(routes[0].witnesses.some(w=>w.role==='configuration'&&w.site.file==='project/base.py'));
  assert(routes[0].witnesses.some(w=>w.role==='configuration'&&w.site.file==='project/selected.py'));
  const missing=(await createComposedRefresh({host,settingsModules:{'.':['project.missing']}}).analyze(root,true)).snapshot;
  assert.equal(missing.analysis.registrations.length,0);assert(missing.analysis.gaps.some(g=>g.reason==='missing-metadata'));
}));
test("FS06 wildcard and computed inherited settings never become verified routes",async()=>fixture({"project/base.py":sources['project/settings.py'],"project/selected.py":"from .base import *\nROOT_URLCONF = globals()['ROOT_URLCONF']\n"},async root=>{
  const snapshot=(await createComposedRefresh({host,settingsModules:{'.':['project.selected']}}).analyze(root,true)).snapshot;
  assert.equal(snapshot.analysis.registrations.length,0);assert(snapshot.analysis.gaps.some(g=>g.reason==='dynamic-expression'));
}));
test("FS06 repeated mounted CBV bindings retain each registration source",async()=>fixture({"project/urls.py":"from django.urls import path, include\nurlpatterns = [path('same/', include('app.urls')), path('same/', include('app.urls'))]\n","app/urls.py":"from django.urls import path\nfrom .views import ItemView\nurlpatterns = [path('item/', ItemView.as_view())]\n"},async root=>{
  const driver=createComposedRefresh({host});const snapshot=(await driver.analyze(root,true)).snapshot;
  assert.equal(snapshot.analysis.registrations.length,2);const bindings=snapshot.analysis.bindings.filter(b=>b.kind==='lifecycle');
  for(const route of snapshot.analysis.registrations)assert(bindings.some(b=>b.sourceId===route.id));
  assert.equal(new Set(bindings.map(b=>b.id)).size,bindings.length);assert.deepEqual((await driver.analyze(root,false)).snapshot,snapshot);
}));
test("FS06 exact oracle tuples and shared metadata are required, with no qualification badge from syntax alone",async()=>{
  const records=JSON.parse(readFileSync(new URL('../../docs/fs-06/evidence/framework-oracles.json',import.meta.url),'utf8')) as {tuple:string;status:string;oracleScriptHash:string;outputHash:string;result:{python:string;django:string;drf:string;cbvMethods:string[];apiViewMethods:string[]}}[];
  assert.deepEqual(records.map(r=>r.tuple),['django52','django60']);
  for(const [index,tuple]of [['3.12.15','5.2.18','3.16.1'],['3.13.16','6.0.9','3.17.2']].entries()){
    const record=records[index];assert.equal(record.status,'PASS');assert.deepEqual([record.result.python,record.result.django,record.result.drf],tuple);
    assert.match(record.oracleScriptHash,/^[0-9a-f]{64}$/);assert.match(record.outputHash,/^[0-9a-f]{64}$/);
    assert.deepEqual(record.result.cbvMethods.sort(),['GET','HEAD','OPTIONS']);assert.deepEqual(record.result.apiViewMethods.sort(),['GET','OPTIONS']);
  }
  await fixture({},async root=>{const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;assert(snapshot.analysis.capabilities.filter(c=>c.capabilityId==='django-drf-static').every(c=>c.state==='partial'&&c.qualificationRecord===null));});
});
test("FS06 unsupported regex/converters, stacked decorators and dynamic templates retain typed uncertainty",async()=>fixture({"project/urls.py":"from django.urls import path, re_path\nfrom app.views import home\nurlpatterns = [path('item/<custom:pk>/', home), re_path(r'^item/(?P<pk>.+)/$', home)]\n","app/views.py":"from django.views.decorators.http import require_GET, require_POST\nfrom django.shortcuts import render\n@require_GET\n@require_POST\ndef home(request):\n    return render(request, request.template)\n"},async root=>{
  const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
  assert(snapshot.analysis.registrations.every(r=>r.matcher.state==='unsupported'&&r.methodState?.state==='unknown'&&r.handlerId===null));
  assert(snapshot.analysis.gaps.some(g=>g.reason==='unknown-method'));assert(snapshot.analysis.gaps.some(g=>g.reason==='dynamic-expression'));
  assert(!snapshot.analysis.bindings.some(b=>b.kind==='asset'));
}));
test("FS06 middleware hooks, app-ready and command ownership are conditional declarations",async()=>fixture({"project/settings.py":sources['project/settings.py'].replace('MIDDLEWARE = []',"MIDDLEWARE = ['app.middleware.Guard']"),"app/middleware.py":"class Guard:\n    def __call__(self, request):\n        return None\n    def process_view(self, request, callback, args, kwargs):\n        return None\n","app/apps.py":"from django.apps import AppConfig\nclass App(AppConfig):\n    def ready(self):\n        pass\n","app/management/__init__.py":"","app/management/commands/__init__.py":"","app/management/commands/check.py":"from django.core.management.base import BaseCommand\nclass Command(BaseCommand):\n    def handle(self, *args, **kwargs):\n        pass\n"},async root=>{
  const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
  const rules=snapshot.analysis.bindings.flatMap(b=>b.witnesses.filter(w=>w.role==='framework-rule').map(w=>w.ruleId));
  assert(rules.includes('middleware-sequence:0:conditional-short-circuit'));assert(rules.includes('middleware-hook:0:__call__:conditional'));assert(rules.includes('middleware-hook:0:process_view:conditional'));
  assert(rules.includes('app-ready-declaration-not-execution'));assert(rules.includes('management-command-handle-ownership'));
}));
test("FS06 custom template engine and traversal names are withheld behind protected read boundaries",async()=>fixture({"app/views.py":"from django.shortcuts import render\ndef home(request):\n    return render(request, '../secret.html')\n","project/urls.py":"from django.urls import path\nfrom app.views import home\nurlpatterns = [path('', home)]\n","secret.html":"PRIVATE_SENTINEL"},async root=>{
  const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
  assert(!snapshot.analysis.resources.some(r=>r.path==='secret.html'));assert(!snapshot.analysis.bindings.some(b=>b.kind==='asset'));assert(snapshot.analysis.gaps.some(g=>g.reason==='policy-denied'));
}));
test("FS06 explicit installed app association preserves FS02 owners and excludes independent child packages",async()=>{
  const changes={'app/apps.py':"from django.apps import AppConfig\nclass App(AppConfig):\n    def ready(self):\n        pass\n"};
  await fixture(changes,async root=>{const driver=createComposedRefresh({host});const snapshot=(await driver.analyze(root,true)).snapshot;
    assert(snapshot.analysis.projects.some(p=>p.projectId==='app'));assert.equal(snapshot.analysis.registrations.length,4);assert(snapshot.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId==='app-ready-declaration-not-execution')));
    assert.deepEqual((await driver.analyze(root,false)).snapshot,snapshot);
  });
  await fixture({...changes,'app/pyproject.toml':'[project]\nname="independent-child"\n'},async root=>{const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
    assert(snapshot.analysis.projects.some(p=>p.projectId==='app'));assert(!snapshot.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId==='app-ready-declaration-not-execution')));
    assert(snapshot.analysis.registrations.every(r=>r.handlerId===null));assert(snapshot.analysis.gaps.some(g=>g.reason==='external-boundary'||g.reason==='ambiguous-target'));
  });
});
test("FS06 opaque class/method decorators cannot prove models or router dispatch",async()=>fixture({'app/models.py':"from django.db import models\ndef replace(cls):\n    return cls\n@replace\nclass Item(models.Model):\n    name = models.CharField(max_length=20)\n",'app/views.py':"from rest_framework.viewsets import ViewSet\ndef replace(cls):\n    return cls\n@replace\nclass Items(ViewSet):\n    def list(self, request):\n        pass\n",'project/urls.py':"from rest_framework.routers import SimpleRouter\nfrom app.views import Items\nrouter = SimpleRouter(use_regex_path=False)\nrouter.register('items', Items, basename='item')\nurlpatterns = router.urls\n"},async root=>{
  const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;assert.equal(snapshot.analysis.registrations.length,0);
  assert(!snapshot.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId==='model-declaration-not-runtime-schema')));assert(snapshot.analysis.gaps.some(g=>g.reason==='custom-resolver'));
}));
test("FS06 template keyword names and explicit engine overrides preserve uncertainty",async()=>fixture({'app/views.py':"from django.shortcuts import render\ndef home(request):\n    return render(request=request, context='private.html', template_name=request.name, using='other')\n",'templates/private.html':'PRIVATE_TEMPLATE_SENTINEL'},async root=>{
  const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
  assert(!snapshot.analysis.resources.some(r=>r.path==='templates/private.html'));assert(!snapshot.analysis.bindings.some(b=>b.kind==='asset'));assert(snapshot.analysis.gaps.some(g=>g.reason==='custom-resolver'));
}));
test("FS06 local Django namespace shadowing cannot create verified framework registrations",async()=>fixture({'django/__init__.py':'','django/urls.py':"def path(*args, **kwargs):\n    raise RuntimeError('LOCAL_NAMESPACE_SENTINEL')\n",'project/urls.py':"from django.urls import path\nfrom app.views import home\nurlpatterns = [path('fake/', home)]\n"},async root=>{
  const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;assert.equal(snapshot.analysis.registrations.length,0);assert(snapshot.analysis.gaps.some(g=>g.reason==='custom-resolver'));
}));
test("FS06 mutated or escaped router instances cannot create verified endpoints",async()=>{
  for(const change of ['router.registry = []','configure(router)'])await fixture({'app/views.py':"from rest_framework.viewsets import ViewSet\nclass Items(ViewSet):\n    def list(self, request):\n        pass\n",'project/urls.py':"from rest_framework.routers import SimpleRouter\nfrom app.views import Items\nrouter = SimpleRouter(use_regex_path=False)\nrouter.register('items', Items, basename='item')\n"+change+"\nurlpatterns = router.urls\n"},async root=>{
    const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;assert.equal(snapshot.analysis.registrations.length,0);assert(snapshot.analysis.gaps.some(g=>g.reason==='dynamic-expression'));
  });
});

test("FS06 multiple explicit settings profiles retain separate variants and mutation never chooses a root",async()=>fixture({'project/first.py':sources['project/settings.py'],'project/second.py':sources['project/settings.py'].replace("project.urls","project.other_urls"),'project/other_urls.py':"from django.urls import path\nfrom app.views import home\nurlpatterns = [path('other/', home)]\n",'project/mutated.py':"ROOT_URLCONF = 'project.urls'\nROOT_URLCONF = choose_root()\nINSTALLED_APPS = ['app']\n"},async root=>{
  const snapshot=(await createComposedRefresh({host,settingsModules:{'.':['project.first','project.second','project.first']}}).analyze(root,true)).snapshot;
  const first=snapshot.analysis.registrations.filter(r=>r.conditions.includes('settings:project/first.py'));
  const second=snapshot.analysis.registrations.filter(r=>r.conditions.includes('settings:project/second.py'));
  assert.equal(first.length,4);assert.equal(second.length,1);assert.equal(second[0].rawPattern,'/other/');
  assert(first.every(r=>r.variantId!==second[0].variantId));
  const mutated=(await createComposedRefresh({host,settingsModules:{'.':['project.mutated']}}).analyze(root,true)).snapshot;
  assert.equal(mutated.analysis.registrations.length,0);assert(mutated.analysis.gaps.some(g=>g.reason==='dynamic-expression'));
  const unselected=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
  assert(unselected.analysis.gaps.some(g=>g.reason==='variant-not-selected'));
}));

test("FS06 standard converters and slash metadata stay literal while regex and custom converters retain gaps",async()=>fixture({'project/urls.py':"from django.urls import path, re_path\nfrom app.views import home\nurlpatterns = [path('s/<slug:value>/', home), path('u/<uuid:value>', home), path('p/<path:value>/', home), path('s/<str:value>/', home), path('i/<int:value>/', home), re_path(r'^literal/$', home), re_path(r'^dynamic/(.+)/$', home)]\n"},async root=>{
  const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
  const routes=snapshot.analysis.registrations;assert.equal(routes.length,7);
  assert.deepEqual(routes.map(r=>r.matcher.state),['supported','supported','supported','supported','supported','supported','unsupported']);
  assert(routes[0].matcher.state==='supported'&&routes[0].matcher.trailingSlash==='required');
  assert(routes[1].matcher.state==='supported'&&routes[1].matcher.trailingSlash==='forbidden');
  assert(routes[2].matcher.state==='supported'&&routes[2].matcher.segments.at(-1)?.kind==='catchAll');
  assert.equal(routes[6].rawPattern,'/^dynamic/(.+)/$');
}));

test("FS06 async FBV and qualified HTTP decorator preserve downstream calls without framework-call promotion",async()=>fixture({'app/views.py':"from django.views.decorators.http import require_GET\nfrom .service import serve\n@require_GET\nasync def home(request):\n    return serve()\n",'project/urls.py':"from django.urls import path\nfrom app.views import home\nurlpatterns = [path('async/', home)]\n"},async root=>{
  const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
  const route=snapshot.analysis.registrations[0];assert.deepEqual(route.methodState,{state:'known',values:['GET']});assert(route.handlerId);
  assert(traceCalls(snapshot,route.handlerId).calls.some(call=>snapshot.behavior.declarations.find(d=>d.id===call.target)?.name==='serve'));
  assert(!snapshot.behavior.relations.some(r=>r.relation==='calls'&&r.site.file==='project/urls.py'));
}));

test("FS06 duplicate signal registrations retain occurrences without implying signal emission",async()=>fixture({'app/views.py':"from django.db.models.signals import post_save\ndef saved(sender, **kwargs):\n    pass\npost_save.connect(saved)\npost_save.connect(saved)\n"},async root=>{
  const driver=createComposedRefresh({host});const snapshot=(await driver.analyze(root,true)).snapshot;
  const bindings=snapshot.analysis.bindings.filter(b=>b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId.startsWith('signal-connect:')));
  assert.equal(bindings.length,2);assert.notEqual(bindings[0].id,bindings[1].id);assert.notEqual(bindings[0].occurrence.start,bindings[1].occurrence.start);
  assert(!snapshot.behavior.relations.some(r=>r.relation==='calls'&&snapshot.behavior.declarations.find(d=>d.id===r.target)?.name==='saved'));
  assert.deepEqual((await driver.analyze(root,false)).snapshot,snapshot);
}));

test("FS06 edited settings and template bytes refresh source evidence and remain full/incremental equivalent",async()=>fixture({'app/views.py':"from django.shortcuts import render\ndef home(request):\n    return render(request, 'page.html')\n",'templates/page.html':'{% include "part.html" %}','templates/part.html':'first'},async root=>{
  const driver=createComposedRefresh({host});const before=(await driver.analyze(root,true)).snapshot;
  const previous=before.analysis.resources.find(r=>r.path==='templates/part.html');assert(previous);
  writeFileSync(path.join(root,'templates/part.html'),'second\r\nUnicode: café');
  writeFileSync(path.join(root,'project/settings.py'),sources['project/settings.py']+'\n# changed settings evidence\n');
  const incremental=(await driver.analyze(root,false)).snapshot;
  assert.notEqual(incremental.analysis.resources.find(r=>r.path==='templates/part.html')?.hash,previous.hash);
  assert.deepEqual(incremental,(await createComposedRefresh({host}).analyze(root,true)).snapshot);
}));

test("FS06 mutable settings containers cannot prove installed-app or middleware registration",async()=>fixture({'project/settings.py':sources['project/settings.py'].replace("INSTALLED_APPS = ['app']","INSTALLED_APPS = ['app']\nINSTALLED_APPS.clear()").replace('MIDDLEWARE = []',"MIDDLEWARE = ['app.middleware.Guard']\nMIDDLEWARE.clear()"),'app/middleware.py':"class Guard:\n    def process_view(self, *args):\n        pass\n"},async root=>{
  const snapshot=(await createComposedRefresh({host}).analyze(root,true)).snapshot;
  assert(!snapshot.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId.startsWith('middleware-'))));
  assert(snapshot.analysis.gaps.some(g=>g.reason==='dynamic-expression'&&g.occurrence.file==='project/settings.py'));
}));

for(const tuple of Object.keys(qualificationTuples) as (keyof typeof qualificationTuples)[]){
  const oracle=qualificationOracles.find(r=>r.tuple===tuple);
  test(`FS06 qualification ${tuple} routers`,async()=>{
    assert(oracle&&oracle.status==='PASS'&&oracle.profile==='static-python-declared-environment');assert.equal(oracle.result.routers.length,8);
    for(const row of oracle.result.routers){
      const id=`${row.router}-${row.useRegexPath?'regex':'path'}-${row.trailingSlash?'slash':'bare'}`;
      await qualifyCase(tuple,'routers',id,{'app/views.py':"from rest_framework.viewsets import ViewSet\nfrom rest_framework.decorators import action\nclass Items(ViewSet):\n    def list(self, request):\n        pass\n    def retrieve(self, request, pk):\n        pass\n    @action(detail=False, methods=['post'])\n    def refresh(self, request):\n        pass\n",'project/urls.py':`from rest_framework.routers import ${row.router}\nfrom app.views import Items\nrouter = ${row.router}(use_regex_path=${row.useRegexPath?'True':'False'}, trailing_slash=${row.trailingSlash?'True':'False'})\nrouter.register('users', Items, basename='users')\nurlpatterns = router.urls\n`},snapshot=>{
        const registrations=snapshot.analysis.registrations;assert.equal(registrations.length,row.routes.length);
        for(const [index,expected]of row.routes.entries()){
          const actual=registrations[index];assert(actual.conditions.includes('django-source-pattern:'+expected.pattern),`${id}: ${expected.pattern}`);assert(actual.conditions.includes('url-name:'+expected.name));
          assert.deepEqual(actual.methodState,{state:'known',values:(expected.rootMethods??[...Object.keys(expected.actions).map(m=>m.toUpperCase()),'OPTIONS']).sort()});
          assert.equal(actual.handlerId,null);
          if(expected.pattern.includes('format')||expected.pattern.includes('(?P<pk>'))assert.equal(actual.matcher.state,'unsupported');
          for(const [method,action]of Object.entries(expected.actions))assert(snapshot.analysis.bindings.some(b=>b.sourceId===actual.id&&b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId===`drf-action-method:${method.toUpperCase()}:${action}`)));
          if(expected.rootMethods)assert(!snapshot.analysis.bindings.some(b=>b.sourceId===actual.id));
        }
      });
    }
  });
  test(`FS06 qualification ${tuple} formats`,async()=>{
    assert(oracle&&oracle.status==='PASS');assert.equal(oracle.result.suffixes.length,16);
    for(const [index,row]of oracle.result.suffixes.entries())for(const form of ['reassignment','inline'])await qualifyCase(tuple,'formats',String(index)+'-'+form,{'project/urls.py':`from django.urls import ${row.regex?'re_path':'path'}\nfrom rest_framework.urlpatterns import format_suffix_patterns\nfrom app.views import home\n`+(form==='reassignment'?`urlpatterns = [${row.regex?"re_path(r'^plain/$', home, name='plain')":"path('plain/', home, name='plain')"}]\n`:'')+`urlpatterns = format_suffix_patterns(${form==='reassignment'?'urlpatterns':'['+(row.regex?"re_path(r'^plain/$', home, name='plain')":"path('plain/', home, name='plain')")+']'}, suffix_required=${row.required?'True':'False'}, allowed=${row.allowed===null?'None':JSON.stringify(row.allowed)})\n`},snapshot=>{
      assert.equal(snapshot.analysis.registrations.length,row.patterns.length);
      for(const [position,pattern]of row.patterns.entries())assert(snapshot.analysis.registrations[position].conditions.includes('django-source-pattern:'+pattern));
      for(const registration of snapshot.analysis.registrations){assert(registration.handlerId);assert(traceCalls(snapshot,registration.handlerId).calls.some(call=>snapshot.behavior.declarations.find(d=>d.id===call.target)?.name==='serve'));if(registration.rawPattern.includes('format'))assert.equal(registration.matcher.state,'unsupported');}
    });
  });
  test(`FS06 qualification ${tuple} includes`,async()=>{
    assert(oracle&&oracle.status==='PASS');assert.equal(oracle.result.includes.length,6);
    for(const [index,row]of oracle.result.includes.entries())await qualifyCase(tuple,'includes',String(index),{'project/urls.py':"from django.urls import path, include\nurlpatterns = [path('mount/', include(('app.urls', 'hint')"+(row.namespace===null?'':', namespace='+JSON.stringify(row.namespace))+"))]\n",'app/urls.py':"from django.urls import path\nfrom .views import home\n"+(row.declaredApp===null?'':'app_name = '+JSON.stringify(row.declaredApp)+'\n')+"urlpatterns = [path('child/', home, name='child')]\n"},snapshot=>{
      assert.equal(snapshot.analysis.registrations.length,1);assert.equal(snapshot.analysis.registrations[0].rawPattern,'/mount/child/');assert(snapshot.analysis.registrations[0].conditions.includes('url-name:'+row.name));
    });
  });
  test(`FS06 qualification ${tuple} decorators`,async()=>{
    assert(oracle&&oracle.status==='PASS');assert.equal(oracle.result.decorators.length,8);
    for(const row of oracle.result.decorators)await qualifyCase(tuple,'decorators',row.decorator+'-'+row.async,{'app/views.py':`from django.views.decorators.http import ${row.decorator}\nfrom .service import serve\n@${row.decorator}${row.decorator==='require_http_methods'?"(['GET', 'POST'])":''}\n${row.async?'async ':''}def home(request):\n    return serve()\n`,'project/urls.py':"from django.urls import path\nfrom app.views import home\nurlpatterns = [path('view/', home)]\n"},snapshot=>{
      const registration=snapshot.analysis.registrations[0];assert.deepEqual(registration.methodState,{state:'known',values:[...row.methods].sort()});assert(registration.handlerId);assert(traceCalls(snapshot,registration.handlerId).calls.some(call=>snapshot.behavior.declarations.find(d=>d.id===call.target)?.name==='serve'));
      assert(!snapshot.behavior.relations.some(relation=>relation.relation==='calls'&&relation.site.file==='project/urls.py'));
    });
  });
  test(`FS06 qualification ${tuple} converters`,async()=>{
    assert(oracle&&oracle.status==='PASS');assert.equal(oracle.result.converters.length,20);
    const unique=[...new Set(oracle.result.converters.map(row=>row.pattern))];
    await qualifyCase(tuple,'converters','builtins',{'project/urls.py':"from django.urls import path\nfrom app.views import home\nurlpatterns = ["+unique.map(pattern=>`path(${JSON.stringify(pattern)}, home)`).join(', ')+"]\n"},snapshot=>{
      assert.equal(snapshot.analysis.registrations.length,10);
      for(const row of oracle.result.converters){const route=snapshot.analysis.registrations.find(r=>r.rawPattern==='/'+row.pattern);assert(route&&route.matcher.state==='supported');
        const matcher=route.matcher,parts=row.url.slice(1).replace(/\/$/,'').split('/'),segment=matcher.segments[1];assert(segment&&segment.kind!=='literal');
        const trailing=row.url.endsWith('/'),hasSlash=matcher.trailingSlash==='required'?trailing:!trailing;
        let value=parts.slice(1).join('/');if(row.converter!=='path')value=parts.length===2?parts[1]:'';
        const pattern=({str:/^[^/]+$/,int:/^[0-9]+$/,slug:/^[-a-zA-Z0-9_]+$/,uuid:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,path:/^.+$/} as Record<string,RegExp>)[row.converter];
        assert.equal(hasSlash&&pattern.test(value),row.matched,JSON.stringify(row));
        assert.equal(matcher.decodingPolicy,'raw');assert.equal(matcher.caseSensitive,true);
        if(segment.kind==='parameter')assert.equal(segment.converter,({str:'segment',int:'integer',slug:'slug',uuid:'uuid'} as Record<string,string>)[row.converter]);else assert.equal(row.converter,'path');
      }
    });
    await qualifyCase(tuple,'converters','boundaries',{'project/urls.py':"from django.urls import path, re_path\nfrom app.views import home\nurlpatterns = [path('x/<custom:a>/', home), path('x/<path:a>/end/', home), path('x/<str:a>/<str:a>/', home), path('x//', home), re_path(r'^literal/$', home), re_path(r'^x/(.+)/$', home)]\n"},snapshot=>{
      assert.deepEqual(snapshot.analysis.registrations.map(r=>r.matcher.state),['unsupported','unsupported','unsupported','unsupported','supported','unsupported']);
      assert(snapshot.analysis.registrations.at(-1)?.conditions.includes('django-source-pattern:^x/(.+)/$'));
    });
  });
  test(`FS06 qualification ${tuple} dynamic routes and decorators`,async()=>{
    for(const [id,change]of [['mutation',"urlpatterns.clear()"],['escape',"configure(urlpatterns)"],['index',"urlpatterns[0] = replace()"]])await qualifyCase(tuple,'dynamic',id,{'project/urls.py':"from django.urls import path\nfrom app.views import home\nurlpatterns = [path('literal/', home)]\n"+change+'\n'},snapshot=>{assert.equal(snapshot.analysis.registrations.length,0);assert(snapshot.analysis.gaps.some(g=>g.reason==='dynamic-expression'));});
    await qualifyCase(tuple,'dynamic','decorator',{'app/views.py':"from django.views.decorators.http import require_http_methods\nfrom .service import serve\n@require_http_methods(['get'])\ndef home(request):\n    serve()\n",'project/urls.py':"from django.urls import path\nfrom app.views import home\nurlpatterns = [path('lower/', home)]\n"},snapshot=>{assert.deepEqual(snapshot.analysis.registrations[0].methodState,{state:'unknown',values:[]});assert.equal(snapshot.analysis.registrations[0].handlerId,null);});
    await qualifyCase(tuple,'dynamic','format-settings',{'project/settings.py':sources['project/settings.py']+"\nREST_FRAMEWORK = {'FORMAT_SUFFIX_KWARG': 'representation'}\n",'app/views.py':"from rest_framework.viewsets import ViewSet\nclass Items(ViewSet):\n    def list(self, request):\n        pass\n",'project/urls.py':"from rest_framework.routers import DefaultRouter\nfrom app.views import Items\nrouter = DefaultRouter()\nrouter.register('users', Items, basename='users')\nurlpatterns = router.urls\n"},snapshot=>{assert.equal(snapshot.analysis.registrations.length,0);assert(snapshot.analysis.gaps.some(g=>g.reason==='custom-resolver'));});
  });
  test(`FS06 qualification ${tuple} models and serializers`,async()=>{
    const models="from django.db import models\nclass Parent(models.Model):\n    name = models.CharField(max_length=80)\nclass Item(models.Model):\n    parent = models.ForeignKey(Parent, on_delete=models.CASCADE)\n    single = models.OneToOneField(Parent, on_delete=models.CASCADE)\n    peers = models.ManyToManyField('self')\n    objects = models.Manager()\n";
    const fields=['AutoField','BigAutoField','BigIntegerField','BinaryField','BooleanField','CharField','DateField','DateTimeField','DecimalField','DurationField','EmailField','FileField','FloatField','GenericIPAddressField','ImageField','IntegerField','JSONField','PositiveIntegerField','SlugField','SmallIntegerField','TextField','TimeField','URLField','UUIDField'];
    const operations=['all','filter','exclude','get','create','update','delete','count','exists','first','last','order_by','select_related','prefetch_related'];
    await qualifyCase(tuple,'models','field-operation-table',{'app/models.py':"from django.db import models\nclass Item(models.Model):\n"+fields.map((field,index)=>`    field${index} = models.${field}()\n`).join(''),'app/views.py':"from .models import Item\ndef home(request):\n"+operations.map(operation=>`    Item.objects.${operation}()\n`).join('')},snapshot=>{const rules=snapshot.analysis.bindings.flatMap(b=>b.witnesses.filter(w=>w.role==='framework-rule').map(w=>w.ruleId));for(const field of fields)assert(rules.includes('model-field:'+field));for(const operation of operations)assert(rules.some(rule=>rule.startsWith('orm-intent:'+operation+':')&&rule.endsWith(':no-sql-execution-claim')));});
    await qualifyCase(tuple,'models','relationships',{'app/models.py':models,'app/views.py':"from .models import Item\ndef home(request):\n    Item.objects.filter(active=True)\n    Item.objects.get(pk=1)\n"},snapshot=>{
      const rules=snapshot.analysis.bindings.flatMap(b=>b.witnesses.filter(w=>w.role==='framework-rule').map(w=>w.ruleId));
      for(const field of ['ForeignKey','OneToOneField','ManyToManyField'])assert(rules.includes('model-relationship:'+field+':declaration-only'));
      assert(rules.includes('orm-intent:filter:lazy-queryset:no-sql-execution-claim'));assert(rules.includes('orm-intent:get:operation-declaration:no-sql-execution-claim'));
    });
    for(const base of ['Serializer','ModelSerializer','HyperlinkedModelSerializer'])await qualifyCase(tuple,'serializers',base,{'app/models.py':models,'app/views.py':`from rest_framework import serializers\nfrom rest_framework.generics import ListAPIView\nfrom .models import Item\nclass ItemSerializer(serializers.${base}):\n    class Meta:\n        model = Item\nclass Items(ListAPIView):\n    serializer_class = ItemSerializer\n    queryset = Item.objects.all()\n    def get_queryset(self):\n        return Item\n    def get_serializer_class(self):\n        return ItemSerializer\ndef home(request):\n    pass\n`},snapshot=>{
      const rules=snapshot.analysis.bindings.flatMap(b=>b.witnesses.filter(w=>w.role==='framework-rule').map(w=>w.ruleId));
      assert(rules.includes('serializer-meta-model-declaration'));assert(rules.includes('drf-serializer-class-declaration:not-runtime-selection'));assert(rules.includes('drf-queryset-attribute-declaration:not-runtime-selection'));
      for(const name of ['get_queryset','get_serializer_class']){const declaration=snapshot.behavior.declarations.find(d=>d.name===name);assert(declaration);assert(snapshot.analysis.gaps.some(g=>g.reason==='custom-resolver'&&g.occurrence.start===declaration.site.start));}
    });
    await qualifyCase(tuple,'models','mutated-manager',{'app/models.py':models,'app/views.py':"from .models import Item\nItem.objects = custom_manager()\ndef home(request):\n    return Item.objects.filter(active=True)\n"},snapshot=>{assert(!snapshot.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId.startsWith('orm-intent:'))));assert(snapshot.analysis.gaps.some(g=>g.reason==='custom-resolver'));});
    await qualifyCase(tuple,'models','custom-manager',{'app/models.py':"from django.db import models\nclass Custom(models.Manager):\n    pass\nclass Item(models.Model):\n    objects = Custom()\n",'app/views.py':"from .models import Item\ndef home(request):\n    return Item.objects.all()\n"},snapshot=>{assert(!snapshot.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId.startsWith('orm-intent:'))));assert(snapshot.analysis.gaps.some(g=>g.reason==='custom-resolver'));});
    await qualifyCase(tuple,'serializers','opaque-meta',{'app/models.py':models,'app/views.py':"from rest_framework.serializers import ModelSerializer\nfrom .models import Item\n@custom\nclass ItemSerializer(ModelSerializer):\n    class Meta:\n        model = Item\ndef home(request):\n    pass\n"},snapshot=>{assert(!snapshot.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId==='serializer-meta-model-declaration')));assert(snapshot.analysis.gaps.some(g=>g.reason==='custom-resolver'));});
  });
  test(`FS06 qualification ${tuple} signals boundaries`,async()=>{
    await qualifyCase(tuple,'signals','duplicates',{'app/views.py':"from django.db.models.signals import post_save\nfrom django.dispatch import receiver\n@receiver(post_save)\ndef saved(sender, **kwargs):\n    pass\npost_save.connect(saved)\npost_save.connect(saved)\ndef home(request):\n    pass\n"},snapshot=>{const bindings=snapshot.analysis.bindings.filter(b=>b.witnesses.some(w=>w.role==='framework-rule'&&/^signal-(connect|receiver):/.test(w.ruleId)));assert.equal(bindings.length,3);assert.equal(new Set(bindings.map(b=>b.id)).size,3);assert(!snapshot.behavior.relations.some(r=>r.relation==='calls'&&snapshot.behavior.declarations.find(d=>d.id===r.target)?.name==='saved'));});
    await qualifyCase(tuple,'signals','custom',{'app/views.py':"from django.db.models.signals import post_save\nfrom django.dispatch import Signal, receiver\ncustom_signal = Signal()\n@receiver(post_save)\n@opaque\ndef saved(sender, **kwargs):\n    pass\npost_save.connect(saved)\ncustom_signal.connect(saved)\ndef home(request):\n    pass\n"},snapshot=>{assert(!snapshot.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==='framework-rule'&&/^signal-(connect|receiver):/.test(w.ruleId))));assert(snapshot.analysis.gaps.some(g=>g.reason==='custom-resolver'));});
    await qualifyCase(tuple,'signals','conditional',{'app/views.py':"from django.db.models.signals import post_save\ndef saved(sender, **kwargs):\n    pass\nif enabled:\n    post_save.connect(saved)\ndef home(request):\n    pass\n"},snapshot=>{assert(!snapshot.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId.startsWith('signal-connect:'))));assert(snapshot.analysis.gaps.some(g=>g.reason==='dynamic-expression'));});
  });
  test(`FS06 qualification ${tuple} templates boundaries and positions`,async()=>{
    const view="from django.shortcuts import render\ndef home(request):\n    return render(request, 'page.html')\n";
    await qualifyCase(tuple,'templates','cycle-unicode',{'app/views.py':view,'templates/page.html':'\uFEFFcafé 😀\r\n{% include "part.html" %}\r\n{% block main %}body{% endblock %}','templates/part.html':'{% include "page.html" %}'},snapshot=>{assert(snapshot.analysis.gaps.some(g=>g.reason==='config-cycle'));assert(snapshot.analysis.bindings.some(b=>b.occurrence.file==='templates/page.html'&&b.occurrence.line===2));assert(snapshot.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId==='template-block:main')));});
    for(const [id,text,reason]of [['dynamic','{% include selected %}','dynamic-expression'],['tag','{% application_tag %}','custom-resolver'],['malformed','{% block main %}','unsupported-syntax']] as const)await qualifyCase(tuple,'templates',id,{'app/views.py':view,'templates/page.html':text},snapshot=>{assert(snapshot.analysis.gaps.some(g=>g.reason===reason&&g.occurrence.file==='templates/page.html'));});
    await qualifyCase(tuple,'templates','conflict',{'project/settings.py':sources['project/settings.py'].replace("'templates'","'templates', 'other_templates'"),'app/views.py':view,'templates/page.html':'first','other_templates/page.html':'second'},snapshot=>{assert(snapshot.analysis.resources.some(r=>r.path==='templates/page.html'));assert(!snapshot.analysis.resources.some(r=>r.path==='other_templates/page.html'));});
    await qualifyCase(tuple,'templates','custom-engine',{'project/settings.py':sources['project/settings.py'].replace('django.template.backends.django.DjangoTemplates','custom.Engine'),'app/views.py':view,'templates/page.html':'{% application_tag %}'},snapshot=>{assert(!snapshot.analysis.resources.some(r=>r.path==='templates/page.html'));assert(snapshot.analysis.gaps.some(g=>g.reason==='custom-resolver'));});
    await qualifyCase(tuple,'templates','ambiguous-url',{'app/views.py':view,'project/urls.py':"from django.urls import path\nfrom app.views import home\nurlpatterns = [path('first/', home, name='duplicate'), path('second/', home, name='duplicate')]\n",'templates/page.html':"{% url 'duplicate' %}"},snapshot=>{assert(snapshot.analysis.gaps.some(g=>g.reason==='ambiguous-target'&&g.occurrence.file==='templates/page.html'));assert(!snapshot.analysis.bindings.some(b=>b.witnesses.some(w=>w.role==='framework-rule'&&w.ruleId==='template-url-name-reference')));});
  });
}
