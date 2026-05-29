import type { ReactNode } from "react";

export function StateBlock({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="state-block">
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}
