import assert from "node:assert/strict";
import path from "node:path";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
if(!process.argv.includes("--generate"))throw Error("Explicit --generate required; controlled developer oracle only");
const script=String.raw`import sys,json
sys.path.insert(0,sys.argv[1])
import django,rest_framework
from django.conf import settings
settings.configure(SECRET_KEY='synthetic-oracle-only',INSTALLED_APPS=[],ROOT_URLCONF=[],REST_FRAMEWORK={})
from django.urls import path,re_path,include,resolve
from django.views import View
from django.views.generic import TemplateView,ListView,DetailView,CreateView,UpdateView,DeleteView
from rest_framework import viewsets,generics
from rest_framework.views import APIView
from rest_framework.decorators import api_view,action
from rest_framework.routers import SimpleRouter,DefaultRouter
from types import SimpleNamespace,ModuleType
from django.urls.exceptions import Resolver404
from django.views.decorators.http import require_GET,require_POST,require_safe,require_http_methods
from rest_framework.urlpatterns import format_suffix_patterns
import inspect
def home(request): pass
class ItemView(View):
    def get(self,request,pk): pass
nested=[path('hello/',home,name='hello'),path('hello/',home,name='duplicate')]
patterns=[path('',home,name='home'),path('items/<int:pk>/',ItemView.as_view(),name='item'),path('nested/',include((nested,'app'),namespace='app'))]
urls=[]
for url in ['','items/42/','nested/hello/']:
    match=resolve('/'+url,urlconf=tuple(patterns))
    urls.append({'path':'/'+url,'name':match.view_name,'kwargs':match.kwargs,'handler':getattr(match.func,'view_class',match.func).__name__})
instance=ItemView();instance.setup(SimpleNamespace(method='GET'))
@api_view(['GET'])
def api(request): pass
class ItemViewSet(viewsets.ViewSet):
    def list(self,request): pass
    def retrieve(self,request,pk=None): pass
    @action(detail=False,methods=['post'],url_path='refresh',url_name='refresh')
    def refresh(self,request): pass
routers=[]
for cls in [SimpleRouter,DefaultRouter]:
    for regex in [True,False]:
        router=cls(use_regex_path=regex)
        router.register('users',ItemViewSet,basename='users')
        entries=[]
        for route in router.urls:
            callback=route.callback
            root_methods=None
            if getattr(callback,'cls',None) and callback.cls.__name__=='APIRootView':
                root_instance=callback.cls();root_instance.setup(SimpleNamespace(method='GET'));root_methods=root_instance._allowed_methods()
            actions=dict(getattr(callback,'actions',{}))
            view_instance=callback.cls()
            for method,target in actions.items():setattr(view_instance,method,getattr(view_instance,target))
            view_instance.setup(SimpleNamespace(method='GET'))
            if 'get' in actions and getattr(view_instance,'head',None)==getattr(view_instance,'get',None):actions['head']=actions['get']
            entries.append({'rootMethods':root_methods,'pattern':str(route.pattern),'name':route.name,'actions':actions,'methods':view_instance._allowed_methods(),'view':callback.cls.__name__})
        routers.append({'router':cls.__name__,'useRegexPath':regex,'trailingSlash':True,'routes':entries})
        no_slash=cls(use_regex_path=regex,trailing_slash=False)
        no_slash.register('users',ItemViewSet,basename='users')
        slash_entries=[]
        for route in no_slash.urls:
            callback=route.callback
            root_methods=None
            if getattr(callback,'cls',None) and callback.cls.__name__=='APIRootView':
                root_instance=callback.cls();root_instance.setup(SimpleNamespace(method='GET'));root_methods=root_instance._allowed_methods()
            actions=dict(getattr(callback,'actions',{}))
            view_instance=callback.cls()
            for method,target in actions.items():setattr(view_instance,method,getattr(view_instance,target))
            view_instance.setup(SimpleNamespace(method='GET'))
            if 'get' in actions and getattr(view_instance,'head',None)==getattr(view_instance,'get',None):actions['head']=actions['get']
            slash_entries.append({'rootMethods':root_methods,'pattern':str(route.pattern),'name':route.name,'actions':actions,'methods':view_instance._allowed_methods(),'view':callback.cls.__name__})
        routers.append({'router':cls.__name__,'useRegexPath':regex,'trailingSlash':False,'routes':slash_entries})
converters=[]
for converter,valid,invalid in [('str','abc','a/b'),('int','0042','-1'),('slug','a_B-9','.bad'),('uuid','12345678-1234-1234-1234-123456789abc','12345678-1234-1234-1234-123456789ABC'),('path','a/b','')]:
    for slash in [True,False]:
        pattern='value/<'+converter+':value>'+('/' if slash else '')
        for value in [valid,invalid]:
            url='/value/'+value+('/' if slash else '')
            try:
                resolved=resolve(url,urlconf=(path(pattern,home,name='value'),));matched=True
            except Resolver404: matched=False
            converters.append({'converter':converter,'pattern':pattern,'url':url,'matched':matched,'trailingSlash':slash})
decorators=[]
async def async_home(request): pass
for name,decorator in [('require_GET',require_GET),('require_POST',require_POST),('require_safe',require_safe),('require_http_methods',require_http_methods(['GET','POST']))]:
    for asynchronous in [False,True]:
        wrapped=decorator(async_home if asynchronous else home)
        allowed=inspect.getclosurevars(wrapped).nonlocals['request_method_list']
        decorators.append({'decorator':name,'async':asynchronous,'methods':allowed,'isAsync':inspect.iscoroutinefunction(wrapped)})
suffixes=[]
for regex in [False,True]:
    for required in [False,True]:
        for allowed in [None,[],['json'],['json','api']]:
            original=re_path(r'^plain/$',home,name='plain') if regex else path('plain/',home,name='plain')
            generated=format_suffix_patterns([original],suffix_required=required,allowed=allowed)
            suffixes.append({'regex':regex,'required':required,'allowed':allowed,'patterns':[str(p.pattern) for p in generated]})
includes=[]
child=ModuleType('fs06_controlled_child');child.urlpatterns=[path('child/',home,name='child')];sys.modules[child.__name__]=child
for declared_app in [None,'declared']:
    if declared_app is None:
        if hasattr(child,'app_name'):del child.app_name
    else:child.app_name=declared_app
    for namespace in [None,'selected','']:
        patterns=[path('mount/',include((child.__name__,'hint'),namespace=namespace))]
        match=resolve('/mount/child/',urlconf=tuple(patterns))
        includes.append({'declaredApp':declared_app,'namespace':namespace,'name':match.view_name})
classes=[View,TemplateView,ListView,DetailView,CreateView,UpdateView,DeleteView,APIView,generics.ListAPIView,generics.RetrieveAPIView,generics.CreateAPIView,generics.UpdateAPIView,generics.DestroyAPIView,generics.ListCreateAPIView,generics.RetrieveUpdateDestroyAPIView,viewsets.ViewSet,viewsets.GenericViewSet,viewsets.ModelViewSet,viewsets.ReadOnlyModelViewSet]
framework=[]
for cls in classes:
    framework.append({'name':cls.__module__+'.'+cls.__name__,'mro':[base.__module__+'.'+base.__name__ for base in cls.__mro__],'httpMethods':[method.upper() for method in cls.http_method_names if hasattr(cls,method)]})
print(json.dumps({'python':'.'.join(map(str,sys.version_info[:3])),'django':django.get_version(),'drf':rest_framework.__version__,'urls':urls,'cbvMethods':instance._allowed_methods(),'apiViewMethods':api.cls()._allowed_methods(),'routers':routers,'framework':framework,'converters':converters,'decorators':decorators,'suffixes':suffixes,'includes':includes,'policy':'First-party synthetic declarations only; no django.setup, apps population, inspected imports/settings, database or view body execution'}))
`;
const records=[];
for(const [tuple,python,django,drf,exe]of [["django52","3.12.15","5.2.18","3.16.1","node_modules/.fs05-experiments/Python-3.12.15/PCbuild/amd64/python.exe"],["django60","3.13.16","6.0.9","3.17.2","node_modules/.fs05-experiments/cpython31316/python.exe"]]){
  try{const output=execFileSync(path.resolve(exe),["-I","-S","-c",script,path.resolve("node_modules/.fs06-experiments",tuple,"packages")],{encoding:"utf8",timeout:30000,windowsHide:true});writeFileSync(`docs/fs-06/evidence/oracle-output-${tuple}.json`,output);const result=JSON.parse(output);assert.equal(result.python,python);assert.equal(result.django,django);assert.equal(result.drf,drf);records.push({tuple,status:"PASS",profile:"static-python-declared-environment",generatorHash:createHash("sha256").update(readFileSync(import.meta.filename)).digest("hex"),oracleScriptHash:createHash("sha256").update(script).digest("hex"),executableHash:createHash("sha256").update(readFileSync(exe)).digest("hex"),outputHash:createHash("sha256").update(output).digest("hex"),result});}
  catch(error){records.push({tuple,status:"UNVERIFIED",reason:error instanceof Error?error.message:"oracle unavailable"});}
}
writeFileSync("docs/fs-06/evidence/framework-oracles.json",JSON.stringify(records,null,2)+"\n");assert(records.every(r=>r.status==="PASS"),"Every mandatory tuple oracle must PASS");
