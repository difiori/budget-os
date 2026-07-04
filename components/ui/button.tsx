import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "tonal" | "outline" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover",
  tonal: "bg-brand-tint text-on-brand-tint hover:brightness-97",
  outline: "border border-hairline-strong bg-surface text-ink hover:border-ink-3",
  ghost: "text-ink-2 hover:bg-brand-tint hover:text-on-brand-tint",
  danger: "bg-neg-tint text-on-neg-tint hover:brightness-97",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`type-label inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2.5 font-semibold transition-colors disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
