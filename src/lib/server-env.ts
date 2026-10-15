/**
 * Lê uma variável no servidor. Primeiro as do Worker (painel da Cloudflare > Settings > Variables and secrets);
 * para as do Supabase, que não são segredo, cai nas VITE_* usadas no build quando as do Worker não existem.
 */
const FALLBACKS: Record<string, string | undefined> = {
  SUPABASE_URL: import.meta.env["VITE_SUPABASE_URL"] as string | undefined,
  SUPABASE_PUBLISHABLE_KEY: import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined,
  DISCORD_PUBLIC_KEY: import.meta.env["VITE_DISCORD_PUBLIC_KEY"] as string | undefined,
  DISCORD_APP_ID: import.meta.env["VITE_DISCORD_APP_ID"] as string | undefined,
  DISCORD_CHANNEL_ID: import.meta.env["VITE_DISCORD_CHANNEL_ID"] as string | undefined,
};

export function serverEnv(name: string): string | undefined {
  const value = process.env[name]?.trim() || FALLBACKS[name]?.trim();
  return value || undefined;
}
