import path from "node:path";
import { Node, SyntaxKind } from "ts-morph";
import type { CodeSnapshot } from "../../engine/types.ts";
import type { Selection } from "../index.ts";
import type { FrameworkSource } from "../framework-bindings.ts";
import { extractReactBindings } from "./vite-react.ts";
import { extractReactRouter } from "./react-router.ts";
import { viteProfile } from "./vite-profile.ts";
import { normalizeRange } from "../../model/positions.ts";
import { validateSnapshot } from "../../engine/contract.ts";
import { interpretConfig } from "../../engine/static-config.ts";
import { htmlModuleScripts } from "./vite-html.ts";
import { qualifyViteCalls } from "./vite-calls.ts";
import { seedFrameworkCallbacks } from "../framework-budget.ts";

export type ViteMode = "browser-development" | "browser-production" | "ssr-production";
export function extractVite(snapshot: CodeSnapshot, selection: Selection, inputs: FrameworkSource[], modes: readonly ViteMode[] = ["browser-development"]) {
  const discovery = selection.walk.discovery;
  if(!discovery.projects.some(p=>p.composition.frameworks.includes("vite")))return snapshot;
  if (modes.some(m=>!["browser-development","browser-production","ssr-production"].includes(m))) throw new Error("Unsupported Vite analysis variant");
  const auxiliaryText = new Map<string,string>();
  // Callback declarations share the new per-file fact ceiling with all
  // framework projections; do not allocate independent 20k allowances.
  seedFrameworkCallbacks(snapshot);
  for (const project of discovery.projects.filter(p => p.composition.frameworks.includes("vite"))) for (const mode of [...new Set(modes)]) {
    discovery.boundary.check();
    const profile = viteProfile(snapshot, discovery, project, mode, auxiliaryText);
    const selected=inputs.filter(i => discovery.inventory.some(f => f.path === i.candidate.path && f.owner === project.path));
    const valid=(input:FrameworkSource)=>selection.walk.candidates.find(c=>c.path===input.candidate.path)?.validUtf8 !== false;
    const owned=selected.filter(i=>valid(i) && i.sourceFile.getDescendants().length<=100000);
    for (const excluded of selected.filter(i=>!owned.includes(i))) {
      const text=excluded.sourceFile.getFullText(),end=text.length-(/\r\n$/.test(text)?2:/[\r\n]$/.test(text)?1:0);
      if (end) profile.gap({file:excluded.candidate.path,...normalizeRange(text,0,end,"utf16"),fileHash:excluded.candidate.hash,extractor:"vite/resource/fs-03-1",evidenceKind:"verified"},valid(excluded)?"resource-limit":"unsupported-encoding");
    }
    for (const { candidate, sourceFile } of owned) {
      const site = (n: Node) => ({ file: candidate.path, start:n.getStart(),end:n.getEnd(),line:n.getStartLineNumber(),endLine:n.getEndLineNumber(), fileHash: candidate.hash, extractor: "vite/fs-03-1", evidenceKind: "verified" as const });
      if (!profile.frameworkSafe || /@jsx(?:ImportSource|Factory)?\s/.test(sourceFile.getFullText())) {
        const first=sourceFile.getStatements()[0];if (first) profile.gap(site(first),"custom-resolver");
      }
      for (const node of sourceFile.getDescendants()) {
        discovery.boundary.check();
        let specifier: string | undefined;
        if (Node.isImportDeclaration(node) && !node.isTypeOnly() && (node.getDefaultImport() || node.getNamespaceImport() || !node.getNamedImports().length || node.getNamedImports().some(i => !i.isTypeOnly()))) specifier = node.getModuleSpecifierValue();
        if (Node.isExportDeclaration(node) && !node.isTypeOnly() && (!node.getNamedExports().length || node.getNamedExports().some(e => !e.isTypeOnly()))) specifier = node.getModuleSpecifierValue();
        if (Node.isCallExpression(node) && node.getExpression().getKind() === SyntaxKind.ImportKeyword) {
          const arg = node.getArguments()[0]; if (arg && Node.isStringLiteral(arg) && node.getArguments().length === 1) specifier = arg.getLiteralText(); else profile.gap(site(node), "dynamic-expression");
        }
        if (specifier) {
          const resolution = profile.resolve(candidate.path, specifier);
          if (resolution.state === "resolved") profile.bind(site(node), resolution.target, resolution.query.startsWith("worker") ? "worker" : resolution.category === "asset" || resolution.query ? "asset" : "module-dependency", "vite/literal-import/" + resolution.query);
          else profile.gap(site(node), resolution.reason);
        }
        if (Node.isCallExpression(node) && node.getExpression().getText() === "import.meta.glob") {
          const args = node.getArguments(), pattern = args[0];
          const patterns = pattern && Node.isStringLiteral(pattern) ? [pattern.getLiteralText()] : pattern && Node.isArrayLiteralExpression(pattern) && pattern.getElements().every(Node.isStringLiteral) ? pattern.getElements().map(e => Node.isStringLiteral(e) ? e.getLiteralText() : "") : undefined;
          let eager = false, selection = "*", query = "", valid = args.length <= 2;
          if (args[1]) {
            const options = interpretConfig(args[1].getText(), { expression: true, boundary: discovery.boundary }).value;
            if (options.kind !== "object") valid = false;
            else for (const [key, value] of Object.entries(options.properties)) {
              if (key === "eager" && value.kind === "literal" && typeof value.value === "boolean") eager = value.value;
              else if (key === "import" && value.kind === "literal" && typeof value.value === "string") selection = value.value;
              else if (key === "query" && value.kind === "literal" && typeof value.value === "string" && /^\?(?:raw|url)$/.test(value.value)) query = value.value;
              else valid = false;
            }
          }
          if (!patterns || !valid) { profile.gap(site(node), "dynamic-expression"); continue; }
          const expansion = profile.glob(candidate.path, patterns);
          if (expansion.reason) { profile.gap(site(node), expansion.reason); continue; }
          for (const match of expansion.matches) {
            const outcome = profile.resolve(candidate.path, "/" + path.posix.relative(profile.root, match) + query);
            if (outcome.state === "resolved") profile.bind(site(node), match, outcome.category === "asset" || query ? "asset" : "module-dependency", `vite/glob/${eager ? "eager" : "lazy"}/${selection}/${query}`); else profile.gap(site(node), outcome.reason);
          }
        }
        if (Node.isNewExpression(node) && node.getExpression().getText() === "URL") {
          const defs = node.getExpression().getSymbol()?.getDeclarations() ?? [];
          if (defs.length) continue; // A shadowed URL constructor is not the platform API.
          const args = node.getArguments(), first = args[0], second = args[1];
          if (!first || !Node.isStringLiteral(first) || second?.getText() !== "import.meta.url" || args.length !== 2) { profile.gap(site(node), "dynamic-expression"); continue; }
          const outcome = profile.resolve(candidate.path, first.getLiteralText());
          const parent = node.getParent(), worker = parent && Node.isNewExpression(parent) && ["Worker", "SharedWorker"].includes(parent.getExpression().getText()) && !(parent.getExpression().getSymbol()?.getDeclarations().length);
          if (worker && parent.getArguments()[1]) {
            const options = interpretConfig(parent.getArguments()[1].getText(), { expression: true, boundary: discovery.boundary }).value;
            if (options.kind !== "object" || Object.entries(options.properties).some(([key,value]) => !["type","name"].includes(key) || value.kind !== "literal" || typeof value.value !== "string" || key === "type" && !["module","classic"].includes(value.value))) { profile.gap(site(parent), "dynamic-expression"); continue; }
          }
          if (outcome.state === "resolved" && worker && outcome.category !== "module") profile.gap(site(parent),"unsupported-syntax");
          else if (outcome.state === "resolved") profile.bind(site(worker ? parent : node), outcome.target, worker ? "worker" : "asset", worker ? "vite/worker-url" : "vite/static-url"); else profile.gap(site(node), outcome.reason);
        }
      }
    }
    // A bounded literal HTML subset. Entity/computed/inline script syntax stays a gap.
    for (const file of [...profile.auxiliary].filter(p => p.endsWith(".html") && !mode.startsWith("ssr") && (profile.root === "." || p.startsWith(profile.root+"/")))) {
      const entryState=profile.htmlEntryState(file);if (entryState === false) continue;
      const resource = profile.readAuxiliary(file); if (!resource?.utf16Length) continue;
      const text = profile.auxiliaryText.get(file)!;
      for (const script of htmlModuleScripts(text,()=>discovery.boundary.check())) {
        const occurrence = { file, ...normalizeRange(text, script.start, script.end, "utf16"), fileHash: resource.hash, extractor: "vite/html/fs-03-1", evidenceKind: "verified" as const };
        if (entryState === undefined) {profile.gap(occurrence,"unsupported-syntax");continue;}
        if (script.ambiguous || !script.src || /[&{}<>]/.test(script.src)) { profile.gap(occurrence, "dynamic-expression"); continue; }
        const spec = script.src, outcome = profile.resolve(file, spec.startsWith("/") || spec.startsWith(".") ? spec : "./" + spec);
        if (outcome.state === "resolved" && outcome.category === "module") profile.bind(occurrence, outcome.target, "entry-point", "vite/html-module"); else profile.gap(occurrence, outcome.state === "boundary" ? outcome.reason : "unsupported-syntax");
      }
    }
    if (profile.tuple !== "unqualified-version" && profile.frameworkSafe && (mode !== "ssr-production" || profile.tuple === "vite8-react19")) {
      const qualified=owned.filter(i=>!/@jsx(?:ImportSource|Factory)?\s/.test(i.sourceFile.getFullText()));
      qualifyViteCalls(snapshot,owned,profile.variant,(from,specifier)=>{const outcome=profile.resolve(from,specifier);return outcome.state === "resolved" && outcome.category === "module" ? outcome.target : undefined;},()=>discovery.boundary.check());
      if (project.composition.frameworks.includes("React")) extractReactBindings(snapshot, qualified, profile.variant, (from, specifier) => { const outcome = profile.resolve(from, specifier); return outcome.state === "resolved" && outcome.category === "module" ? outcome.target : undefined; }, project.versions.react, () => discovery.boundary.check(), project.versions["react-dom"],profile.automaticJsx);
      extractReactRouter(snapshot, qualified, profile.variant, (from, specifier) => { const outcome = profile.resolve(from, specifier); return outcome.state === "resolved" && outcome.category === "module" ? outcome.target : undefined; }, project.versions["react-router"], () => discovery.boundary.check());
    }
  }
  snapshot.analysis.resources.sort((a, b) => a.path.localeCompare(b.path));
  return validateSnapshot(snapshot);
}
