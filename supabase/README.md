# Histórico de migrações

O banco de produção foi criado antes de o histórico local ser vinculado à CLI.
Por isso, o schema equivalente a `0001`–`0008` já existe remotamente, mas essas
versões não aparecem em `supabase_migrations.schema_migrations`.

A migração `20260707011054_add_limite_cheque_especial_conta.sql` também foi
recuperada do estado remoto; essa versão já consta como aplicada em produção.

## Reconciliação inicial

Execute estes comandos uma única vez, somente depois de revisar o diff e
confirmar que a CLI está vinculada ao projeto correto:

```bash
supabase migration list --linked
supabase migration repair --status applied --linked 0001 0002 0003 0004 0005 0006 0007 0008
supabase migration list --linked
supabase db push --dry-run --linked
```

O dry-run deve mostrar apenas migrações realmente novas. Não use `db reset
--linked` no projeto de produção: esse comando apaga os dados remotos.
