"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 70;
const MAX = 96;

/** Puxar-pra-atualizar (só mobile/PWA, que não tem o gesto nativo em modo
 * standalone). Ao arrastar pra baixo com a página no topo, dispara
 * router.refresh() — os dados do servidor são re-buscados. */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    function begin(e: TouchEvent) {
      if (refreshingRef.current || window.scrollY > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    }
    function move(e: TouchEvent) {
      if (startY.current == null || refreshingRef.current) return;
      if (window.scrollY > 0) {
        startY.current = null;
        setPull(0);
        pullRef.current = 0;
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      const p = dy <= 0 ? 0 : Math.min(dy * 0.5, MAX);
      pullRef.current = p;
      setPull(p);
    }
    function end() {
      if (startY.current == null) return;
      startY.current = null;
      if (pullRef.current >= THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPull(THRESHOLD);
        pullRef.current = THRESHOLD;
        router.refresh();
        window.setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          setPull(0);
          pullRef.current = 0;
        }, 700);
      } else {
        setPull(0);
        pullRef.current = 0;
      }
    }
    window.addEventListener("touchstart", begin, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", begin);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, [router]);

  const offset = refreshing ? THRESHOLD : pull;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center md:hidden"
      style={{
        opacity: offset > 0 ? 1 : 0,
        transform: `translateY(${offset}px)`,
        paddingTop: "env(safe-area-inset-top)",
        transition: startYIdle(pull, refreshing) ? "transform 200ms ease, opacity 200ms ease" : "none",
      }}
    >
      <span className="mt-2 flex h-9 w-9 items-center justify-center rounded-full bg-raised text-brand shadow-raised">
        <RefreshCw
          size={18}
          className={refreshing ? "animate-spin" : ""}
          style={refreshing ? undefined : { transform: `rotate(${pull * 2.5}deg)` }}
        />
      </span>
    </div>
  );
}

/** Anima a volta (transição) quando não está no meio do arraste. */
function startYIdle(pull: number, refreshing: boolean): boolean {
  return refreshing || pull === 0;
}
