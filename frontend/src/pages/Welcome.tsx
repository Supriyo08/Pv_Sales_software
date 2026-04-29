import { Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sun,
  Users,
  FileSignature,
  Coins,
  BarChart3,
  Bell,
  ShieldCheck,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../store/auth";

const FEATURES = [
  {
    icon: Users,
    title: "Sales hierarchy",
    body: "Admins, area managers and agents — territory mapping and role-based access from day one.",
  },
  {
    icon: FileSignature,
    title: "Contracts → installations",
    body: "Track every deal from lead to activation. Milestone-based status and document storage.",
  },
  {
    icon: Coins,
    title: "Versioned commissions",
    body: "Pricing and commission rules are versioned. Every euro paid traces back to a snapshot.",
  },
  {
    icon: BarChart3,
    title: "Reports + exports",
    body: "Agent earnings, network performance, payment status — with CSV exports.",
  },
  {
    icon: Bell,
    title: "Real-time notifications",
    body: "Managers pinged on signed contracts; agents on bonuses. In-app feed with unread badge.",
  },
  {
    icon: ShieldCheck,
    title: "Append-only finance",
    body: "Commission rows are immutable. Corrections create new rows; old ones supersede.",
  },
];

const fade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

export function Welcome() {
  const token = useAuth((s) => s.accessToken);
  if (token) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-hidden">
      <div
        className="absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #0f172a 1px, transparent 1px), linear-gradient(to bottom, #0f172a 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at top, black 40%, transparent 80%)",
        }}
      />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -z-10 size-[800px] rounded-full bg-brand-500/10 blur-[120px]" />

      <header className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="size-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white shadow-md shadow-brand-500/30">
            <Sun className="size-5" />
          </span>
          <span>PV Sales</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            to="/signin"
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition rounded-lg"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="relative max-w-6xl mx-auto px-6 pt-16 pb-24">
        <motion.div
          className="text-center max-w-3xl mx-auto"
          initial="initial"
          animate="animate"
          transition={{ staggerChildren: 0.08 }}
        >
          <motion.span
            variants={fade}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-600 text-xs font-medium shadow-sm mb-6"
          >
            <Sparkles className="size-3 text-brand-500" />
            Photovoltaic sales platform
          </motion.span>
          <motion.h1
            variants={fade}
            transition={{ duration: 0.5 }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.05]"
          >
            Run your PV sales network
            <br />
            <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-amber-500 bg-clip-text text-transparent">
              with traceable money
            </span>
          </motion.h1>
          <motion.p
            variants={fade}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-6 text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto"
          >
            Hierarchy, contracts, commissions, bonuses, payments — one auditable system. Every
            calculation traces back to source events. No spreadsheet hell.
          </motion.p>
          <motion.div
            variants={fade}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-8 flex items-center justify-center gap-3 flex-wrap"
          >
            <Link
              to="/signup"
              className="group inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-md transition"
            >
              Create account
              <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/signin"
              className="px-5 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 rounded-lg border border-slate-200 hover:border-slate-300 transition"
            >
              Sign in
            </Link>
          </motion.div>
          <motion.p
            variants={fade}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-4 text-xs text-slate-400"
          >
            Demo:&nbsp;
            <code className="font-mono px-1 py-0.5 rounded bg-slate-100">admin@example.com</code>
            &nbsp;/&nbsp;
            <code className="font-mono px-1 py-0.5 rounded bg-slate-100">admin1234</code>
          </motion.p>
        </motion.div>

        <motion.div
          className="mt-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-50px" }}
          transition={{ staggerChildren: 0.05 }}
        >
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <motion.div
              key={title}
              variants={fade}
              transition={{ duration: 0.4 }}
              className="group rounded-xl border border-slate-200 bg-white/80 backdrop-blur p-6 hover:shadow-xl hover:shadow-brand-500/5 hover:border-brand-200 hover:-translate-y-0.5 transition-all"
            >
              <div className="size-10 rounded-lg bg-brand-50 text-brand-600 grid place-items-center mb-4 group-hover:scale-110 transition-transform">
                <Icon className="size-5" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1.5">{title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-24 relative rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-brand-900 p-10 sm:p-14 text-center text-white overflow-hidden"
        >
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 30% 20%, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
          <div className="relative">
            <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight">
              Stop trusting spreadsheets.
            </h2>
            <p className="mt-4 text-slate-300 max-w-2xl mx-auto">
              Idempotent monthly bonus runs · versioned pricing · immutable commission ledger ·
              role-based access · audit trail on every change.
            </p>
            <Link
              to="/signup"
              className="mt-8 inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition shadow-lg"
            >
              Get started — it's free
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </motion.div>
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-8 text-center text-xs text-slate-400 border-t border-slate-200">
        Express · MongoDB · Redis · BullMQ · React · Tailwind v4 · Radix · Framer Motion
      </footer>
    </div>
  );
}
