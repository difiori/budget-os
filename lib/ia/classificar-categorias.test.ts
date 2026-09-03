import { describe, expect, it } from "vitest";
import { formatCentsToBRL } from "@/lib/domain/money";
import {
  ClassificacaoSchema,
  mensagemClassificar,
  montarHistoricoCategorias,
  proporPeloHistorico,
  propostasDaIA,
  systemPromptClassificar,
  type ItemParaClassificar,
} from "./classificar-categorias";

const GD = "gd";
const categorias = [{ id: "shop", nome: "Shopping" }, { id: "alim", nome: "Alimentação" }, { id: "farm", nome: "Farmácia" }];
const item = (id: string, nome: string, extra: Partial<ItemParaClassificar> = {}): ItemParaClassificar => ({
  id, nome, pessoa: "Diego", valor_cents: 5400, metodo: "Crédito", destino: "C6 Business", data: "2026-03-12", ...extra,
});

describe("histórico", () => {
  const hist = montarHistoricoCategorias(
    [
      { nome: "Amazon", pessoa: "Diego", categoria_id: "shop" },
      { nome: "Amazon", pessoa: "Diego", categoria_id: "shop" },
      { nome: "Amazon 02/03", pessoa: "Diego", categoria_id: "shop" },
      { nome: "Amazon", pessoa: "Diego", categoria_id: "alim" },
      { nome: "Amazon", pessoa: "Diego", categoria_id: GD },
      { nome: "Oxxo", pessoa: "Diego", categoria_id: "alim" },
      { nome: "Oxxo", pessoa: "Diego", categoria_id: "shop" },
      { nome: "Drogasil", pessoa: "Vitor", categoria_id: "farm" },
    ],
    GD
  );
  it("propõe a categoria dominante do nome, ignorando Gastos Diversos e a parcela no nome", () => {
    expect(proporPeloHistorico(item("1", "Amazon 05/10"), hist)).toEqual({ id: "1", categoriaId: "shop", confianca: 1, origem: "historico" });
  });
  it("não propõe quando o nome é dividido entre categorias ou é de outra pessoa", () => {
    expect(proporPeloHistorico(item("2", "Oxxo"), hist)).toBeNull();
    expect(proporPeloHistorico(item("3", "Drogasil"), hist)).toBeNull();
    expect(proporPeloHistorico(item("4", "Drogasil", { pessoa: "Vitor" }), hist)).toMatchObject({ categoriaId: "farm", confianca: 0.85 });
  });
});

describe("IA", () => {
  it("prompt usa códigos e a mensagem numera os itens", () => {
    const p = systemPromptClassificar({ pessoa: "Diego", categorias, exemplos: [{ nome: "Amazon", categoria: "Shopping" }] });
    expect(p).toContain("G1 = Shopping");
    expect(p).toContain('"Amazon" → Shopping');
    const v = formatCentsToBRL(5400);
    expect(mensagemClassificar([item("1", "Amazon"), item("2", "Drogasil", { metodo: "Débito", destino: null })])).toBe(
      `Classifique estas 2 saídas:\n1) Amazon · ${v} · Crédito · C6 Business · 2026-03-12\n2) Drogasil · ${v} · Débito · 2026-03-12`
    );
  });
  it("traduz códigos para ids e trata índice faltando ou código inválido", () => {
    const resposta = ClassificacaoSchema.parse({ itens: [{ i: 1, categoria: "G1", confianca: 0.9 }, { i: 2, categoria: "G9", confianca: 0.8 }] });
    expect(propostasDaIA(resposta, [item("a", "Amazon"), item("b", "X"), item("c", "Y")], categorias)).toEqual([
      { id: "a", categoriaId: "shop", confianca: 0.9, origem: "ia" },
      { id: "b", categoriaId: null, confianca: 0, origem: "nenhuma" },
      { id: "c", categoriaId: null, confianca: 0, origem: "nenhuma" },
    ]);
  });
});
