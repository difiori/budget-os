import { describe, expect, it } from "vitest";
import { estadoDaInterpretacao, formDataDoEstado, pendenciasDoEstado, pessoaDoEstado } from "./interpretacao";
import type { LancamentoInterpretado } from "@/lib/ia/interpretar-lancamento";
import type { Cartao, Conta } from "@/lib/domain/types";

const HOJE = "2026-09-02";
const base: LancamentoInterpretado = {
  tipo: "Saida",
  nome: "Amazon",
  valor_cents: 5400,
  metodo: "Crédito",
  destino_id: "cartao-1",
  de_conta_id: null,
  para_conta_id: null,
  categoria_id: "cat-1",
  data: "2026-09-01",
  status: "A pagar",
  parcelas: 1,
  conta_fixa: false,
  conta_fixa_existente: false,
  confianca: 0.8,
  duvidas: [],
};
const contas = [{ id: "conta-1", nome: "C6", dono: "Diego" }, { id: "conta-2", nome: "Nu", dono: "Vitor" }] as Conta[];
const cartoes = [{ id: "cartao-1", nome: "Business", dono: "Diego", conta_vinculada_id: "conta-1" }] as Cartao[];

describe("estadoDaInterpretacao", () => {
  it("saída no crédito à vista vira formulário de crédito com valor formatado", () => {
    const e = estadoDaInterpretacao(base, HOJE);
    expect(e).toMatchObject({ tipo: "Saida", modo: "Credito", nomeInput: "Amazon", valorInput: "54,00", dataInput: "2026-09-01", destinoId: "cartao-1", categoriaId: "cat-1", formato: "À vista", recorrente: false });
  });
  it("parcelado no crédito desliga conta fixa e leva o número de parcelas", () => {
    const e = estadoDaInterpretacao({ ...base, parcelas: 3, conta_fixa: true }, HOJE);
    expect(e.formato).toBe("Parcelado");
    expect(e.numeroParcelas).toBe("3");
    expect(e.recorrente).toBe(false);
  });
  it("parcelas no débito são ignoradas (débito não parcela)", () => {
    const e = estadoDaInterpretacao({ ...base, metodo: "Débito", destino_id: "conta-1", parcelas: 3, conta_fixa: true }, HOJE);
    expect(e.modo).toBe("Debito");
    expect(e.formato).toBe("À vista");
    expect(e.recorrente).toBe(true);
  });
  it("valor zero deixa o campo vazio (abrir o formulário só com o tipo escolhido)", () => {
    expect(estadoDaInterpretacao({ ...base, tipo: "Entrada", valor_cents: 0, metodo: null, destino_id: "conta-1", categoria_id: null }, HOJE).valorInput).toBe("");
  });
  it("data inválida cai em hoje; valor negativo vira positivo", () => {
    const e = estadoDaInterpretacao({ ...base, data: "ontem", valor_cents: -1050 }, HOJE);
    expect(e.dataInput).toBe(HOJE);
    expect(e.valorInput).toBe("10,50");
  });
  it("entrada usa status de entrada e recorrência", () => {
    const e = estadoDaInterpretacao({ ...base, tipo: "Entrada", metodo: null, destino_id: "conta-1", categoria_id: null, status: "Recebido", conta_fixa: true }, HOJE);
    expect(e.statusEntrada).toBe("Recebido");
    expect(e.recorrente).toBe(true);
    expect(e.categoriaId).toBe("");
  });
  it("transferência preenche origem e destino", () => {
    const e = estadoDaInterpretacao({ ...base, tipo: "Transferencia", destino_id: null, de_conta_id: "conta-1", para_conta_id: "conta-2" }, HOJE);
    expect(e.deContaId).toBe("conta-1");
    expect(e.paraContaId).toBe("conta-2");
  });
});

describe("pendências e gravação", () => {
  it("aponta o que falta para salvar", () => {
    const e = estadoDaInterpretacao({ ...base, destino_id: null, categoria_id: null }, HOJE);
    expect(pendenciasDoEstado(e)).toEqual(["cartão", "categoria"]);
    expect(pendenciasDoEstado(estadoDaInterpretacao(base, HOJE))).toEqual([]);
  });
  it("pessoa é o dono do destino; transferência usa a conta de origem", () => {
    expect(pessoaDoEstado(estadoDaInterpretacao(base, HOJE), contas, cartoes)).toBe("Diego");
    const t = estadoDaInterpretacao({ ...base, tipo: "Transferencia", de_conta_id: "conta-2", para_conta_id: "conta-1" }, HOJE);
    expect(pessoaDoEstado(t, contas, cartoes)).toBe("Vitor");
  });
  it("FormData tem os mesmos campos do formulário, com conta vinculada do cartão", () => {
    const fd = formDataDoEstado(estadoDaInterpretacao({ ...base, parcelas: 3 }, HOJE), contas, cartoes);
    expect(Object.fromEntries(fd.entries())).toEqual({
      tipo: "Saida", modo: "Credito", nome: "Amazon", valor: "54,00", data: "2026-09-01", destinoId: "cartao-1", deContaId: "", paraContaId: "",
      categoriaId: "cat-1", status: "A pagar", pessoa: "Diego", formato: "Parcelado", numeroParcelas: "3", contaVinculadaId: "conta-1", recorrente: "false",
    });
  });
});
