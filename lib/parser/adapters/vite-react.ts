import { Node, SyntaxKind } from "ts-morph";
import type { CodeSnapshot } from "../../engine/types.ts";
import type { Variant } from "../../model/framework.ts";
import { frameworkBindings, type FrameworkSource } from "../framework-bindings.ts";

/** React syntax/binding facts; none of these are executed CALLS edges. */
export function extractReactBindings(snapshot: CodeSnapshot, inputs: FrameworkSource[], variant: Variant, resolve: (from: string, specifier: string) => string | undefined, reactVersion: string, checkpoint:()=>void = ()=>{}, domVersion?:string,automaticJsx=false) {
  const b = frameworkBindings(snapshot, inputs, variant, resolve, checkpoint);
  const nodes = new Map(inputs.flatMap(i => i.sourceFile.getDescendants().flatMap(n => { const d = b.declaration(n); return d ? [[d.id, n] as const] : []; })));
  const checked = new Map<string, boolean>();
  function component(id: string, active = new Set<string>()): boolean {
    checkpoint();
    if (checked.has(id)) return checked.get(id)!;
    if (active.has(id) || active.size >= 64) return false;
    const node = nodes.get(id); if (!node) return false;
    const next = new Set(active).add(id);
    let result = false;
    if (Node.isClassDeclaration(node)) result = node.getExtends()?.getExpression() !== undefined && ["Component", "PureComponent"].includes(b.api(node.getExtends()!.getExpression())?.name ?? "") && b.api(node.getExtends()!.getExpression())?.module === "react";
    else if (Node.isFunctionDeclaration(node) || Node.isVariableDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
      const init = Node.isVariableDeclaration(node) ? node.getInitializer() : node;
      if (init && (Node.isFunctionDeclaration(init) || Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        const body = init.getBody();
        result = !!body?.getDescendants().some(n => (Node.isJsxElement(n) || Node.isJsxSelfClosingElement(n) || Node.isJsxFragment(n)) && n.getAncestors().find(a => Node.isFunctionDeclaration(a) || Node.isArrowFunction(a) || Node.isFunctionExpression(a)) === init);
        if (body && (Node.isJsxElement(body) || Node.isJsxSelfClosingElement(body) || Node.isJsxFragment(body))) result = true;
      } else if (init && Node.isIdentifier(init)) { const target = b.identifier(init); result = !!target && component(target.id, next);if(result&&target)b.bind("component-reference",init,target,"react/component-alias"); }
      else if (init && Node.isCallExpression(init)) {
        const api = b.api(init.getExpression());
        if (api?.module === "react" && ["memo", "forwardRef"].includes(api.name) && /^(?:18\.3\.1|19\.2\.8)$/.test(reactVersion)) {
          const target = init.getArguments()[0], declaration = target ? b.target(target) : undefined;
          result = !!declaration && component(declaration.id, next);
          if (result && declaration) b.bind("wrapper", init, declaration, "react/" + api.name);
          else b.gap(init, "unsupported-syntax");
        }
        if (api?.module === "react" && api.name === "lazy") {
          const callback = init.getArguments()[0];
          const body = callback && Node.isArrowFunction(callback) ? callback.getBody() : undefined;
          const imported = body && Node.isCallExpression(body) ? body.getArguments()[0] : undefined;
          if (body && Node.isCallExpression(body) && body.getExpression().getKind() === SyntaxKind.ImportKeyword && body.getArguments().length === 1 && imported && Node.isStringLiteral(imported)) {
            const from = b.site(body).file, path = resolve(from, imported.getLiteralText());
            const source = path ? b.byPath.get(path) : undefined, target = source ? b.exported(source, "default") : undefined;
            result = !!target && component(target.id, next);
            if (result && target) b.bind("wrapper", init, target, "react/lazy"); else b.gap(init);
          } else b.gap(init);
        }
      }
    }
    checked.set(id, result); return result;
  }
  for (const { sourceFile } of inputs) {
    for(const klass of sourceFile.getClasses()) {
      const declaration=b.declaration(klass);if(!declaration||!component(declaration.id)||klass.getDecorators().length)continue;
      const dynamic=klass.getDescendantsOfKind(SyntaxKind.BinaryExpression).some(n=>n.getLeft().getText().startsWith("this."))||klass.getProperties().some(p=>["render","componentDidMount","componentDidUpdate","componentWillUnmount"].includes(p.getName()));
      for(const property of klass.getProperties().filter(p=>["render","componentDidMount","componentDidUpdate","componentWillUnmount"].includes(p.getName())))b.gap(property,"unsupported-syntax");
      for(const method of klass.getMethods().filter(m=>["render","componentDidMount","componentDidUpdate","componentWillUnmount"].includes(m.getName()))) {
        const target=b.declaration(method);if(!dynamic&&target?.callable&&!method.isStatic()&&!method.getDecorators().length)b.bind("lifecycle",method,target,"react/class/"+method.getName(),declaration.id);else b.gap(method,"ambiguous-target");
      }
    }
    for (const node of sourceFile.getDescendants()) {
      checkpoint();
      if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) {
        if (reactVersion==="18.3.1" && !automaticJsx && !b.implicitReact(node)) {b.gap(node,"ambiguous-target");continue;}
        const tag = node.getTagNameNode(), api = b.api(tag);
        if (Node.isIdentifier(tag) && /^[A-Z]/.test(tag.getText()) && !(api?.module === "react" && ["Fragment", "StrictMode", "Suspense"].includes(api.name))) {
          const target = b.identifier(tag);
          if(target&&context(target.id)&&reactVersion==="19.2.8")b.bind("context",tag,target,"react/context-provider-shorthand");
          else if (target && component(target.id)) b.bind("component-reference", tag, target, "react/jsx"); else b.gap(tag, target ? "unsupported-syntax" : api ? "external-boundary" : "ambiguous-target");
        } else if (Node.isPropertyAccessExpression(tag) && ["Provider","Consumer"].includes(tag.getName())) {
          const target = b.identifier(tag.getExpression());
          if (target && context(target.id)) {
            b.bind("context",tag,target,tag.getName()==="Provider" ? "react/context-provider" : "react/context-consumer-element");
            if(tag.getName()==="Consumer"){
              const children=(Node.isJsxOpeningElement(node) ? node.getParentIfKind(SyntaxKind.JsxElement)?.getJsxChildren()??[] : []).filter(child=>Node.isJsxText(child) ? !!child.getText().trim() : !Node.isJsxExpression(child)||!!child.getExpression());
              const child=children.length===1 ? children[0] : undefined,value=child&&Node.isJsxExpression(child) ? child.getExpression() : undefined,callback=value ? b.target(value) : undefined;
              if(child&&callback?.callable)b.bind("lifecycle",child,callback,"react/context-consumer-callback");else b.gap(node,"ambiguous-target");
            }
          }else b.gap(tag);
        }else if(Node.isPropertyAccessExpression(tag)&&!(api?.module==="react"&&["Fragment","StrictMode","Suspense"].includes(api.name))) {
          const target=b.identifier(tag);if(target&&component(target.id))b.bind("component-reference",tag,target,"react/jsx-namespace");else b.gap(tag,"ambiguous-target");
        }
        for (const attribute of node.getAttributes()) {
          if (Node.isJsxSpreadAttribute(attribute)) { b.gap(attribute); continue; }
          if (!Node.isJsxAttribute(attribute) || !/^on[A-Z]/.test(attribute.getNameNode().getText())) continue;
          if(node.getAttributes().some(Node.isJsxSpreadAttribute)||node.getAttributes().filter(a=>Node.isJsxAttribute(a)&&a.getNameNode().getText()===attribute.getNameNode().getText()).length!==1){b.gap(attribute,"ambiguous-target");continue;}
          const initializer = attribute.getInitializer(), expr = initializer && Node.isJsxExpression(initializer) ? initializer.getExpression() : undefined;
          const target = expr ? b.target(expr) : undefined;
          // Custom callback props require a separately proved receiving binding.
          if (Node.isIdentifier(tag) && /^[a-z]/.test(tag.getText()) && target?.callable) b.bind("event-handler", attribute, target, "react/intrinsic-event"); else b.gap(attribute, "ambiguous-target");
        }
      }
      if (!Node.isCallExpression(node)) continue;
      const api = b.api(node.getExpression());
      if (api?.module.startsWith("react-dom") && domVersion !== reactVersion) {b.gap(node,"missing-metadata");continue;}
      if (api?.module==="react-dom" && ["render","hydrate"].includes(api.name) && reactVersion !== "18.3.1") {b.gap(node,"unsupported-syntax");continue;}
      if (api?.module === "react-dom/server" && ["renderToString","renderToStaticMarkup","renderToPipeableStream","renderToReadableStream"].includes(api.name)) {
        const element=node.getArguments()[0], tag=element && Node.isJsxElement(element) ? element.getOpeningElement().getTagNameNode() : element && Node.isJsxSelfClosingElement(element) ? element.getTagNameNode() : undefined, target=tag ? b.identifier(tag) : undefined;
        if (variant.environment.startsWith("ssr") && reactVersion === "19.2.8" && target && component(target.id)) b.bind("entry-point",node,target,"react/ssr/"+api.name); else b.gap(node,"variant-not-selected");
      }
      if (api?.module === "react" && ["useEffect", "useLayoutEffect", "useInsertionEffect"].includes(api.name)) {
        const target = node.getArguments()[0], declaration = target ? b.target(target) : undefined;
        if (declaration?.callable) {
          b.bind("lifecycle", node, declaration, "react/" + api.name + "/callback");
          const definition = nodes.get(declaration.id);
          const callback = definition && Node.isVariableDeclaration(definition) ? definition.getInitializer() : definition;
          for (const returned of callback?.getDescendantsOfKind(SyntaxKind.ReturnStatement) ?? []) {
            if (returned.getAncestors().find(a => Node.isFunctionDeclaration(a) || Node.isArrowFunction(a) || Node.isFunctionExpression(a)) !== callback) continue;
            const value = returned.getExpression(), cleanup = value ? b.target(value) : undefined;
            if (cleanup?.callable) b.bind("lifecycle", returned, cleanup, "react/effect-cleanup"); else if (value) b.gap(returned);
          }
        } else b.gap(node, "unsupported-syntax");
      }
      if (api?.module === "react" && (api.name === "useContext"||api.name==="use"&&reactVersion==="19.2.8")) {
        const target = node.getArguments()[0], declaration = target ? b.identifier(target) : undefined;
        if (declaration && context(declaration.id)) b.bind("context", node, declaration, "react/context-consumer"); else b.gap(node);
      }
      if(api?.module==="react") {
        const callbacks:Readonly<Record<string,readonly number[]>>={useCallback:[0],useMemo:[0],useReducer:[0,2],useImperativeHandle:[1],useSyncExternalStore:[0,1,2],...(reactVersion==="19.2.8" ? {useActionState:[0],useOptimistic:[1],useEffectEvent:[0]} : {})};
        for(const index of callbacks[api.name]??[]){const argument=node.getArguments()[index];if(!argument)continue;const target=b.target(argument);if(target?.callable)b.bind("hook",argument,target,"react/"+api.name+"/callback/"+index);else b.gap(argument,"ambiguous-target");}
        if(api.name==="useState"){const argument=node.getArguments()[0],target=argument ? b.target(argument) : undefined;if(target?.callable)b.bind("hook",argument!,target,"react/useState/initializer");else if(argument&&(Node.isIdentifier(argument)||Node.isCallExpression(argument)))b.gap(argument,"ambiguous-target");}
        if(reactVersion==="18.3.1"&&["useActionState","useOptimistic","useEffectEvent"].includes(api.name))b.gap(node,"unsupported-syntax");
      }
      if (Node.isIdentifier(node.getExpression()) && /^use[A-Z]/.test(node.getExpression().getText()) && !api) {
        const target = b.identifier(node.getExpression()), definition = target ? nodes.get(target.id) : undefined;
        const containsHook = definition?.getDescendantsOfKind(SyntaxKind.CallExpression).some(c => { const hook = b.api(c.getExpression()); return b.owner(c)===target?.id && hook?.module === "react" && /^use[A-Z]/.test(hook.name); });
        if (target?.callable && containsHook) b.bind("hook", node, target, "react/custom-hook"); else b.gap(node, "unsupported-syntax");
      }
      if (api?.module === "react-dom/client" && ["createRoot", "hydrateRoot"].includes(api.name) || api?.module === "react-dom" && ["render", "hydrate"].includes(api.name) && reactVersion === "18.3.1") {
        if (variant.environment.startsWith("ssr")) {b.gap(node,"variant-not-selected");continue;}
        const rootElement = api?.name === "hydrateRoot" ? node.getArguments()[1] : api?.module === "react-dom" ? node.getArguments()[0] : undefined;
        if (rootElement && (Node.isJsxElement(rootElement) || Node.isJsxSelfClosingElement(rootElement))) {
          if (reactVersion==="18.3.1" && !automaticJsx && !b.implicitReact(rootElement)) {b.gap(node,"ambiguous-target");continue;}
          const tag = Node.isJsxElement(rootElement) ? rootElement.getOpeningElement().getTagNameNode() : rootElement.getTagNameNode(), target = b.identifier(tag);
          if (target && component(target.id)) b.bind("entry-point", node, target, "react/" + api!.name); else b.gap(node);
        }
      }
      const expression = node.getExpression();
      if (domVersion === reactVersion && Node.isPropertyAccessExpression(expression) && expression.getName() === "render") {
        if (variant.environment.startsWith("ssr")) {b.gap(node,"variant-not-selected");continue;}
        const receiver = expression.getExpression();
        let root: Node | undefined = receiver;
        if (Node.isIdentifier(receiver)) { const d = b.identifier(receiver), n = d ? nodes.get(d.id) : undefined; root = n && Node.isVariableDeclaration(n) ? n.getInitializer() : undefined; }
        if (root && Node.isCallExpression(root) && b.api(root.getExpression())?.module === "react-dom/client" && b.api(root.getExpression())?.name === "createRoot") {
          const element = node.getArguments()[0];
          if (element && reactVersion==="18.3.1" && !automaticJsx && !b.implicitReact(element)) {b.gap(node,"ambiguous-target");continue;}
          const tag = element && Node.isJsxElement(element) ? element.getOpeningElement().getTagNameNode() : element && Node.isJsxSelfClosingElement(element) ? element.getTagNameNode() : undefined, target = tag ? b.identifier(tag) : undefined;
          if (target && component(target.id)) b.bind("entry-point", node, target, "react/createRoot-render"); else b.gap(node);
        }
      }
    }
  }
  function context(id: string): boolean {
    const n = nodes.get(id), init = n && Node.isVariableDeclaration(n) ? n.getInitializer() : undefined;
    return !!init && Node.isCallExpression(init) && b.api(init.getExpression())?.module === "react" && b.api(init.getExpression())?.name === "createContext";
  }
}
