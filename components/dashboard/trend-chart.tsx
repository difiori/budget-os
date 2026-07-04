"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

interface TrendChartProps {
  labels: string[];
  gastos: number[];
  entradas: number[];
}

/** Observa o atributo data-theme para re-resolver os tokens quando o tema
 * muda — Chart.js pinta em canvas e não acompanha var(--...) sozinho. */
function useTheme(): string {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => observer.disconnect();
    },
    () => document.documentElement.getAttribute("data-theme") ?? "light",
    () => "light"
  );
}

function lerTokens() {
  if (typeof window === "undefined") {
    return {
      pos: "#177149",
      neg: "#a63a41",
      ink3: "#8b948d",
      hairline: "#e2e4dc",
      tooltipBg: "#1c2420",
      tooltipText: "#f4f4f0",
      fontFamily: "sans-serif",
    };
  }
  const raiz = getComputedStyle(document.documentElement);
  const ler = (nome: string, fallback: string) => raiz.getPropertyValue(nome).trim() || fallback;
  return {
    pos: ler("--color-pos", "#177149"),
    neg: ler("--color-neg", "#a63a41"),
    ink3: ler("--color-ink-3", "#8b948d"),
    hairline: ler("--color-hairline", "#e2e4dc"),
    tooltipBg: ler("--color-ink", "#1c2420"),
    tooltipText: ler("--color-bg", "#f4f4f0"),
    fontFamily: getComputedStyle(document.body).fontFamily || "sans-serif",
  };
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function TrendChart({ labels, gastos, entradas }: TrendChartProps) {
  const theme = useTheme();
  const cores = useMemo(() => lerTokens(), [theme]);

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: cores.ink3, font: { family: cores.fontFamily, size: 11 } },
      },
      y: {
        min: 0,
        border: { display: false },
        grid: { color: cores.hairline },
        ticks: {
          maxTicksLimit: 4,
          color: cores.ink3,
          font: { family: cores.fontFamily, size: 11 },
          callback: (v) => (Number(v) / 100).toLocaleString("pt-BR", { notation: "compact" }),
        },
      },
    },
    plugins: {
      tooltip: {
        backgroundColor: cores.tooltipBg,
        titleColor: cores.tooltipText,
        bodyColor: cores.tooltipText,
        padding: 10,
        cornerRadius: 6,
        boxPadding: 4,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${brl(Number(ctx.raw))}`,
        },
      },
    },
  };

  const data = {
    labels,
    datasets: [
      {
        label: "Entradas",
        data: entradas,
        borderColor: cores.pos,
        backgroundColor: "transparent",
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
      {
        label: "Saídas",
        data: gastos,
        borderColor: cores.neg,
        backgroundColor: "transparent",
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ],
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-ink-2">
          <span className="h-0.5 w-4 rounded-full bg-pos" aria-hidden="true" />
          <span className="type-caption">Entradas</span>
        </span>
        <span className="flex items-center gap-1.5 text-ink-2">
          <span className="h-0.5 w-4 rounded-full bg-neg" aria-hidden="true" />
          <span className="type-caption">Saídas</span>
        </span>
      </div>
      {/* O canvas fica absoluto: a largura intrínseca dele não pode entrar no
          min-content do grid, senão a página inteira trava mais larga que o
          viewport no mobile. */}
      <div
        role="img"
        aria-label="Gráfico de linha comparando entradas e saídas nos últimos meses"
        className="trend-chart-wrap"
        style={{ position: "relative", width: "100%", height: "190px" }}
      >
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
