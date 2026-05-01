import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-slate-50 border-b border-slate-200">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ children, className = "", ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      className={[
        "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500",
        className,
      ].join(" ")}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>;
}

export function Tr({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const cls = [
    onClick ? "cursor-pointer transition hover:bg-slate-50" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <tr onClick={onClick} className={cls || undefined}>
      {children}
    </tr>
  );
}

export function Td({ children, className = "", ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td {...rest} className={["px-4 py-3 text-slate-700", className].join(" ")}>
      {children}
    </td>
  );
}
