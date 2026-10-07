/** Public, first-party configuration names. This grants no directory traversal. */
export function publicMetadataName(name: string): boolean {
  return /^(?:package\.json|(?:tsconfig|jsconfig)(?:\.[^/]+)?\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock|pyproject\.toml|poetry\.lock|uv\.lock|requirements(?:[.-][\w-]+)?\.txt|settings\.py|(?:vite|next|metro)\.config\.(?:[cm]?[jt]s))$/.test(name);
}
