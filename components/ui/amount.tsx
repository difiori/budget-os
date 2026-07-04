import { formatCentsToBRL } from "@/lib/domain/money";

type Semantic = "none" | "neg" | "both";

/**
 * Valor monetário com semântica de cor: negativo sempre pode sinalizar
 * (granada), positivo só quando o contexto compara entradas x saídas
 * (semantic="both"). Nunca usar cor decorativa em dinheiro.
 */
export function Amount({
  cents,
  semantic = "neg",
  className = "",
}: {
  cents: number;
  semantic?: Semantic;
  className?: string;
}) {
  const cor =
    semantic !== "none" && cents < 0
      ? "text-neg"
      : semantic === "both" && cents > 0
        ? "text-pos"
        : "";
  return <span className={`figures ${cor} ${className}`.trim()}>{formatCentsToBRL(cents)}</span>;
}
