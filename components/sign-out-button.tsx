"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      aria-label="Sair da conta"
      title="Sair"
      className="flex h-9 w-9 items-center justify-center rounded-sm text-ink-2 transition-colors hover:bg-neg-tint hover:text-on-neg-tint"
    >
      <LogOut size={17} strokeWidth={1.75} />
    </button>
  );
}
