import { Link } from "react-router-dom";
import { Sun, ShieldCheck, Coins, BarChart3 } from "lucide-react";
import type { ReactNode } from "react";

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="flex flex-col px-6 sm:px-12 py-8">
        <Link to="/" className="flex items-center gap-2 text-slate-900 font-semibold">
          <span className="size-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white shadow-sm">
            <Sun className="size-5" />
          </span>
          <span>PV Sales</span>
        </Link>

        <div className="flex-1 grid place-items-center">
          <div className="w-full max-w-sm animate-fade-in">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            {description && <p className="text-sm text-slate-500 mt-1.5">{description}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-6 text-sm text-slate-500 text-center">{footer}</div>}
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center">© Photovoltaic Sales Platform</p>
      </div>

      <div className="hidden lg:block bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 30% 20%, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="relative h-full flex flex-col justify-center px-12 text-white">
          <h2 className="text-3xl font-semibold leading-tight max-w-md">
            One platform for hierarchy, contracts, commissions, and payments.
          </h2>
          <p className="mt-4 text-brand-100 max-w-md leading-relaxed">
            Every euro paid traces back to a contract event. Every bonus computation is idempotent.
            Every change is audited.
          </p>
          <div className="mt-10 grid gap-4 max-w-md">
            <Highlight icon={ShieldCheck} title="Append-only finance">
              Commission rows are immutable. Corrections supersede, never overwrite.
            </Highlight>
            <Highlight icon={Coins} title="Versioned pricing">
              Solution + commission rates change over time without breaking past contracts.
            </Highlight>
            <Highlight icon={BarChart3} title="Reports built in">
              Agent earnings, network performance, pipeline funnel — with CSV exports.
            </Highlight>
          </div>
        </div>
      </div>
    </div>
  );
}

function Highlight({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="size-9 shrink-0 rounded-lg bg-white/10 text-white grid place-items-center backdrop-blur">
        <Icon className="size-4" />
      </div>
      <div>
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-brand-100 mt-0.5">{children}</div>
      </div>
    </div>
  );
}
