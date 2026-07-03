"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

function temaAtual(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  // null até montar — o atributo é definido por script inline antes da
  // hidratação, então só dá pra ler no cliente.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(temaAtual());
  }, []);

  function alternar() {
    const proximo: Theme = temaAtual() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", proximo);
    try {
      localStorage.setItem("theme", proximo);
    } catch {
      // storage indisponível — o tema ainda vale para esta sessão
    }
    setTheme(proximo);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
      className="flex h-9 w-9 items-center justify-center rounded-sm text-ink-2 transition-colors hover:bg-brand-tint hover:text-on-brand-tint"
    >
      {theme === "dark" ? <Sun size={17} strokeWidth={1.75} /> : <Moon size={17} strokeWidth={1.75} />}
    </button>
  );
}
