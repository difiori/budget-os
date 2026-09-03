import { describe, expect, it } from "vitest";
import { dividirLote, interpretarLocal, interpretarLoteLocal, type ContextoLocal } from "./interpretar-local";

const ctx: ContextoLocal = {
  pessoa: "Diego",
  hojeISO: "2026-09-03",
  contas: [{ id: "c1", nome: "Conta C6 (CPF)", dono: "Diego" }, { id: "c9", nome: "Conta Nubank", dono: "Vitor" }],
  cartoes: [{ id: "k1", nome: "C6 Business Mastercard", dono: "Diego" }, { id: "k2", nome: "C6 Carbon Mastercard", dono: "Diego" }],
  historico: [
    { nome: "Amazon", pessoa: "Diego", categoria_id: "shop", metodo: "Crédito", conta_id: null, cartao_id: "k1", vezes: 40 },
    { nome: "iFood", pessoa: "Diego", categoria_id: "deliv", metodo: "Crédito", conta_id: null, cartao_id: "k2", vezes: 16 },
    { nome: "Uber", pessoa: "Diego", categoria_id: "transp", metodo: "Débito", conta_id: "c1", cartao_id: null, vezes: 2 },
    { nome: "Mercado Livre", pessoa: "Diego", categoria_id: "shop", metodo: "Crédito", conta_id: null, cartao_id: "k1", vezes: 5 },
    { nome: "Mercado Livre (Reforma)", pessoa: "Diego", categoria_id: "ref", metodo: "Crédito", conta_id: null, cartao_id: "k1", vezes: 2 },
    { nome: "Enel mãe", pessoa: "Diego", categoria_id: "mae", metodo: "Débito", conta_id: "c1", cartao_id: null, vezes: 12 },
    { nome: "Padaria", pessoa: "Diego", categoria_id: null, metodo: "Débito", conta_id: "c1", cartao_id: null, vezes: 4 },
    { nome: "Amazon", pessoa: "Vitor", categoria_id: "shop", metodo: "Crédito", conta_id: null, cartao_id: "k9", vezes: 15 },
  ],
  contasFixas: ["Enel mãe", "Enel Apartamento"],
};

describe("interpretarLocal", () => {
  it("valor + nome conhecido: preenche método, cartão e categoria do histórico", () => {
    expect(interpretarLocal("54 amazon", ctx)).toMatchObject({ tipo: "Saida", nome: "Amazon", valor_cents: 5400, metodo: "Crédito", destino_id: "k1", categoria_id: "shop", data: "2026-09-03", status: "A pagar", parcelas: 1, confianca: 1 });
    expect(interpretarLocal("Amazon 54", ctx)?.valor_cents).toBe(5400);
    expect(interpretarLocal("R$ 1.234,56 na amazon", ctx)?.valor_cents).toBe(123456);
  });
  it("destino citado sobrepõe o do histórico; apelido único por pessoa", () => {
    expect(interpretarLocal("ifood 87,90 no business", ctx)).toMatchObject({ destino_id: "k1", metodo: "Crédito", valor_cents: 8790 });
    expect(interpretarLocal("amazon 30 na conta cpf", ctx)).toMatchObject({ destino_id: "c1", metodo: "Débito" });
    // "c6" está em três destinos: não serve de apelido, e sobra como palavra desconhecida.
    expect(interpretarLocal("amazon 30 no c6", ctx)).toBeNull();
  });
  it("ontem, paguei e parcelas", () => {
    expect(interpretarLocal("paguei 45 uber ontem", ctx)).toMatchObject({ nome: "Uber", status: "Pago", data: "2026-09-02", metodo: "Débito" });
    expect(interpretarLocal("mercado livre 89,90 em 2x no carbon", ctx)).toMatchObject({ nome: "Mercado Livre", parcelas: 2, destino_id: "k2" });
    expect(interpretarLocal("uber 45 em 3x", ctx)).toBeNull(); // débito não parcela
  });
  it("prefere o nome exato quando há variantes; só prefixo ambíguo vai para a IA", () => {
    expect(interpretarLocal("mercado livre 20", ctx)?.nome).toBe("Mercado Livre");
    expect(interpretarLocal("mercado 20", ctx)).toBeNull();
  });
  it("deixa para a IA o que não domina", () => {
    expect(interpretarLocal("54 na farmácia", ctx)).toBeNull(); // nome desconhecido
    expect(interpretarLocal("recebi 500 de freela", ctx)).toBeNull();
    expect(interpretarLocal("amazon 54 dia 15", ctx)).toBeNull();
    expect(interpretarLocal("amazon", ctx)).toBeNull(); // sem valor
    expect(interpretarLocal("amazon 54 e 30", ctx)).toBeNull(); // dois valores
    expect(interpretarLocal("enel 320", ctx)).toBeNull(); // duas contas fixas começam com "enel"
    expect(interpretarLocal("padaria 12", ctx)).toBeNull(); // histórico sem categoria
    expect(interpretarLocal("assinei amazon 54 todo mês", ctx)).toBeNull();
  });
});

describe("conta fixa existente pelo nome", () => {
  it("devolve o sinal de conta fixa existente em vez de gasto novo", () => {
    expect(interpretarLocal("paguei 320 enel mãe", ctx)).toMatchObject({ nome: "Enel mãe", valor_cents: 32000, status: "Pago", conta_fixa_existente: true, conta_fixa: false, confianca: 1 });
    expect(interpretarLocal("enel mã 320", ctx)?.conta_fixa_existente).toBe(true); // prefixo único
    expect(interpretarLocal("enel mãe 320 em 3x", ctx)).toBeNull();
  });
});

describe("interpretarLoteLocal", () => {
  it("divide por vírgula, ' e ', ponto e vírgula e linha, sem quebrar nomes com 'e'", () => {
    expect(dividirLote("54 amazon, ifood 87,90 no carbon e paguei 45 uber ontem")).toEqual(["54 amazon", "ifood 87,90 no carbon", "paguei 45 uber ontem"]);
    expect(dividirLote("bacio e latte 25; 30 pao e cia\n12 padaria")).toEqual(["bacio e latte 25", "30 pao e cia", "12 padaria"]);
  });
  it("resolve o lote inteiro ou nada", () => {
    const lote = interpretarLoteLocal("54 amazon, ifood 30 no carbon e paguei 45 uber", ctx);
    expect(lote?.map((l) => l.nome)).toEqual(["Amazon", "iFood", "Uber"]);
    expect(interpretarLoteLocal("54 amazon\nrecebi 500", ctx)).toBeNull();
  });
});
