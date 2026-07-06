"use client";

import { useEffect, useRef, useState } from "react";
import { Calculator as CalcIcon, X } from "lucide-react";
import { formatCentsToBRL } from "@/lib/domain/money";
import { useLancar } from "@/components/lancar/lancar-provider";
import { useToast } from "./toast";

type Op = "+" | "−" | "×" | "÷";

/** Remove o ruído binário de ponto flutuante (0,1+0,2 = 0,3, não 0,30000004). */
function clean(n: number): number {
  return parseFloat(n.toPrecision(12));
}

function parseEntry(s: string): number {
  if (s === "" || s === "-" || s === "Erro") return 0;
  return Number(s.replace(",", "."));
}

/** number → string de entrada canônica (vírgula decimal, sem agrupamento). */
function numberToEntry(n: number): string {
  if (!Number.isFinite(n)) return "Erro";
  return clean(n).toString().replace(".", ",");
}

function apply(a: number, b: number, op: Op): number {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? NaN : a / b;
  }
}

/** Entrada crua → texto do visor, com milhar agrupado no pt-BR. */
function formatForDisplay(entry: string): string {
  if (entry === "Erro") return "Erro";
  if (entry.includes("e") || entry.includes("E")) return entry.replace(".", ",");
  const neg = entry.startsWith("-");
  const body = neg ? entry.slice(1) : entry;
  const [intPart, decPart] = body.split(",");
  const grouped = intPart ? Number(intPart).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "0";
  const out = grouped + (entry.includes(",") ? `,${decPart ?? ""}` : "");
  return (neg ? "-" : "") + out;
}

export function Calculator() {
  const toast = useToast();
  const { aberto: lancarAberto } = useLancar();
  const [aberta, setAberta] = useState(false);

  // Com o Lançar aberto (overlay), a calculadora sai do canto inferior para o
  // alto-direito no mobile (logo abaixo do cabeçalho do modal) — assim não
  // cobre o botão "Salvar" lá embaixo. No desktop o modal é centralizado e
  // sobra margem, então ela fica no lugar de sempre.
  const fabPos = lancarAberto
    ? "right-4 top-20 md:top-auto md:bottom-6 md:right-6"
    : "right-4 bottom-24 md:bottom-6 md:right-6";
  const painelPos = lancarAberto
    ? "right-4 top-36 md:top-auto md:bottom-24 md:right-6"
    : "right-4 bottom-40 md:bottom-24 md:right-6";
  const [entry, setEntry] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [overwrite, setOverwrite] = useState(true);
  const [tape, setTape] = useState("");
  const painelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aberta) painelRef.current?.focus();
  }, [aberta]);

  const erro = entry === "Erro";

  function inputDigito(d: string) {
    if (erro || overwrite) {
      setAcc((a) => (erro ? null : a));
      if (erro) {
        setOp(null);
        setTape("");
      }
      setEntry(d);
      setOverwrite(false);
      return;
    }
    setEntry((e) => (e === "0" ? d : e + d));
  }

  function inputVirgula() {
    if (overwrite || erro) {
      setEntry("0,");
      setOverwrite(false);
      return;
    }
    setEntry((e) => (e.includes(",") ? e : `${e || "0"},`));
  }

  function backspace() {
    if (overwrite || erro) return;
    setEntry((e) => {
      const next = e.slice(0, -1);
      return next === "" || next === "-" ? "0" : next;
    });
  }

  function clearAll() {
    setEntry("0");
    setAcc(null);
    setOp(null);
    setOverwrite(true);
    setTape("");
  }

  function toggleSinal() {
    if (erro) return;
    setEntry((e) => (e === "0" ? e : e.startsWith("-") ? e.slice(1) : `-${e}`));
  }

  function percentual() {
    if (erro) return;
    setEntry(numberToEntry(clean(parseEntry(entry) / 100)));
    setOverwrite(false);
  }

  function escolherOp(next: Op) {
    if (erro) return;
    const atual = parseEntry(entry);
    let novoAcc: number;
    if (acc === null) novoAcc = atual;
    else if (overwrite) novoAcc = acc; // trocou de operador sem novo número
    else novoAcc = clean(apply(acc, atual, op as Op));
    setAcc(novoAcc);
    setOp(next);
    setOverwrite(true);
    setEntry(numberToEntry(novoAcc));
    setTape(`${formatForDisplay(numberToEntry(novoAcc))} ${next}`);
  }

  function igual() {
    if (erro || op === null || acc === null) {
      setTape(`${formatForDisplay(entry)} =`);
      return;
    }
    const atual = parseEntry(entry);
    const resultado = clean(apply(acc, atual, op));
    setTape(`${formatForDisplay(numberToEntry(acc))} ${op} ${formatForDisplay(numberToEntry(atual))} =`);
    setEntry(numberToEntry(resultado));
    setAcc(null);
    setOp(null);
    setOverwrite(true);
  }

  function usarValor() {
    const valor = parseEntry(entry);
    if (erro || !Number.isFinite(valor)) return;
    const cents = Math.round(valor * 100);
    const texto = formatCentsToBRL(cents);
    window.dispatchEvent(new CustomEvent("budget:usar-valor", { detail: { cents } }));
    navigator.clipboard?.writeText(texto.replace("R$", "").trim()).catch(() => {});
    toast(`Copiado: ${texto}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const k = e.key;
    if (k >= "0" && k <= "9") return e.preventDefault(), inputDigito(k);
    if (k === "," || k === ".") return e.preventDefault(), inputVirgula();
    if (k === "+") return e.preventDefault(), escolherOp("+");
    if (k === "-") return e.preventDefault(), escolherOp("−");
    if (k === "*") return e.preventDefault(), escolherOp("×");
    if (k === "/") return e.preventDefault(), escolherOp("÷");
    if (k === "%") return e.preventDefault(), percentual();
    if (k === "Enter" || k === "=") return e.preventDefault(), igual();
    if (k === "Backspace") return e.preventDefault(), backspace();
    if (k === "Escape") return e.preventDefault(), setAberta(false);
    if (k === "c" || k === "C") return e.preventDefault(), clearAll();
  }

  const visor = formatForDisplay(entry);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        aria-label={aberta ? "Fechar calculadora" : "Abrir calculadora"}
        className={`glow-brand fixed z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-brand text-on-brand transition-transform hover:scale-105 active:scale-95 ${fabPos}`}
      >
        {aberta ? <X size={22} strokeWidth={2} /> : <CalcIcon size={22} strokeWidth={1.8} />}
      </button>

      {aberta && (
        <div
          ref={painelRef}
          role="dialog"
          aria-label="Calculadora"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={`glass calc-panel fixed z-[60] w-[19rem] max-w-[calc(100vw-2rem)] rounded-lg p-4 outline-none ${painelPos}`}
        >
          {/* Visor + fita de somadora (a expressão corrente) */}
          <div className="mb-1 min-h-4 text-right">
            <span className="type-caption figures truncate text-ink-3">{tape || " "}</span>
          </div>
          <div
            aria-live="polite"
            className={`type-display figures overflow-x-auto text-right tabular-nums ${erro ? "text-neg" : "text-ink"}`}
          >
            {visor}
          </div>
          <div className="rule-ledger mb-3 mt-2" aria-hidden="true" />

          <div className="grid grid-cols-4 gap-1.5">
            <Tecla variante="util" onClick={clearAll} aria-label="Limpar tudo">
              AC
            </Tecla>
            <Tecla variante="util" onClick={backspace} aria-label="Apagar último dígito">
              ⌫
            </Tecla>
            <Tecla variante="util" onClick={percentual} aria-label="Porcentagem">
              %
            </Tecla>
            <Tecla variante="op" ativo={op === "÷" && overwrite} onClick={() => escolherOp("÷")} aria-label="Dividir">
              ÷
            </Tecla>

            <Tecla onClick={() => inputDigito("7")}>7</Tecla>
            <Tecla onClick={() => inputDigito("8")}>8</Tecla>
            <Tecla onClick={() => inputDigito("9")}>9</Tecla>
            <Tecla variante="op" ativo={op === "×" && overwrite} onClick={() => escolherOp("×")} aria-label="Multiplicar">
              ×
            </Tecla>

            <Tecla onClick={() => inputDigito("4")}>4</Tecla>
            <Tecla onClick={() => inputDigito("5")}>5</Tecla>
            <Tecla onClick={() => inputDigito("6")}>6</Tecla>
            <Tecla variante="op" ativo={op === "−" && overwrite} onClick={() => escolherOp("−")} aria-label="Subtrair">
              −
            </Tecla>

            <Tecla onClick={() => inputDigito("1")}>1</Tecla>
            <Tecla onClick={() => inputDigito("2")}>2</Tecla>
            <Tecla onClick={() => inputDigito("3")}>3</Tecla>
            <Tecla variante="op" ativo={op === "+" && overwrite} onClick={() => escolherOp("+")} aria-label="Somar">
              +
            </Tecla>

            <Tecla onClick={toggleSinal} aria-label="Inverter sinal">
              ±
            </Tecla>
            <Tecla onClick={() => inputDigito("0")}>0</Tecla>
            <Tecla onClick={inputVirgula} aria-label="Vírgula decimal">
              ,
            </Tecla>
            <Tecla variante="igual" onClick={igual} aria-label="Igual">
              =
            </Tecla>
          </div>

          <button
            type="button"
            onClick={usarValor}
            disabled={erro}
            className="type-label mt-3 w-full rounded-sm bg-brand py-2.5 font-semibold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-40"
          >
            Usar valor
          </button>
          <p className="type-caption mt-1.5 text-center text-ink-3">Copia e joga no campo Valor da tela Lançar</p>
        </div>
      )}
    </>
  );
}

type Variante = "digito" | "op" | "util" | "igual";

function Tecla({
  children,
  onClick,
  variante = "digito",
  ativo = false,
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  variante?: Variante;
  ativo?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "flex h-12 items-center justify-center rounded-sm type-title transition-colors select-none";
  const estilo =
    variante === "igual"
      ? "bg-brand text-on-brand hover:bg-brand-hover"
      : variante === "op"
        ? ativo
          ? "bg-brand text-on-brand"
          : "bg-brand-tint text-on-brand-tint hover:brightness-97"
        : variante === "util"
          ? "border border-hairline text-ink-2 hover:bg-brand-tint hover:text-on-brand-tint"
          : "bg-surface border border-hairline text-ink hover:border-ink-3";
  return (
    <button type="button" onClick={onClick} className={`${base} ${estilo}`} {...rest}>
      {children}
    </button>
  );
}
