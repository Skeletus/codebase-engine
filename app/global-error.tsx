"use client";

import { useEffect } from "react";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { window.dispatchEvent(new Event("desktop-ui-ready")); }, []);
  return <html lang="en"><body style={{ background: "#171717", color: "#eee", padding: 32, fontFamily: "system-ui" }}>
    <h1>Codebase Intelligence could not initialize</h1>
    <p>Try again or restart the application. Stored analyses have not been deleted.</p>
    <button onClick={retry}>Try again</button>
  </body></html>;
}
