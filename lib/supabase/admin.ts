import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com a chave `service_role` — ignora RLS. Use SOMENTE em
 * endpoints de servidor confiáveis já protegidos por outro segredo (ex.: a API
 * de atalhos do iPhone). NUNCA importe isto em código de cliente: a chave dá
 * acesso total ao banco. Ela vive apenas em variável de ambiente do servidor.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
