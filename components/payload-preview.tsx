"use client";

// Presentation only: approval always sends the untouched prepared payload.
export function PayloadPreview({ payload }: { payload: string }) {
  let value: unknown = payload;
  try { value = JSON.parse(payload); } catch { /* Agent payloads can be plain text. */ }
  return <div className="space-y-3"><p className="text-fg-muted">Complete payload, formatted for inspection. Expand sections to inspect their values; Raw JSON shows the exact original payload.</p><PreviewValue value={value} /></div>;
}
function PreviewValue({ value }: { value: unknown }) {
  if (typeof value === "string") {
    let decoded: unknown = null;
    try { decoded = JSON.parse(value); } catch { /* Preserve plain instructions. */ }
    if (decoded !== null && typeof decoded === "object") return <PreviewValue value={decoded} />;
    return <p className="whitespace-pre-wrap break-words leading-relaxed">{value || "(empty string)"}</p>;
  }
  if (value !== null && typeof value === "object") {
    return <div className="space-y-2">{Object.entries(value).map(([label, child]) => <details open key={label} className="border-b border-line py-2"><summary className="font-semibold">{label}{Array.isArray(child) ? ` (${child.length})` : ""}</summary><div className="mt-2 border-l border-line pl-4"><PreviewValue value={child} /></div></details>)}{Object.keys(value).length === 0 && <p className="text-fg-muted">{Array.isArray(value) ? "Empty list" : "Empty object"}</p>}</div>;
  }
  return <span className="font-mono">{String(value)}</span>;
}
