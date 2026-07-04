"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, ChevronDown, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { SaidaList } from "@/components/saida/saida-list";
import { formatCentsToBRL } from "@/lib/domain/money";
import { desfazerFaturaPaga, marcarFaturaComoPaga } from "./actions";
import type { Cartao, Categoria, Saida } from "@/lib/domain/types";

interface FaturaView {
  titulo: string;
  vencimentoLabel: string;
  totalCents: number;
  compras: Saida[];
}

interface FaturaAVencer extends FaturaView {
  temPendente: boolean;
  totalPendenteCents: number;
  cicloAno: number;
  cicloMes: number;
}

export interface CartaoView {
  cartao: Cartao;
  comprometido: number;
  disponivel: number | null;
  contaVinculadaNome: string | null;
  aVencer: FaturaAVencer;
  doMes: FaturaView;
  categoriaNomePorId: Record<string, string>;
}

function LimiteBar({ comprometido, limite }: { comprometido: number; limite: number }) {
  const disponivel = limite - comprometido;
  const pct = (comprometido / limite) * 100;
  const estourado = disponivel < 0;
  const cor = estourado ? "bg-neg" : pct > 80 ? "bg-warn" : "bg-pos";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="type-caption text-ink-3">Limite {formatCentsToBRL(limite)}</span>
        {estourado ? (
          <span className="type-label font-semibold text-neg">
            Excedido em <span className="figures">{formatCentsToBRL(-disponivel)}</span>
          </span>
        ) : (
          <span className="type-caption text-ink-2">
            <span className="figures">{formatCentsToBRL(disponivel)}</span> disponíveis
          </span>
        )}
      </div>
      <ProgressBar percent={pct} colorClassName={cor} />
    </div>
  );
}

function CartaoCard({ view, categorias }: { view: CartaoView; categorias: Categoria[] }) {
  const { cartao, aVencer, doMes } = view;
  const router = useRouter();
  const onMutou = () => router.refresh();
  const confirmar = useConfirm();

  const [abertoAVencer, setAbertoAVencer] = useState(false);
  const [abertoDoMes, setAbertoDoMes] = useState(false);
  const [erroPagar, setErroPagar] = useState<string | null>(null);
  const [pagando, startPagar] = useTransition();
  const [desfazendo, startDesfazer] = useTransition();

  const aVencerPaga = aVencer.compras.length > 0 && !aVencer.temPendente;

  async function pagarFatura() {
    if (!(await confirmar(`Marcar como paga a fatura de ${formatCentsToBRL(aVencer.totalPendenteCents)}?`))) return;
    startPagar(async () => {
      const { error } = await marcarFaturaComoPaga({
        cartaoId: cartao.id,
        ano: aVencer.cicloAno,
        mes: aVencer.cicloMes,
      });
      if (error) {
        setErroPagar(error);
        return;
      }
      setErroPagar(null);
      onMutou();
    });
  }

  async function desfazerPagamento() {
    if (
      !(await confirmar(
        'Desfazer o pagamento desta fatura? As compras voltam pra "A pagar" e o valor é creditado de volta na conta.'
      ))
    )
      return;
    startDesfazer(async () => {
      const { error } = await desfazerFaturaPaga({
        cartaoId: cartao.id,
        ano: aVencer.cicloAno,
        mes: aVencer.cicloMes,
      });
      if (error) {
        setErroPagar(error);
        return;
      }
      setErroPagar(null);
      onMutou();
    });
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="type-title text-ink">{cartao.nome}</h2>
          <p className="type-caption mt-0.5 text-ink-3">
            Fecha dia {cartao.dia_fechamento} · vence dia {cartao.dia_vencimento}
            {view.contaVinculadaNome ? ` · paga por ${view.contaVinculadaNome}` : " · sem conta vinculada"}
          </p>
        </div>
        <PersonTag pessoa={cartao.dono} />
      </div>

      {cartao.limite_cents !== null && <LimiteBar comprometido={view.comprometido} limite={cartao.limite_cents} />}

      {/* Fatura a vencer (mês anterior) — a acionável */}
      <div className="rounded-sm border border-hairline-strong bg-bg p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="type-label text-ink">{aVencer.titulo}</p>
            <p className="type-caption text-ink-3">a vencer · {aVencer.vencimentoLabel}</p>
          </div>
          <Amount cents={aVencer.totalCents} semantic="none" className="type-title text-ink" />
        </div>

        {aVencer.compras.length === 0 ? (
          <p className="type-caption mt-2 text-ink-3">Sem fatura a vencer.</p>
        ) : aVencerPaga ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="type-label flex items-center gap-1.5 text-pos">
              <Check size={15} /> Fatura paga
            </p>
            <button
              type="button"
              onClick={desfazerPagamento}
              disabled={desfazendo}
              className="type-caption flex items-center gap-1 text-ink-3 hover:text-ink disabled:opacity-40"
            >
              <Undo2 size={13} />
              {desfazendo ? "Desfazendo..." : "Desfazer"}
            </button>
          </div>
        ) : (
          <Button variant="primary" onClick={pagarFatura} disabled={pagando} className="mt-3 w-full py-2.5">
            <CheckCheck size={16} />
            {pagando ? "Pagando..." : `Marcar fatura como paga · ${formatCentsToBRL(aVencer.totalPendenteCents)}`}
          </Button>
        )}
        {erroPagar && <p className="type-caption mt-2 text-neg">{erroPagar}</p>}

        {aVencer.compras.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setAbertoAVencer((v) => !v)}
              aria-expanded={abertoAVencer}
              className="mt-3 flex w-full items-center justify-between text-ink-2 transition-colors hover:text-ink"
            >
              <span className="type-caption">
                {aVencer.compras.length} compra{aVencer.compras.length === 1 ? "" : "s"}
              </span>
              <ChevronDown size={15} className={`transition-transform ${abertoAVencer ? "rotate-180" : ""}`} />
            </button>
            {abertoAVencer && (
              <div className="mt-1">
                <SaidaList
                  saidas={aVencer.compras}
                  categorias={categorias}
                  categoriaNomePorId={view.categoriaNomePorId}
                  onMutou={onMutou}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Fatura do mês em foco — ainda acumulando */}
      <div>
        <button
          type="button"
          onClick={() => setAbertoDoMes((v) => !v)}
          aria-expanded={abertoDoMes}
          disabled={doMes.compras.length === 0}
          className="flex w-full items-baseline justify-between gap-3 text-left disabled:cursor-default"
        >
          <div>
            <p className="type-label text-ink">{doMes.titulo}</p>
            <p className="type-caption text-ink-3">do mês · {doMes.vencimentoLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <Amount cents={doMes.totalCents} semantic="none" className="type-title text-ink" />
            {doMes.compras.length > 0 && (
              <ChevronDown size={15} className={`text-ink-3 transition-transform ${abertoDoMes ? "rotate-180" : ""}`} />
            )}
          </div>
        </button>
        {abertoDoMes && doMes.compras.length > 0 && (
          <div className="mt-2">
            <SaidaList
              saidas={doMes.compras}
              categorias={categorias}
              categoriaNomePorId={view.categoriaNomePorId}
              onMutou={onMutou}
            />
          </div>
        )}
        {doMes.compras.length === 0 && <p className="type-caption mt-1 text-ink-3">Nenhuma compra ainda neste mês.</p>}
      </div>
    </Card>
  );
}

export function CartoesList({
  cartoes,
  categorias,
}: {
  cartoes: CartaoView[];
  categorias: Categoria[];
  mesLabel: string;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
      {cartoes.map((view) => (
        <CartaoCard key={view.cartao.id} view={view} categorias={categorias} />
      ))}
    </div>
  );
}
