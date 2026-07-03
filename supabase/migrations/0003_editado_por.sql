-- Rastreio de autoria: quem editou por último cada lançamento, independente
-- de quem é o dono (pessoa) do lançamento — o casal vê e edita tudo, então
-- isso é o que deixa claro "quem mexeu aqui".

alter table saida add column editado_por pessoa;
alter table entrada add column editado_por pessoa;
alter table transferencia add column editado_por pessoa;

alter table saida add column atualizado_em timestamptz not null default now();
alter table entrada add column atualizado_em timestamptz not null default now();
alter table transferencia add column atualizado_em timestamptz not null default now();

-- Backfill do histórico: sem informação de quem editou, assume-se o dono do
-- lançamento (melhor suposição possível para dado importado).
update saida set editado_por = pessoa where editado_por is null;
update entrada set editado_por = pessoa where editado_por is null;
update transferencia set editado_por = pessoa where editado_por is null;

alter table saida alter column editado_por set not null;
alter table entrada alter column editado_por set not null;
alter table transferencia alter column editado_por set not null;
