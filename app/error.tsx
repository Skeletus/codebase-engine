"use client";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <section role="alert" className="p-6 text-sm">
    <h1>Codebase Intelligence could not render</h1>
    <p className="my-3">Try again or restart the application. Stored analyses have not been deleted.</p>
    <button className="rounded border border-line px-3 py-1" onClick={retry}>Try again</button>
  </section>;
}
