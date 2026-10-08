/** Small bounded source-literal interpreter. Never imports/evaluates Python. */
export type DjangoLiteral = string | number | boolean | DjangoLiteral[] | { [key: string]: DjangoLiteral };
export function splitDjango(text: string, separator = ","): string[] | null {
  if (text.length > 4096) return null;
  const pieces: string[] = []; let start = 0, quote = "", escaped = false; const stack: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === quote) quote = ""; continue; }
    if (c === "'" || c === '"') { if (text.slice(i,i+3) === c.repeat(3)) return null; quote = c; }
    else if (c === "#") return null;
    else if ("([{ ".trim().includes(c)) { stack.push(c); if (stack.length > 32) return null; }
    else if (")] }".replaceAll(" ","").includes(c)) { const open = stack.pop(); if (!open || "([{ ".trim().indexOf(open) !== ")] }".replaceAll(" ","").indexOf(c)) return null; }
    else if (c === separator && !stack.length) { pieces.push(text.slice(start,i).trim()); start=i+1; if (pieces.length>200) return null; }
  }
  if (quote || stack.length) return null; pieces.push(text.slice(start).trim()); return pieces.filter(Boolean);
}
export function djangoString(text: string): string | null {
  const match = /^([rRuU]?)(['"])([\s\S]*)\2$/.exec(text.trim());
  if (!match || text.trim().slice(match[1].length).startsWith(match[2].repeat(3))) return null;
  if (match[1].toLowerCase()==="r") return match[3];
  if (/[\\]/.test(match[3])) return null;
  return match[3];
}
export function djangoLiteral(text: string, depth=0): DjangoLiteral | null {
  if (depth>32 || text.length>4096) return null; text=text.trim();
  const string=djangoString(text); if(string!==null)return string;
  if(text==="True"||text==="False")return text==="True";
  if(/^-?\d{1,10}$/.test(text))return Number(text);
  if((text.startsWith("[")&&text.endsWith("]"))||(text.startsWith("(")&&text.endsWith(")"))){const items=splitDjango(text.slice(1,-1));if(!items)return null;const values=items.map(item=>djangoLiteral(item,depth+1));return values.some(v=>v===null)?null:values as DjangoLiteral[];}
  if(text.startsWith("{")&&text.endsWith("}")){const items=splitDjango(text.slice(1,-1));if(!items)return null;const values:Record<string,DjangoLiteral>=Object.create(null);for(const item of items){const pair=splitDjango(item,":");if(pair?.length!==2)return null;const key=djangoString(pair[0]),value=djangoLiteral(pair[1],depth+1);if(key===null||value===null||Object.hasOwn(values,key))return null;values[key]=value;}return values;}
  return null;
}
