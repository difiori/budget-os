"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

const THEME_EVENT = "theme-change";

function lerTema(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

// Server e primeira pintura sempre assumem "light" — o script inline em
// app/layout.tsx já corrige o atributo antes da hidratação (suppressHydrationWarning).
function getServerSnapshot(): Theme {
  return "light";
}

function definirTema(proximo: Theme) {
  document.documentElement.setAttribute("data-theme", proximo);
  try {
    localStorage.setItem("theme", proximo);
  } catch {
    // storage indisponível — o tema ainda vale para esta sessão
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, lerTema, getServerSnapshot);
  const escuro = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={escuro}
      aria-label="Alternar tema escuro"
      onClick={() => definirTema(escuro ? "light" : "dark")}
      className="relative flex h-6 w-11 shrink-0 items-center rounded-full bg-track transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-2"
    >
      <span
        className={`flex h-4.5 w-4.5 items-center justify-center rounded-full bg-surface text-ink-2 shadow-raised transition-transform ${
          escuro ? "translate-x-[1.375rem]" : "translate-x-0.5"
        }`}
      >
        {escuro ? <Moon size={11} strokeWidth={2} /> : <Sun size={11} strokeWidth={2} />}
      </span>
    </button>
  );
}
