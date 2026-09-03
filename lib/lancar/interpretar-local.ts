import type { LancamentoInterpretado } from "@/lib/ia/interpretar-lancamento";
import type { Cartao, Conta, Pessoa } from "@/lib/domain/types";

/**
 * Atalho sem IA para o caso comum do Lançar rápido: "54 amazon", "ifood 87,90
 * no carbon", "paguei 45 uber ontem". Quando o nome já existe no histórico da
 * pessoa e a frase só tem valor, nome, destino, data simples, parcelas e
 * status, o lançamento nasce na hora, com categoria, método e conta/cartão do
 * último igual. Qualquer coisa fora disso devolve null e a IA assume — o
 * atalho prefere não adivinhar.
 */

export interface HistoricoLocal {
  nome: string;
  pessoa: Pessoa;
  categoria_id: string | null;
  metodo: string;
  conta_id: string | null;
  cartao_id: string | null;
  vezes: number;
}

export interface ContextoLocal {
  pessoa: Pessoa;
  hojeISO: string;
  contas: Pick<Conta, "id" | "nome" | "dono">[];
  cartoes: Pick<Cartao, "id" | "nome" | "dono">[];
  historico: HistoricoLocal[];
  /** Nomes das contas fixas ativas: pagamento do mês não é lançamento novo, então vai para a IA avisar. */
  contasFixas: string[];
}

export function normalizar(s: string): string {
  return s
    .replace(/r\$/gi, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9,.()/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Sinais de que a frase é mais do que um gasto simples: a IA resolve melhor.
const FORA_DO_ATALHO =
  /\b(recebi|caiu|entrou|salario|freela|transferi|transferencia|mandei|movi|todo mes|mensal|assinatura|assinei|aluguel|dia \d|semana|passad[ao]|amanha|proxim[ao]|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|estorno|reembolso)\b/;
const PREPOSICOES = new Set(["no", "na", "nos", "nas", "em", "de", "do", "da", "dos", "das", "pelo", "pela", "com", "o", "a", "os", "as", "um", "uma", "num", "numa", "reais", "real", "conto", "contos", "pila", "pra", "para", "conta", "cartao"]);
const PAGO = /\b(paguei|pago|pagamos|comprei|compramos)\b/;
const PARCELAS = /\b(?:em\s+)?(\d{1,2})\s*(?:x|vezes)\b/;
const VALOR = /(?<![\w,.])(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(?![\w,.])/g;

function addDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** Tokens que só um destino da pessoa tem ("business", "carbon", "cpf") — servem de apelido. */
function apelidosDosDestinos(ctx: ContextoLocal) {
  const destinos = [
    ...ctx.contas.filter((c) => c.dono === ctx.pessoa).map((c) => ({ id: c.id, nome: c.nome, tipo: "conta" as const })),
    ...ctx.cartoes.filter((c) => c.dono === ctx.pessoa).map((c) => ({ id: c.id, nome: c.nome, tipo: "cartao" as const })),
  ];
  const tokensDe = destinos.map(
    (d) =>
      new Set(
        normalizar(d.nome)
          .replace(/[().,/-]/g, " ")
          .split(" ")
          .filter((t) => t.length >= 3 && !["conta", "cartao", "mastercard", "visa", "elo", "amex"].includes(t))
      )
  );
  return destinos.map((d, i) => ({
    ...d,
    apelidos: [...tokensDe[i]].filter((t) => tokensDe.every((outros, j) => j === i || !outros.has(t))),
    // Todas as palavras do nome ("conta", "c6", "cpf"): somem da frase quando o destino foi citado.
    palavras: normalizar(d.nome).replace(/[().,/-]/g, " ").split(" ").filter(Boolean),
  }));
}

export function interpretarLocal(frase: string, ctx: ContextoLocal): LancamentoInterpretado | null {
  let f = normalizar(frase);
  if (!f || FORA_DO_ATALHO.test(f)) return null;

  let parcelas = 1;
  const mp = f.match(PARCELAS);
  if (mp) {
    parcelas = Number(mp[1]);
    if (parcelas < 2 || parcelas > 48) return null;
    f = f.replace(mp[0], " ");
  }

  let data = ctx.hojeISO;
  if (/\banteontem\b/.test(f)) data = addDias(ctx.hojeISO, -2);
  else if (/\bontem\b/.test(f)) data = addDias(ctx.hojeISO, -1);
  f = f.replace(/\b(hoje|ontem|anteontem)\b/g, " ");

  const pago = PAGO.test(f);
  f = f.replace(PAGO, " ");

  const valores = [...f.matchAll(VALOR)];
  if (valores.length !== 1) return null;
  const [bruto, inteiro, centavos] = valores[0];
  const valor_cents = Number(inteiro.replace(/\./g, "")) * 100 + Number((centavos ?? "0").padEnd(2, "0"));
  if (valor_cents <= 0) return null;
  f = f.replace(bruto, " ");

  // Destino citado na frase ("no business", "na conta cpf"): apelido único.
  const destinos = apelidosDosDestinos(ctx);
  const palavras = f.split(" ").filter(Boolean);
  const citados = destinos.filter((d) => d.apelidos.some((a) => palavras.includes(a)));
  if (citados.length > 1) return null;
  const citado = citados[0] ?? null;
  const restantes = palavras.filter((p) => !PREPOSICOES.has(p) && !(citado && citado.palavras.includes(p)));
  if (restantes.length === 0) return null;
  const nomeBusca = restantes.join(" ");
  if (nomeBusca.replace(/[^a-z]/g, "").length < 2) return null;

  // Nome do histórico da pessoa: exato > começa com > contém; empate só se for o mesmo nome.
  const doHistorico = ctx.historico.filter((h) => h.pessoa === ctx.pessoa);
  const pontuar = (h: HistoricoLocal) => {
    const n = normalizar(h.nome);
    if (n === nomeBusca) return 3;
    // Só prefixo digitado pela pessoa ("merc" → Mercado Livre); palavra sobrando
    // depois do nome ("amazon c6") não passa — pode ser um destino que não entendi.
    if (n.startsWith(nomeBusca)) return 2;
    if (nomeBusca.length >= 4 && n.includes(nomeBusca)) return 1;
    return 0;
  };
  const candidatos = doHistorico.map((h) => ({ h, p: pontuar(h) })).filter((c) => c.p > 0).sort((a, b) => b.p - a.p || b.h.vezes - a.h.vezes);
  if (candidatos.length === 0) return null;
  const melhor = candidatos[0];
  const empate = candidatos.filter((c) => c.p === melhor.p && normalizar(c.h.nome) !== normalizar(melhor.h.nome));
  if (empate.length > 0 && melhor.p < 3) return null;
  const nome = melhor.h.nome;
  if (ctx.contasFixas.some((c) => normalizar(c) === normalizar(nome))) return null;

  const metodo: "Crédito" | "Débito" = citado ? (citado.tipo === "cartao" ? "Crédito" : "Débito") : melhor.h.metodo === "Crédito" ? "Crédito" : "Débito";
  const destino_id = citado ? citado.id : metodo === "Crédito" ? melhor.h.cartao_id : melhor.h.conta_id;
  if (!destino_id || !melhor.h.categoria_id) return null;
  if (parcelas > 1 && metodo !== "Crédito") return null;

  return {
    tipo: "Saida",
    nome,
    valor_cents,
    metodo,
    destino_id,
    de_conta_id: null,
    para_conta_id: null,
    categoria_id: melhor.h.categoria_id,
    data,
    status: metodo === "Crédito" ? "A pagar" : pago ? "Pago" : "A pagar",
    parcelas,
    conta_fixa: false,
    conta_fixa_existente: false,
    confianca: 1,
    duvidas: [],
  };
}

/**
 * Divide o texto em itens: linha, ";", ", " e " e ". Um pedaço sem valor é
 * parte do vizinho ("bacio e latte 25" continua um item só) — junta com o
 * seguinte se ele tiver valor, senão com o anterior.
 */
export function dividirLote(texto: string): string[] {
  const brutos = texto
    .split(/\n|;|,(?=\s)|\s+e\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const temValor = (p: string) => /\d/.test(p);
  const partes: string[] = [];
  for (let i = 0; i < brutos.length; i += 1) {
    const p = brutos[i];
    if (temValor(p)) {
      partes.push(p);
      continue;
    }
    // "30 pao | cia": valor no início do anterior → o nome continua ali.
    // "bacio | latte 25": valor no fim do seguinte → o nome começa aqui.
    const anterior = partes[partes.length - 1];
    const seguinte = brutos[i + 1];
    if (anterior && /^\d/.test(anterior)) partes[partes.length - 1] = `${anterior} e ${p}`;
    else if (seguinte && /\d[\d.,]*$/.test(seguinte)) brutos[i + 1] = `${p} e ${seguinte}`;
    else if (seguinte && temValor(seguinte)) brutos[i + 1] = `${p} e ${seguinte}`;
    else if (anterior) partes[partes.length - 1] = `${anterior} e ${p}`;
    else partes.push(p);
  }
  return partes;
}

/** Lote: tudo ou nada — um item que o atalho não resolve manda o lote inteiro para a IA. */
export function interpretarLoteLocal(texto: string, ctx: ContextoLocal): LancamentoInterpretado[] | null {
  const partes = dividirLote(texto);
  if (partes.length === 0 || partes.length > 20) return null;
  const itens: LancamentoInterpretado[] = [];
  for (const p of partes) {
    const l = interpretarLocal(p, ctx);
    if (!l) return null;
    itens.push(l);
  }
  return itens;
}
