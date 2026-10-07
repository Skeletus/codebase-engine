/** Bounded HTML tokenization, not execution. Raw text/inert templates cannot create entries. */
export function htmlModuleScripts(text:string, checkpoint:()=>void=()=>{}) {
  const scripts:{start:number;end:number;src:string|null;ambiguous:boolean}[]=[];
  let position=0,templates=0,foreign=0,tokens=0;
  const lower=text.toLowerCase();
  while (position<text.length) {
    checkpoint();
    if (++tokens>100000) throw new Error("resource-limit: HTML token budget");
    const start=text.indexOf("<",position);if (start<0) break;
    if (text.startsWith("<!--",start)) {const end=text.indexOf("-->",start+4);position=end<0?text.length:end+3;continue;}
    if (text.startsWith("<![CDATA[",start)) {const end=text.indexOf("]]>",start+9);position=end<0?text.length:end+3;continue;}
    if (text.startsWith("<!",start) || text.startsWith("<?",start)) {
      const end=text.indexOf(">",start+2);position=end<0?text.length:end+1;
      if (!/^<!doctype\s+html\s*>$/i.test(text.slice(start,position))) {scripts.push({start,end:position,src:null,ambiguous:true});break;}
      continue;
    }
    const heading=/^<\s*(\/?)\s*([a-z][\w:-]*)/i.exec(text.slice(start));
    if (!heading) {position=start+1;continue;}
    const closing=!!heading[1],tag=heading[2].toLowerCase();
    let cursor=start+heading[0].length,malformed=false;
    const attrs=new Map<string,string>();
    const duplicates=new Set<string>();
    while (cursor<text.length) {
      while (/\s/.test(text[cursor] ?? "")) cursor++;
      if (text[cursor]===">") {cursor++;break;}
      if (text[cursor]==="/" && text[cursor+1]===">") {cursor+=2;break;}
      const attribute=/^[^\s=<>"'`/]+/.exec(text.slice(cursor));
      if (!attribute) {malformed=true;const end=text.indexOf(">",cursor);cursor=end<0?text.length:end+1;break;}
      const key=attribute[0].toLowerCase();cursor+=attribute[0].length;
      while (/\s/.test(text[cursor] ?? "")) cursor++;
      let value="";
      if (text[cursor]==="=") {
        cursor++;while (/\s/.test(text[cursor] ?? "")) cursor++;
        const quote=text[cursor];
        if (quote==='"' || quote==="'") {const end=text.indexOf(quote,cursor+1);if (end<0) {malformed=true;cursor=text.length;break;} value=text.slice(cursor+1,end);cursor=end+1;}
        else {const raw=/^[^\s>]+/.exec(text.slice(cursor));value=raw?.[0] ?? "";cursor+=value.length;if (!value || /["'`<=]/.test(value)) malformed=true;}
      }
      if (attrs.has(key)) duplicates.add(key);else attrs.set(key,value);
    }
    if (text[cursor-1]!==">") malformed=true;
    position=cursor;
    if (tag==="template") {templates=Math.max(0,templates+(closing?-1:1));continue;}
    if (tag==="svg" || tag==="math") foreign=Math.max(0,foreign+(closing?-1:1));
    if (closing) continue;
    if (tag==="plaintext") break;
    if (["script","style","textarea","title","xmp","iframe","noembed","noframes","noscript"].includes(tag)) {
      if (tag==="script" && attrs.get("type")==="module") scripts.push({start,end:cursor,src:attrs.get("src") ?? null,ambiguous:malformed || templates>0 || foreign>0 || duplicates.size>0});
      const closingTag=new RegExp("</"+tag+"(?=[\\s/>])","g");closingTag.lastIndex=position;
      position=closingTag.exec(lower)?.index ?? text.length;
    }
  }
  return scripts;
}
