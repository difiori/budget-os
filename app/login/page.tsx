"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";

type Status = "idle" | "sending" | "error";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus("error");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-10 px-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-[2rem] leading-tight text-ink" style={{ fontFamily: "var(--font-display)" }}>
          Budget OS
        </h1>
        <p className="type-eyebrow text-ink-3">Diego &amp; Vitor</p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <div className="rule-ledger mb-2" aria-hidden="true" />
        <label htmlFor="email" className="type-label text-ink-2">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputClasses}
        />
        <label htmlFor="password" className="type-label mt-2 text-ink-2">
          Senha
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Sua senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClasses}
        />
        <Button type="submit" disabled={status === "sending"} className="mt-3 w-full py-3">
          {status === "sending" ? "Entrando..." : "Entrar"}
        </Button>
        {status === "error" && (
          <p className="type-body rounded-sm bg-neg-tint px-4 py-3 text-center text-on-neg-tint">
            Email ou senha inválidos. Confira e tente de novo.
          </p>
        )}
      </form>
    </main>
  );
}
