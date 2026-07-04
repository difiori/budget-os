-- Orçamento por categoria: meta mensal opcional (em centavos). null = sem
-- meta definida, a categoria continua funcionando normalmente. A meta é fixa
-- por categoria (não por mês/ano) — mantém o modelo simples, ajustável a
-- qualquer momento em Configurações.

alter table categoria add column meta_mensal_cents integer null;

alter table categoria add constraint categoria_meta_mensal_cents_check
  check (meta_mensal_cents is null or meta_mensal_cents > 0);
