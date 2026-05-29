import type { InputHTMLAttributes } from "react";

export function FormField({ label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="field__input" {...props} />
      {error ? <span className="field__error">{error}</span> : null}
    </label>
  );
}
