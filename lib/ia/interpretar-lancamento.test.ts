import { describe, expect, it } from "vitest";
import {
  LancamentoInterpretadoSchema,
  mensagemUsuarioInterpretar,
  saneiaInterpretacao,
  systemPromptInterpretar,
  type CatalogoIA,
  type LancamentoInterpretado,
} from "./interpretar-lancamento";

const catalogo: CatalogoIA = {
  pessoa: "Diego",
  contas: [{ id: "c1", nome: "Conta C6 (CPF)" }],
  cartoes: [{ id: "k1", nome: "C6 Business Mastercard" }],
  categorias: [{ id: "g", nome: "Gastos Diversos" }],
  historico: [{ nome: "Amazon", categoria: "Gastos Diversos", metodo: "Crédito", destino: "C6 Business Mastercard" }],
  contasFixas: ["Enel mãe", "Condomínio"],
};

const base: LancamentoInterpretado = {
  tipo: "Saida",
  nome: "Amazon",
  valor_cents: 5400,
  metodo: "Crédito",
  destino_id: "k1",
  de_conta_id: null,
  para_conta_id: null,
  categoria_id: "g",
  data: "2026-09-02",
  status: "A pagar",
  parcelas: 1,
  conta_fixa: false,
  conta_fixa_existente: false,
  confianca: 0.9,
  duvidas: [],
};

describe("prompt", () => {
  it("system prompt traz catálogo com ids e histórico", () => {
    const p = systemPromptInterpretar(catalogo);
    expect(p).toContain("C6 Business Mastercard (id k1)");
    expect(p).toContain('"Amazon" → Gastos Diversos · Crédito · C6 Business Mastercard');
    expect(p).toContain("A pessoa ativa é Diego");
  });
  it("mensagem do usuário leva a data de hoje", () => {
    expect(mensagemUsuarioInterpretar("  54 amazon ", { year: 2026, month: 9, day: 2 })).toBe('Hoje é 2026-09-02. Frase: """54 amazon"""');
  });
});

describe("saneiaInterpretacao", () => {
  it("mantém ids válidos", () => {
    expect(saneiaInterpretacao(base, catalogo)).toEqual(base);
  });
  it("anula ids fora do catálogo e registra dúvida", () => {
    const r = saneiaInterpretacao({ ...base, destino_id: "zzz", categoria_id: "nope" }, catalogo);
    expect(r.destino_id).toBeNull();
    expect(r.categoria_id).toBeNull();
    expect(r.duvidas).toHaveLength(2);
  });
  it("débito exige conta, não cartão", () => {
    const r = saneiaInterpretacao({ ...base, metodo: "Débito", destino_id: "k1" }, catalogo);
    expect(r.destino_id).toBeNull();
  });
  it("limita parcelas e confiança", () => {
    const r = saneiaInterpretacao({ ...base, parcelas: 99, confianca: 1.7 }, catalogo);
    expect(r.parcelas).toBe(48);
    expect(r.confianca).toBe(1);
  });
  it("data fora do formato vira dúvida", () => {
    expect(saneiaInterpretacao({ ...base, data: "02/09" }, catalogo).duvidas).toContain("Não entendi a data; confira.");
  });
  it("schema aceita o objeto", () => {
    expect(LancamentoInterpretadoSchema.safeParse(base).success).toBe(true);
  });
});
