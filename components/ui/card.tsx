import type { HTMLAttributes } from "react";

type CardVariant = "surface" | "raised" | "tint";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const VARIANT_CLASSES: Record<CardVariant, string> = {
  surface: "bg-surface border border-hairline",
  raised: "bg-raised border border-hairline shadow-raised",
  tint: "bg-brand-tint",
};

export function Card({ variant = "surface", className = "", ...props }: CardProps) {
  return <div className={`rounded-md p-5 ${VARIANT_CLASSES[variant]} ${className}`} {...props} />;
}
