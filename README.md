# Budget OS

Aplicação privada de gestão financeira do casal. Reúne painel de saldos e
contas a pagar, lançamentos, cartões, contas bancárias, metas de poupança e
resumo mensal. Também pode ser instalada como PWA e receber lançamentos por um
Atalho do iPhone.

## Stack

- Next.js 16 com App Router, React 19 e TypeScript
- Supabase Auth e Postgres com Row Level Security
- Tailwind CSS 4
- Vitest para regras de domínio
- Vercel para deploy

## Ambiente local

Requisitos: Node.js 20.9 ou superior e npm.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Preencha em `.env.local` as variáveis públicas do projeto Supabase. As variáveis
de servidor só são necessárias para a API de Atalhos e para o importador legado.
Depois, acesse [http://localhost:3000](http://localhost:3000).

Não há cadastro público: o acesso é restrito aos usuários autorizados no código
e nas políticas RLS do banco.

## Comandos

```bash
npm run dev          # servidor de desenvolvimento
npm run lint         # ESLint
npm test             # suíte Vitest
npm run build        # build de produção
npm run import:notion:dry    # simula a importação do histórico legado
npm run import:notion:write  # grava a importação; use só após revisar o dry-run
```

## Banco de dados

O schema está versionado em `supabase/migrations/`. Mudanças de banco devem ser
revisadas e testadas antes de chegar ao projeto de produção. Para um projeto
Supabase já vinculado, confira sempre o plano antes de aplicar:

```bash
supabase migration list
supabase db push --dry-run
```

Nunca execute `db reset --linked` no projeto de produção e nunca use
`--include-seed` em produção.

## Estrutura principal

- `app/(app)/`: rotas autenticadas e Server Actions
- `components/`: componentes e fluxos de interface
- `lib/domain/`: regras financeiras puras e seus testes
- `lib/supabase/`: clientes browser, servidor e administrativo
- `supabase/migrations/`: histórico do schema e políticas de acesso
- `scripts/import-notion-2026.ts`: importação pontual do histórico legado

## Deploy

O deploy é feito na Vercel. Configure no projeto as mesmas variáveis obrigatórias
de `.env.example`, mantendo `SUPABASE_SERVICE_ROLE_KEY` e
`SHORTCUT_API_SECRET` apenas no ambiente de servidor. Pull requests devem passar
por lint, testes e build antes da promoção para produção.
