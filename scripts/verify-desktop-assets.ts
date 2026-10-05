import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const directory = path.resolve("out");
let fonts = 0, html = 0;
function visit(root: string) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) { visit(file); continue; }
    if (entry.name.endsWith(".woff2")) fonts++;
    if (entry.name.endsWith(".html")) html++;
    if (!/\.(?:html|js|css|txt|json)$/.test(entry.name)) continue;
    const content = readFileSync(file, "utf8");
    // Never echo a matched secret or bundle content in diagnostics.
    if (/sb_secret_[a-zA-Z0-9_-]+|sk_(?:test|live)_[a-zA-Z0-9]+|pk_(?:test|live)_[a-zA-Z0-9]+|NEXT_PUBLIC_SUPABASE|SUPABASE_SECRET_KEY|CLERK_SECRET_KEY|OPENAI_API_KEY|supabase\.co|clerk\.accounts/.test(content)) throw new Error("Cloud configuration or credential marker found in desktop assets");
    if (entry.name.endsWith(".css") && /https?:\/\/(?:fonts\.googleapis|fonts\.gstatic)/.test(content)) throw new Error("Remote font dependency in desktop assets");
  }
}
visit(directory);
if (!html || !fonts) throw new Error("Static HTML or bundled fonts missing");
console.log(`PASS: static HTML, ${fonts} bundled fonts, no cloud credential/configuration markers`);
