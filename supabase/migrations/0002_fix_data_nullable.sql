-- Correção: `data` foi criada como NOT NULL por engano em 0001_init.sql.
-- A regra 3 do domínio ("se `data` for nula, usar `created_at`") só faz
-- sentido se a coluna puder ser nula — o bug só apareceu na importação
-- histórica, porque a tela Lançar sempre envia uma data.

alter table saida alter column data drop not null;
alter table entrada alter column data drop not null;
alter table transferencia alter column data drop not null;
