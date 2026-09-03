import { parseCalendarDate } from "./calendar-date";
import { dataParaCalculo } from "./data-fallback";
import { nomeSemParcela } from "./parcelamento";

/**
 * Conciliação de fatura: casa os itens lidos de uma fatura (PDF/foto) com as
 * compras que o app tem naquela fatura. Determinística — a IA só extrai os
 * itens; quem decide o que bate é esta função.
 *
 * Passos, em ordem de confiança:
 * 1. mesmo valor (±1 centavo) e data até 3 dias de distância → conferida;
 * 2. mesmo valor e data até 12 dias (fatura às vezes usa data de postagem) → conferida;
 * 3. nome parecido, valor até 5% (ou R$ 2) de diferença e data até 5 dias → divergente de valor;
 * o resto fica em "falta no app" (só na fatura) ou "sobra no app" (só no app).
 */

export interface ItemFatura {
  data: string;
  descricao: string;
  valor_cents: number;
  parcela: string | null;
}

export interface SaidaConciliavel {
  id: string;
  nome: string;
  total_cents: number;
  data: string | null;
  created_at: string;
  parcela: string | null;
}

export interface Conciliacao<T extends SaidaConciliavel> {
  conferidas: { item: ItemFatura; saida: T }[];
  divergentes: { item: ItemFatura; saida: T; diferencaCents: number }[];
  faltamNoApp: ItemFatura[];
  sobramNoApp: T[];
  totalFatura: number;
  totalApp: number;
}

export function normalizarNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(parc(ela)?|pgto|pagamento|compra|cartao|visa|mastercard|master|ltda|me|sa|s\.a\.)\b/g, " ")
    .replace(/\d+\/\d+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 0..1 — Jaccard dos tokens (≥3 letras) com bônus quando um contém o outro. */
export function similaridadeNomes(a: string, b: string): number {
  const na = normalizarNome(a);
  const nb = normalizarNome(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const ta = new Set(na.split(" ").filter((t) => t.length >= 3));
  const tb = new Set(nb.split(" ").filter((t) => t.length >= 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

function diasEntre(aISO: string, bISO: string): number {
  const a = parseCalendarDate(aISO);
  const b = parseCalendarDate(bISO);
  return Math.abs(Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86_400_000));
}

function dataSaidaISO(s: SaidaConciliavel): string {
  const d = dataParaCalculo(s);
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

export function conciliar<T extends SaidaConciliavel>(itens: ItemFatura[], saidas: T[]): Conciliacao<T> {
  const livresItens = new Set(itens.map((_, i) => i));
  const livresSaidas = new Set(saidas.map((_, i) => i));
  const conferidas: Conciliacao<T>["conferidas"] = [];
  const divergentes: Conciliacao<T>["divergentes"] = [];

  const casar = (
    aceita: (item: ItemFatura, saida: T, dias: number) => boolean,
    destino: "conferida" | "divergente"
  ) => {
    // Para cada item livre, escolhe a saída livre mais próxima (data, depois nome).
    for (const i of [...livresItens]) {
      const item = itens[i];
      let melhor: { j: number; score: number } | null = null;
      for (const j of livresSaidas) {
        const s = saidas[j];
        const dias = diasEntre(item.data, dataSaidaISO(s));
        if (!aceita(item, s, dias)) continue;
        const score = dias * 10 - similaridadeNomes(item.descricao, nomeSemParcela(s.nome, s.parcela)) * 5;
        if (!melhor || score < melhor.score) melhor = { j, score };
      }
      if (melhor) {
        const s = saidas[melhor.j];
        livresItens.delete(i);
        livresSaidas.delete(melhor.j);
        if (destino === "conferida") conferidas.push({ item, saida: s });
        else divergentes.push({ item, saida: s, diferencaCents: item.valor_cents - s.total_cents });
      }
    }
  };

  const mesmoValor = (a: number, b: number) => Math.abs(a - b) <= 1;
  casar((item, s, dias) => mesmoValor(item.valor_cents, s.total_cents) && dias <= 3, "conferida");
  casar((item, s, dias) => mesmoValor(item.valor_cents, s.total_cents) && dias <= 12, "conferida");
  casar((item, s, dias) => {
    const tolerancia = Math.max(200, Math.round(Math.abs(s.total_cents) * 0.05));
    return (
      Math.abs(item.valor_cents - s.total_cents) <= tolerancia &&
      dias <= 5 &&
      similaridadeNomes(item.descricao, nomeSemParcela(s.nome, s.parcela)) >= 0.5
    );
  }, "divergente");

  const faltamNoApp = [...livresItens].sort((a, b) => a - b).map((i) => itens[i]);
  const sobramNoApp = [...livresSaidas].sort((a, b) => a - b).map((j) => saidas[j]);
  return {
    conferidas,
    divergentes,
    faltamNoApp,
    sobramNoApp,
    totalFatura: itens.reduce((s, i) => s + i.valor_cents, 0),
    totalApp: saidas.reduce((s, x) => s + x.total_cents, 0),
  };
}
