// Identificadores imutáveis dos dois usuários do Budget OS. Esta lista precisa
// permanecer alinhada com as políticas RLS em supabase/migrations/.
const BUDGET_USER_IDS = new Set([
  "98d184ef-8ab8-4c1d-9ddf-f842d40bca85",
  "318a29e1-a964-481d-961a-a890eb5e571c",
]);

export function isBudgetUserId(userId: string): boolean {
  return BUDGET_USER_IDS.has(userId);
}
