import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Static fixture only: its package/config/code is never installed or executed. */
export function createBehaviorFixture(root: string) {
  if (existsSync(root)) throw new Error("Choose a new, nonexistent fixture directory");
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "static-phase06-fixture", dependencies: { next: "16.3.6", vitest: "4.0.0" } }),
    "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@logic/*": ["logic/*"] } } }),
    "logic/core.ts": 'export function leaf() { return 1; }\nexport function work(flag: boolean) { if (flag) leaf(); return recurse(1); }\nexport function recurse(n: number): number { if (n > 0) return recurse(n - 1); return leaf(); }\n',
    "logic/barrel.ts": 'export { work as process } from "./core";\n',
    "app/api/demo/route.ts": 'import { process as perform } from "@logic/barrel";\nexport function GET() { return perform(true); }\nexport function POST() { const receiver = { run: perform }; return receiver.run(true); }\n',
    "app/api/alias/route.ts": 'export { work as GET } from "../../../logic/core";\n',
    "app/api/gap/route.ts": 'const receiver = { run: () => 1 };\nexport const GET = receiver.run;\n',
    "logic/core.test.ts": 'import { work } from "./core";\nexport function candidate() { work(false); }\n',
    "logic/route.test.ts": 'import { GET } from "../app/api/demo/route";\nexport function candidate() { GET(); }\n',
    "logic/unrelated.test.ts": 'export function unrelated() { return 1; }\n',
    "logic/shadow.ts": 'import { leaf } from "./core";\nexport function shadow(leaf: () => number) { return leaf(); }\nexport function nested() { const leaf = () => 2; return leaf(); }\n',
    "logic/mutable.ts": 'function original() { return 1; }\noriginal = () => 2;\nexport function invoke() { return original(); }\n',
    "logic/duplicate.ts": 'function duplicate() { return 1; }\nfunction duplicate() { return 2; }\nexport function invoke() { return duplicate(); }\n',
    "logic/missing.ts": 'import { missing } from "./absent";\nimport { hidden } from "./hidden.d.ts";\nexport function invoke() { missing(); hidden(); }\n',
    "logic/hidden.d.ts": 'export declare function hidden(): void;\n',
    "logic/default.ts": 'export default function defaultWork() { return 1; }\n',
    "logic/default-use.ts": 'import alias from "./default"; export function invoke() { alias(); }\n',
    "logic/plain.js": 'export function jsLeaf() { return 1; }\nexport function jsCaller() { return jsLeaf(); }\n',
    "nest/package.json": JSON.stringify({ name: "static-nest-fixture", dependencies: { "@nestjs/common": "11.0.0", "@nestjs/core": "11.0.0" } }),
    "nest/controller.ts": 'import { Controller, Get } from "@nestjs/common";\nimport { leaf } from "../logic/core";\n@Controller("demo")\nexport class DemoController {\n  @Get("leaf")\n  read() { return leaf(); }\n}\n',
  };
  for (const [file, content] of Object.entries(files)) {
    const destination = path.join(root, file); mkdirSync(path.dirname(destination), { recursive: true }); writeFileSync(destination, content, "utf8");
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('usage: node scripts/phase06-fixture.ts "D:\\a new directory with spaces"');
  const root = path.resolve(process.argv[2]); createBehaviorFixture(root);
  console.log(`Created static acceptance fixture at ${root}. Do not install dependencies or run its code.`);
}
