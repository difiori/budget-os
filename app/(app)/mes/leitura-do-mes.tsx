"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { hashDados, type DadosFechamento } from "@/lib/ia/narrativa-fechamento";
import { gerarLeituraDoMes, type LeituraDoMes as Leitura } from "./actions";

function quando(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/**
 * "Leitura do mês": texto curto gerado pela IA a partir dos números do
 * fechamento. Guardado por mês/escopo; avisa quando os números mudaram desde
 * a última leitura e oferece atualizar.
 */
export function LeituraDoMes({
  mesISO,
  escopo,
  dados,
  existente,
  iaDisponivel,
}: {
  mesISO: string;
  escopo: string;
  dados: DadosFechamento;
  existente: Leitura | null;
  iaDisponivel: boolean;
}) {
  const [leitura, setLeitura] = useState<Leitura | null>(existente);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, startTransition] = useTransition();
  const toast = useToast();
  const hashAtual = hashDados(dados);
  const desatualizada = !!leitura && leitura.hash !== hashAtual;

  function gerar(forcar: boolean) {
    setErro(null);
    startTransition(async () => {
      const r = await gerarLeituraDoMes({ mesISO, escopo, dados, forcar });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setLeitura(r.leitura);
      if (r.reaproveitada) toast("Os números não mudaram desde a última leitura.");
    });
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-brand" />
          <p className="type-title text-ink">Leitura do mês</p>
        </div>
        {leitura && (
          <p className="type-caption text-ink-3">
            gerada em {quando(leitura.geradoEm)}
            {desatualizada && <span className="text-warn"> · os números mudaram desde então</span>}
          </p>
        )}
      </div>

      {!iaDisponivel ? (
        <p className="type-caption text-ink-3">
          Para gerar a leitura com IA, defina ANTHROPIC_API_KEY nas variáveis de ambiente do projeto.
        </p>
      ) : leitura ? (
        <div className="flex flex-col gap-3">
          <div className="type-body flex flex-col gap-2 text-ink">
            {leitura.texto.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => gerar(true)} disabled={gerando} className="px-3 py-1.5">
              <RefreshCw size={14} className={gerando ? "animate-spin" : ""} />
              {gerando ? "Gerando…" : desatualizada ? "Atualizar leitura" : "Regerar"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="type-body text-ink-2">
            Em três parágrafos: o essencial do mês, o que explica as variações e o que fazer no próximo. Só com os
            números desta tela, nada inventado.
          </p>
          <Button variant="tonal" onClick={() => gerar(false)} disabled={gerando} className="self-start px-3 py-2">
            <Sparkles size={14} />
            {gerando ? "Gerando…" : "Gerar leitura com IA"}
          </Button>
        </div>
      )}
      {erro && <p className="type-caption text-neg">{erro}</p>}
    </Card>
  );
}
