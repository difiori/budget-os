-- Recupera no repositório a migração que já está aplicada em produção.
-- A versão e o nome correspondem ao histórico remoto do Supabase.

alter table public.conta
  add column limite_cheque_especial_cents integer not null default 0;
