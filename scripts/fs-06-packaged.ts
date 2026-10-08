import assert from "node:assert/strict";
import { cpSync, copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";

const tuple=process.argv.find(arg=>arg.startsWith("--tuple="))?.slice(8);assert(tuple==="django52"||tuple==="django60","Explicit exact tuple required");
const extended=process.argv.includes("--extended");
const temporary = mkdtempSync(path.join(os.tmpdir(), "cartograph FS06 packaged "));
const engine = path.join(temporary, "engine"), root = path.join(temporary, "selected source"), node = path.join(temporary, "node.exe");
try {
  cpSync("src-tauri/resources/generated/engine", engine, { recursive: true });
  copyFileSync("src-tauri/binaries/code-engine-x86_64-pc-windows-msvc.exe", node);
  mkdirSync(root);
  const sources=JSON.parse(readFileSync("tests/fixtures/framework-support/F06-django/sources.json","utf8").replace(/^\uFEFF/,"")) as Record<string,string>;
  if(tuple==="django60")sources["pyproject.toml"]='[project]\nname="controlled-django"\nrequires-python="==3.13.16"\ndependencies=["Django==6.0.9", "djangorestframework==3.17.2"]\n';
  if(extended){
    sources["app/models.py"]="from django.db import models\nfrom django.db.models.signals import post_save\nclass Items(models.QuerySet):\n    def active(self):\n        return self.filter(active=True)\nclass Item(models.Model):\n    name = models.CharField(max_length=20)\n    objects = models.Manager()\ndef saved(sender, **kwargs):\n    pass\npost_save.connect(saved)\n";
    sources["app/api.py"]="from rest_framework.viewsets import ViewSet\nclass Items(ViewSet):\n    def list(self, request):\n        pass\n";
    sources["app/api_urls.py"]="from rest_framework.routers import DefaultRouter\nfrom .api import Items\nrouter = DefaultRouter(use_regex_path=False)\nrouter.register('items', Items, basename='item')\nurlpatterns = router.urls\n";
    sources["app/regex_urls.py"]="from rest_framework.routers import DefaultRouter\nfrom .api import Items\nrouter = DefaultRouter()\nrouter.register('items', Items, basename='item')\nurlpatterns = router.urls\n";
    sources["app/formats.py"]="from django.urls import path\nfrom rest_framework.urlpatterns import format_suffix_patterns\nfrom .views import home\nurlpatterns = [path('plain/', home)]\nurlpatterns = format_suffix_patterns(urlpatterns, allowed=['json', 'api'])\n";
    sources["project/urls.py"]=sources["project/urls.py"].replace('urlpatterns = [',"urlpatterns = [path('api/', include('app.api_urls')), ");
    sources["project/urls.py"]=sources["project/urls.py"].replace('urlpatterns = [',"urlpatterns = [path('regex/', include('app.regex_urls')), path('formats/', include('app.formats')), ");
    sources["app/views.py"]+='\nfrom django.shortcuts import render\ndef page(request):\n    return render(request, "page.html")\n';
    sources["templates/page.html"]='{% include "part.html" %}';sources["templates/part.html"]='static content';
  }
  sources["sentinel.py"]="raise RuntimeError('MUST NEVER EXECUTE')\n";
  sources["main.ts"]="export const accepted=1;\n";
  for(const [file,text]of Object.entries(sources)){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);}
  const url = (file: string) => JSON.stringify(pathToFileURL(path.join(engine, file)).href);
  const probe = `import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync,writeFileSync} from 'node:fs';import net from 'node:net';const require=createRequire(import.meta.url);for(const tool of ['next','react','typescript','pnpm'])assert.throws(()=>require.resolve(tool));assert.equal(process.env.PATH,'');globalThis.fetch=()=>{throw Error('denied egress')};net.connect=()=>{throw Error('denied egress')};net.createConnection=net.connect;
const {createComposedRefresh}=await import(${url("lib/engine/adapters/composed.ts")});const {serializeSnapshot,deserializeSnapshot}=await import(${url("lib/engine/contract.ts")});const {readEvidence,queryStructure}=await import(${url("lib/engine/index.ts")});const {SqliteAnalysisStore}=await import(${url("lib/storage/sqlite.ts")});
const driver=createComposedRefresh({host:${JSON.stringify(path.join(engine,"bin/parser-host.exe"))}}),root=${JSON.stringify(root)},first=await driver.analyze(root,true),snapshot=first.snapshot;assert.equal(snapshot.version,3);assert(snapshot.files.some(f=>f.path==='main.ts'));assert.equal(snapshot.analysis.registrations.length,${extended?14:4});const cbv=snapshot.analysis.registrations.find(r=>r.rawPattern==='/items/<int:pk>/');assert(cbv);assert.deepEqual(cbv.methodState,{state:'known',values:['GET','HEAD','OPTIONS']});assert(snapshot.analysis.bindings.some(b=>b.sourceId===cbv.id&&b.kind==='lifecycle'));assert(snapshot.behavior.relations.some(r=>r.relation==='calls'&&r.site.file==='app/views.py'));assert.deepEqual(queryStructure(snapshot,{file:'app/views.py',direction:'dependencies',depth:1}).steps,[['app/service.py']]);assert.equal(readEvidence(snapshot,'app/views.py').state,'current');assert.equal(serializeSnapshot(deserializeSnapshot(serializeSnapshot(snapshot))),serializeSnapshot(snapshot));assert.deepEqual((await driver.analyze(root,false)).snapshot,snapshot);
if(${extended}){const rules=snapshot.analysis.bindings.flatMap(b=>b.witnesses.filter(w=>w.role==='framework-rule').map(w=>w.ruleId));assert(rules.includes('orm-class-declaration:django.db.models.QuerySet:no-runtime-dispatch'));assert(rules.includes('standard-manager-declaration:no-query-execution'));assert(rules.some(r=>r.startsWith('signal-connect:')));assert(snapshot.analysis.resources.some(r=>r.path==='templates/part.html'));assert(snapshot.analysis.registrations.some(r=>r.rawPattern==='/api/items<drf_format_suffix:format>'&&r.matcher.state==='unsupported'));assert(snapshot.analysis.registrations.some(r=>r.rawPattern==='/api/'&&r.handlerId===null));}
if(${extended}){assert(snapshot.analysis.registrations.some(r=>r.rawPattern==='/regex/^items\\\\.(?P<format>[a-z0-9]+)/?$'&&r.matcher.state==='unsupported'));assert(snapshot.analysis.registrations.some(r=>r.rawPattern.includes('/formats/plain<drf_format_suffix_json_api:format>')&&r.matcher.state==='unsupported'));}
const store=new SqliteAnalysisStore(${JSON.stringify(path.join(temporary,"snapshot.sqlite"))});const repository=store.register(root);store.begin(repository.repositoryId,'fs06');store.publish(repository.repositoryId,'fs06',snapshot);assert.deepEqual(store.load(repository.repositoryId),snapshot);store.close();writeFileSync(${JSON.stringify(path.join(root,"app/views.py"))},readFileSync(${JSON.stringify(path.join(root,"app/views.py"))},'utf8')+'# edit\\n');assert.equal(readEvidence(snapshot,'app/views.py').state,'stale');process.stdout.write(JSON.stringify({status:'PASS',node:process.version,files:snapshot.files.length,imports:snapshot.relationships.length,bindings:snapshot.analysis.bindings.length,checks:['offline','empty PATH','no Python or development tooling','execution sentinel','Django/Python/TS composition','URL/method/framework bindings','direct calls','structural dependencies','snapshot round trip','full/incremental','SQLite persistence','evidence staleness']})+'\\n');`;
  const entry = path.join(engine, "packaged-probe.mjs"); writeFileSync(entry, probe);
  const environment: NodeJS.ProcessEnv = { NODE_ENV: "production", PATH: "", SystemRoot: process.env.SystemRoot };
  const output = execFileSync(node, ["--disable-warning=ExperimentalWarning", entry], { env: environment, timeout: 30000 });
  const record = JSON.parse(output.toString("utf8"));
  writeFileSync(`docs/fs-06/evidence/packaged-${tuple}${extended?'-extended':''}.json`, JSON.stringify({ ...record, tuple, extended, fixtureHash: createHash("sha256").update(JSON.stringify(sources)).digest("hex"), runtimeManifest: JSON.parse(readFileSync(path.join(engine,"python-runtime.json"),"utf8")), harnessHash: createHash("sha256").update(readFileSync(import.meta.filename)).digest("hex") }, null, 2) + "\n");
  process.stdout.write(output);
} finally { assert(path.basename(temporary).startsWith("cartograph FS06 packaged ")); rmSync(temporary, { recursive: true, force: true }); }

