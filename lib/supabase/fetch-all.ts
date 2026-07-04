const PAGE_SIZE = 1000;

/**
 * Busca TODAS as linhas de uma query, paginando por `.range()` para contornar o
 * limite padrão de 1000 linhas do PostgREST. Sem isso, tabelas grandes (ex.:
 * `saida` com histórico importado) são silenciosamente truncadas e qualquer
 * cálculo que assume ter a tabela inteira (saldo previsto, limite comprometido,
 * projeção) fica errado.
 *
 * `makeQuery(from, to)` deve devolver a query já com os filtros e um `.order()`
 * estável (por `id`, por exemplo) — a paginação só é consistente se a ordem for
 * determinística entre as páginas.
 */
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const todas: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    todas.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return todas;
}
