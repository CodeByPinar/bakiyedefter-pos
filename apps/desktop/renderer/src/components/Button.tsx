import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export function Button({ icon, variant = "secondary", className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; variant?: "primary" | "secondary" | "danger" | "quiet" }) {
  return (
    <button className={clsx("button", `button--${variant}`, className)} {...props}>
      {icon ? <span className="button__icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}
