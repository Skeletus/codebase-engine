import { Node, SyntaxKind } from "ts-morph";
import type { CodeSnapshot } from "../../engine/types.ts";
import type { Selection } from "../index.ts";
import type { FrameworkSource } from "../framework-bindings.ts";
import { frameworkBindings } from "../framework-bindings.ts";
import { metroProfile, metroTuple, type MetroMode } from "./metro-profile.ts";
import { seedFrameworkCallbacks } from "../framework-budget.ts";
import { qualifyViteCalls } from "./vite-calls.ts";
import { validateSnapshot } from "../../engine/contract.ts";
import { extractReactBindings } from "./vite-react.ts";

/** RN application projection; native implementations and executable tooling are
 * never loaded. Partial capability assessments retain missing pattern proof.
 */
export function extractReactNative(snapshot: CodeSnapshot, selection: Selection, inputs: FrameworkSource[], modes: readonly MetroMode[] = ["android-development"]) {
  // Unqualified tuples keep the accepted discovery/TS scaffold and its partial
  // assessment. Package-name detection alone cannot activate runtime semantics.
  const discovery = selection.walk.discovery, projects = discovery.projects.filter(p => p.composition.frameworks.includes("react-native") && metroTuple(p.versions));
  if (!projects.length) return snapshot;
  if (!modes.length || modes.some(mode => !["android-development", "ios-development"].includes(mode))) throw Error("Unsupported Metro variant");
  seedFrameworkCallbacks(snapshot);
  for (const project of projects) for (const mode of [...new Set(modes)]) {
    discovery.boundary.check();
    const profile = metroProfile(snapshot, discovery, project, mode);
    const owned = inputs.filter(i => profile.sources.has(i.candidate.path));
    const resolve = (from: string, specifier: string) => { const result = profile.resolve(from, specifier); return result.state === "resolved" && result.category === "module" && result.targets.length === 1 ? result.targets[0] : undefined; };
    const b = frameworkBindings(snapshot, owned, profile.variant, resolve, () => discovery.boundary.check(), "fs-07/1");
    for (const input of owned) {
      const first = input.sourceFile.getStatements()[0];
      if (first && (!profile.configSafe || !profile.tuple)) profile.gap(b.site(first), profile.tuple ? "custom-resolver" : "missing-metadata");
      if (discovery.sourceInputs.get(input.candidate.path)?.validUtf8 === false || input.sourceFile.getDescendants().length > 100000) {
        if (first) profile.gap(b.site(first), discovery.sourceInputs.get(input.candidate.path)?.validUtf8 === false ? "unsupported-encoding" : "resource-limit"); continue;
      }
      for (const n of input.sourceFile.getDescendants()) {
        discovery.boundary.check();
        let specifier: string | undefined, isImport = true;
        if (Node.isImportDeclaration(n) && !n.isTypeOnly() && (!n.getNamedImports().length || n.getDefaultImport() || n.getNamespaceImport() || n.getNamedImports().some(i => !i.isTypeOnly()))) specifier = n.getModuleSpecifierValue();
        if (Node.isExportDeclaration(n) && !n.isTypeOnly() && (!n.getNamedExports().length || n.getNamedExports().some(e => !e.isTypeOnly()))) specifier = n.getModuleSpecifierValue();
        if (Node.isCallExpression(n)) {
          const expression = n.getExpression(), dynamicImport = expression.getKind() === SyntaxKind.ImportKeyword;
          const require = Node.isIdentifier(expression) && expression.getText() === "require" && !expression.getSymbol()?.getDeclarations().length;
          if (dynamicImport || require) {
            const argument = n.getArguments()[0]; isImport = dynamicImport;
            if (n.getArguments().length === 1 && argument && Node.isStringLiteral(argument)) specifier = argument.getLiteralText(); else profile.gap(b.site(n), "dynamic-expression");
          }
        }
        if (specifier) {
          const result = profile.resolve(input.candidate.path, specifier, isImport);
          if (result.state === "resolved") for (const target of result.targets) profile.bind(b.site(n), target, result.category === "asset" ? "asset" : "module-dependency", result.rule);
          else if (result.state === "boundary") profile.gap(b.site(n), result.reason);
          else profile.gap(b.site(n), "external-boundary");
        }
      }
    }
    if (profile.tuple && profile.configSafe) {
      qualifyViteCalls(snapshot, owned, profile.variant, resolve, () => discovery.boundary.check(), "fs-07/1");
      const metadata = discovery.metadata.all().find(r => r.resource.path === (project.path === "." ? "package.json" : project.path + "/package.json"))?.json;
      const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
      const frameworkNames = ["react", "react-native", "expo", "expo-router", "@react-navigation/native", "@react-navigation/native-stack"];
      const redirectedFramework = object(metadata) && (["react-native", "browser"].some(field => object(metadata[field]) && Object.keys(metadata[field]).some(key => frameworkNames.some(name => key === name || key.startsWith(name + "/")))) || frameworkNames.includes(String(metadata.name)));
      if (!redirectedFramework) {
        const nativeEvents: Readonly<Record<string, readonly string[]>> = {Pressable: ["onPress", "onLongPress", "onPressIn", "onPressOut"], TouchableOpacity: ["onPress", "onLongPress", "onPressIn", "onPressOut"], Button: ["onPress"], TextInput: ["onChange", "onChangeText", "onFocus", "onBlur", "onSubmitEditing", "onEndEditing"], ScrollView: ["onScroll", "onScrollBeginDrag", "onScrollEndDrag", "onMomentumScrollBegin", "onMomentumScrollEnd"], View: ["onLayout"]};
        extractReactBindings(snapshot, owned, profile.variant, resolve, project.versions.react, () => discovery.boundary.check(), undefined, true, "fs-07/1", {module: "react-native", events: nativeEvents});
        for (const input of owned) for (const call of input.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
          const api = b.api(call.getExpression());
          if (api?.module === "react-native" && api.name === "AppRegistry.registerComponent") {
            const [name, provider] = call.getArguments();
            if (!name || !Node.isStringLiteral(name) || !provider || !Node.isArrowFunction(provider) && !Node.isFunctionExpression(provider) || call.getArguments().length !== 2 || provider.getParameters().length) { b.gap(call); continue; }
            const body = provider.getBody();
            const statements = Node.isBlock(body) ? body.getStatements() : [], first = statements.length === 1 ? statements[0] : undefined;
            const returned = first && Node.isReturnStatement(first) ? first.getExpression() : Node.isIdentifier(body) ? body : undefined;
            const target = returned ? b.target(returned) : undefined;
            if (target && (target.callable || target.kind === "class")) b.bind("entry-point", call, target, "rn/app-registry-provider:" + name.getLiteralText()); else b.gap(call);
          }
          if (api?.module === "expo" && api.name === "registerRootComponent") {
            const argument = call.getArguments()[0], target = argument ? b.target(argument) : undefined;
            if (call.getArguments().length === 1 && target && (target.callable || target.kind === "class")) b.bind("entry-point", call, target, "expo/register-root-component"); else b.gap(call);
          }
        }
      } else for (const input of owned) { const first = input.sourceFile.getStatements()[0]; if (first) profile.gap(b.site(first), "custom-resolver"); }
    }
  }
  snapshot.analysis.resources.sort((a, b) => a.path.localeCompare(b.path));
  return validateSnapshot(snapshot);
}
