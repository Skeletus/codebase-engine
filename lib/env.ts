// Legacy cloud-script configuration only. The static frontend and packaged
// local engine neither call assertEnv nor require any of these variables.
const REQUIRED = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
  "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
] as const;

type EnvKey = (typeof REQUIRED)[number];

export function assertEnv(): void {
  const missing = REQUIRED.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables (set them in .env.local):\n  ${missing.join("\n  ")}`,
    );
  }
}

export function env(key: EnvKey): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing environment variable ${key}`);
  return value;
}
