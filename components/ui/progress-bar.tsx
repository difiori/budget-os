interface ProgressBarProps {
  /** 0-100, já calculado pelo chamador. Valores acima de 100 são clampados. */
  percent: number;
  /** Classe Tailwind da cor preenchida, ex. "bg-ink-2" ou "bg-neg". */
  colorClassName?: string;
  heightClassName?: string;
  /** Largura mínima visível mesmo quando o valor é muito pequeno perto do total. */
  minPercent?: number;
}

export function ProgressBar({
  percent,
  colorClassName = "bg-ink-2",
  heightClassName = "h-1.5",
  minPercent = 2,
}: ProgressBarProps) {
  const clamped = Math.max(minPercent, Math.min(100, Math.max(0, percent)));
  return (
    <div className={`w-full overflow-hidden rounded-full bg-track ${heightClassName}`}>
      <div className={`h-full rounded-full ${colorClassName}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
