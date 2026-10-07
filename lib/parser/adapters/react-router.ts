import { Node, SyntaxKind,type CallExpression } from "ts-morph";
import type { CodeSnapshot } from "../../engine/types.ts";
import type { Variant, Matcher, Witness } from "../../model/framework.ts";
import { factId } from "../../model/framework.ts";
import { frameworkBindings, type FrameworkSource } from "../framework-bindings.ts";
import { frameworkFact } from "../framework-budget.ts";

/** Selected navigation matcher only. Multiple matches never establish precedence. */
export function matchesNavigation(matcher:Matcher,destination:string):boolean {
  if(matcher.state!=="supported"||!destination.startsWith("/")||/[?#]/.test(destination))return false;
  let parts:string[];
  try{const path=destination.replace(/\/+$/,""),raw=path ? path.slice(1).split("/") : [];parts=raw.map(p=>decodeURIComponent(p));}catch{return false;}
  for(let index=0;index<matcher.segments.length;index++){
    const segment=matcher.segments[index];if(segment.kind==="catchAll")return segment.optional||index<parts.length;
    const value=parts[index];if(value===undefined||!value)return false;
    if(segment.kind==="literal"&&!new RegExp("^"+segment.value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"$",matcher.caseSensitive ? "" : "i").test(value))return false;
  }
  return parts.length===matcher.segments.length;
}

/** Router registration evidence is separate from HTTP endpoints and direct calls. */
export function extractReactRouter(snapshot: CodeSnapshot, inputs: FrameworkSource[], variant: Variant, resolve: (from: string, specifier: string) => string | undefined, version: string, checkpoint:()=>void = ()=>{}) {
  if (version !== "7.18.4") return;
  const b = frameworkBindings(snapshot, inputs, variant, resolve, checkpoint);
  const routerApi = (n: Node) => { const api = b.api(n); return api?.module === "react-router" ? api.name : undefined; };
  const context = (n:Node) => {
    const router=n.getAncestors().find(a=>Node.isJsxElement(a) && ["BrowserRouter","HashRouter","MemoryRouter"].includes(routerApi(a.getOpeningElement().getTagNameNode()) ?? ""));
    if(!router||!Node.isJsxElement(router))return;
    // A basename or spread can alter identity. This qualified subset has no router options.
    if(router.getOpeningElement().getAttributes().length){b.gap(router,"dynamic-expression");return;}
    return router;
  };
  const routeContexts=new Map<string,Node|undefined>();
  const uncertainScopes=new Set<Node|undefined>();
  const unresolvedRoute=(node:Node,reason:"resource-limit"|"dynamic-expression"|"unsupported-syntax"|"unsupported-matcher"="dynamic-expression")=>{uncertainScopes.add(context(node));b.gap(node,reason);};
  const declarations=new Map(snapshot.behavior.declarations.map(d=>[d.id,d]));
  const componentScopes=new Map<string,{contexts:Set<Node|undefined>;sites:Node[]}>();
  for(const input of inputs)for(const node of input.sourceFile.getDescendants())if(Node.isJsxOpeningElement(node)||Node.isJsxSelfClosingElement(node)) {
    const target=b.identifier(node.getTagNameNode());if(!target||!snapshot.analysis.bindings.some(binding=>binding.kind==="component-reference"&&binding.variantId===variant.id&&binding.targetId===target.id&&binding.occurrence.file===b.site(node).file&&binding.occurrence.start===b.site(node.getTagNameNode()).start))continue;
    const value=componentScopes.get(target.id)??{contexts:new Set<Node|undefined>(),sites:[]};value.contexts.add(context(node));value.sites.push(node);componentScopes.set(target.id,value);
  }
  const scope=(node:Node)=>{
    const direct=context(node);if(direct)return {router:direct,proof:[b.witness(b.site(direct))] as Witness[]};
    const enclosing=node.getAncestors().map(n=>b.declaration(n)).find(d=>d&&componentScopes.has(d.id));
    const component=enclosing ? componentScopes.get(enclosing.id) : undefined;
    if(!component||component.contexts.size!==1||component.contexts.has(undefined))return;
    const router=[...component.contexts][0]!;
    return {router,proof:[b.witness(b.site(router)),...component.sites.map(site=>b.witness(b.site(site)))]};
  };
  const imperative:{call:CallExpression;destination:string;owner:NonNullable<ReturnType<typeof scope>>}[]=[];
  const text = (n: Node | undefined) => n && (Node.isStringLiteral(n) || Node.isNoSubstitutionTemplateLiteral(n)) ? n.getLiteralText() : undefined;
  const attributes = (n: Node) => {
    const opening = Node.isJsxElement(n) ? n.getOpeningElement() : Node.isJsxSelfClosingElement(n) ? n : undefined;
    const values = new Map<string, Node | undefined>();
    let valid = !!opening;
    for (const attribute of opening?.getAttributes() ?? []) {
      if (!Node.isJsxAttribute(attribute)) { valid = false; continue; }
      const key = attribute.getNameNode().getText(), raw = attribute.getInitializer();
      if (values.has(key)) valid = false;
      values.set(key, raw && Node.isJsxExpression(raw) ? raw.getExpression() : raw);
    }
    return { values, valid };
  };
  const fields = (n: Node) => {
    const values = new Map<string, Node | undefined>(); let valid = Node.isObjectLiteralExpression(n);
    if (Node.isObjectLiteralExpression(n)) for (const p of n.getProperties()) {
      if (Node.isPropertyAssignment(p) && (Node.isIdentifier(p.getNameNode()) || Node.isStringLiteral(p.getNameNode()))) {
        const name=p.getNameNode(),key=Node.isStringLiteral(name) ? name.getLiteralText() : p.getName(); if (values.has(key)) valid = false; values.set(key, p.getInitializer());
      } else if (Node.isShorthandPropertyAssignment(p)) { if (values.has(p.getName())) valid = false; values.set(p.getName(), p.getNameNode()); }
      else valid = false;
    }
    return { values, valid };
  };
  function register(n: Node, parent: string, prefixes: Witness[], data: boolean, depth = 0) {
    checkpoint();
    if (depth > 32 || snapshot.analysis.registrations.length >= 10000) { unresolvedRoute(n, "resource-limit"); return; }
    const { values, valid } = data ? fields(n) : attributes(n);
    if (!valid) { unresolvedRoute(n, "dynamic-expression"); return; }
    const pathNode = values.get("path"), index = values.has("index");
    if (index && values.get("index") && values.get("index")!.getKind() !== SyntaxKind.TrueKeyword || pathNode && text(pathNode) === undefined || index && pathNode) { unresolvedRoute(n); return; }
    const localPath = text(pathNode) ?? "";
    if (localPath.startsWith("/") && parent && !(localPath === parent || localPath.startsWith(parent + "/"))) { unresolvedRoute(n, "unsupported-matcher"); return; }
    const rawPattern = (localPath.startsWith("/") ? localPath : parent + "/" + localPath).replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    const occurrence = b.site(n), id = factId("registration:navigation", occurrence, variant.id, rawPattern), gapIds: string[] = [];
    const segments: Extract<Matcher, { state: "supported" }>["segments"] = [];
    let supported = true;
    const names = new Set<string>();
    for (const [i, segment] of rawPattern.split("/").filter(Boolean).entries()) {
      if (segment === "*" && i === rawPattern.split("/").filter(Boolean).length - 1) segments.push({ kind: "catchAll", name: "*", optional: true });
      else if (/^:[\w-]+$/.test(segment) && !names.has(segment.slice(1))) { names.add(segment.slice(1)); segments.push({ kind: "parameter", name: segment.slice(1), converter: "segment" }); }
      else if (!/[?*:%]/.test(segment)) segments.push({ kind: "literal", value: segment }); else supported = false;
    }
    const caseNode = values.get("caseSensitive");
    if (caseNode && ![SyntaxKind.TrueKeyword, SyntaxKind.FalseKeyword].includes(caseNode.getKind())) supported = false;
    const addGap = (reason: "ambiguous-target" | "unsupported-matcher") => { b.gap(n, reason); const gap = factId("gap", occurrence, variant.id, reason); gapIds.push(gap); return gap; };
    const componentNode = values.get("Component") ?? values.get("element");
    const tag = componentNode && Node.isJsxElement(componentNode) ? componentNode.getOpeningElement().getTagNameNode() : componentNode && Node.isJsxSelfClosingElement(componentNode) ? componentNode.getTagNameNode() : componentNode;
    const handler = tag ? b.identifier(tag) : undefined;
    if (!handler?.callable) addGap("ambiguous-target");
    const matcher: Matcher = supported ? { state: "supported", segments, trailingSlash: "optional", caseSensitive: values.has("caseSensitive") && (!caseNode || caseNode.getKind() === SyntaxKind.TrueKeyword), decodingPolicy: "percent-decode-segments" } : { state: "unsupported", gapId: addGap("unsupported-matcher") };
    routeContexts.set(id,context(n));
    const witnesses = [b.witness(occurrence, "registration"), ...(handler?.callable ? [b.witness(handler.site, "declaration")] : []), ...variant.configWitnesses];
    frameworkFact(snapshot,occurrence.file);
    snapshot.analysis.registrations.push({ id, kind: "navigation", handlerId: handler?.callable ? handler.id : null, variantId: variant.id, occurrence, rawPattern, methodState: null, matcher, precedence: null, conditions: [data ? "router-mode:data" : "router-mode:declarative", ...(index ? ["index"] : []), ...(values.has("lazy") ? ["lazy:unresolved"] : [])], prefixWitnesses: prefixes, witnesses, legacyRouteIndex: null, gapIds });
    b.bind("registration", n, id, data ? "router/data-route" : "router/jsx-route");
    if (handler) b.bind("component-reference", componentNode!, handler, "router/route-component");
    for (const key of ["loader", "action"]) if (values.has(key)) {
      const value = values.get(key), declaration = value ? b.target(value) : undefined;
      if (declaration?.callable) b.bind("lifecycle", value!, declaration, "router/" + key); else b.gap(n, "ambiguous-target");
    }
    if (values.has("lazy")) b.gap(n, "dynamic-expression");
    const next = [...prefixes, b.witness(occurrence, "registration")];
    if (data) {
      const children = values.get("children");
      if (children && Node.isArrayLiteralExpression(children)) for (const child of children.getElements()) register(child, rawPattern, next, true, depth + 1);
      else if (children) unresolvedRoute(children);
    } else if (Node.isJsxElement(n)) for (const child of n.getJsxChildren()) if (Node.isJsxElement(child) || Node.isJsxSelfClosingElement(child)) {
      const opening = Node.isJsxElement(child) ? child.getOpeningElement() : child;
      if (routerApi(opening.getTagNameNode()) === "Route") register(child, rawPattern, next, false, depth + 1); else unresolvedRoute(child, "unsupported-syntax");
    }
    if(!data&&Node.isJsxElement(n))for(const child of n.getJsxChildren())if(Node.isJsxExpression(child)&&child.getExpression())unresolvedRoute(child);
  }
  for (const { sourceFile } of inputs) {
    for(const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if(!Node.isIdentifier(call.getExpression()))continue;
      const target=b.identifier(call.getExpression()),declaration=target ? declarations.get(target.id) : undefined;
      const definition=declaration ? sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find(n=>b.declaration(n)?.id===declaration.id) : undefined;
      const init=definition?.getInitializer();if(!init||!Node.isCallExpression(init)||routerApi(init.getExpression())!=="useNavigate")continue;
      const destination=text(call.getArguments()[0]),owner=scope(init);
      if(!destination||call.getArguments().length!==1||!destination.startsWith("/")||/[?#]/.test(destination)||!owner){b.gap(call,"ambiguous-target");continue;}
      // Process after registration extraction below, with the proved component scope.
      imperative.push({call,destination,owner});
    }
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (!["createBrowserRouter", "createHashRouter", "createMemoryRouter"].includes(routerApi(call.getExpression()) ?? "")) continue;
      // Nonliteral basename/options change route identity; never silently ignore them.
      if (call.getArguments().length !== 1) { b.gap(call, "dynamic-expression"); continue; }
      const routes = call.getArguments()[0];
      if (routes && Node.isArrayLiteralExpression(routes)) for (const route of routes.getElements()) register(route, "", [], true); else b.gap(call);
    }
    for (const node of sourceFile.getDescendants()) if (Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node)) {
      const opening = Node.isJsxElement(node) ? node.getOpeningElement() : node, api = routerApi(opening.getTagNameNode());
      if (api === "Route") {
        const parent = node.getParent(), parentOpening = Node.isJsxElement(parent) ? parent.getOpeningElement() : undefined;
        if (parentOpening && routerApi(parentOpening.getTagNameNode()) === "Routes") register(node, "", [], false);
        else if(!parentOpening||routerApi(parentOpening.getTagNameNode())!=="Route")unresolvedRoute(node,"unsupported-syntax");
      }
      if(api==="Routes"&&Node.isJsxElement(node))for(const child of node.getJsxChildren())if(Node.isJsxExpression(child)&&child.getExpression())unresolvedRoute(child);else if((Node.isJsxElement(child)||Node.isJsxSelfClosingElement(child))&&routerApi((Node.isJsxElement(child) ? child.getOpeningElement() : child).getTagNameNode())!=="Route")unresolvedRoute(child,"unsupported-syntax");
    }
  }
  const matchesInScope=(destination:string,router:Node)=>{const routes=snapshot.analysis.registrations.filter(r=>r.variantId===variant.id&&r.kind==="navigation"&&routeContexts.get(r.id)===router);return uncertainScopes.has(router)||snapshot.analysis.gaps.some(g=>g.variantId===variant.id&&g.reason==="resource-limit")||routes.some(r=>r.matcher.state!=="supported") ? [] : routes.filter(r=>matchesNavigation(r.matcher,destination));};
  for(const {call,destination,owner} of imperative){const matches=matchesInScope(destination,owner.router);if(matches.length===1)b.bind("navigation",call,matches[0].id,"router/literal-useNavigate",b.owner(call),owner.proof);else b.gap(call,"ambiguous-target");}
  for (const {sourceFile} of inputs) for (const node of sourceFile.getDescendants()) if (Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node)) {
      checkpoint();
      const opening=Node.isJsxElement(node) ? node.getOpeningElement() : node,api=routerApi(opening.getTagNameNode());
      if (["Link", "NavLink", "Navigate"].includes(api ?? "")) {
        const { values, valid } = attributes(node), to = values.get("to"), destination = text(to);
        if (!valid || !destination || !destination.startsWith("/") || /[?#]/.test(destination)) { b.gap(node); continue; }
        const owner=scope(node);
        if (!owner) {b.gap(node,"ambiguous-target");continue;}
        const matches = matchesInScope(destination,owner.router);
        if (matches.length === 1) b.bind("navigation", node, matches[0].id, "router/literal-link",b.owner(node),owner.proof); else b.gap(node, "ambiguous-target");
      }
  }
}
