import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: boolean;
};

export function Card({ padding = true, className = "", children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={[
        "rounded-xl border border-slate-200 bg-white shadow-sm",
        padding ? "p-6" : "",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200",
        className,
      ].join(" ")}
    >
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}
