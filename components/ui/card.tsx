import type { HTMLAttributes } from "react";

type CardVariant = "surface" | "raised" | "tint" | "glass";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const VARIANT_CLASSES: Record<CardVariant, string> = {
  surface: "glass",
  raised: "glass",
  tint: "bg-brand-tint",
  glass: "glass",
};

export function Card({ variant = "surface", className = "", ...props }: CardProps) {
  return <div className={`rounded-md p-5 ${VARIANT_CLASSES[variant]} ${className}`} {...props} />;
}
