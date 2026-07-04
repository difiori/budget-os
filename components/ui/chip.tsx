"use client";

import { chipClasses } from "./chip-styles";

interface ChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export function Chip({ label, selected, onClick, disabled }: ChipProps) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} className={chipClasses(selected)}>
      {label}
    </button>
  );
}
