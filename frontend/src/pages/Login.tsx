import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { AuthLayout } from "../components/AuthLayout";
import { Field, Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

export function Login() {
  const navigate = useNavigate();
  const setTokens = useAuth((s) => s.set);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setTokens(data);
      navigate("/dashboard");
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Sign-in failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const useDemo = () => {
    setEmail("admin@example.com");
    setPassword("admin1234");
  };

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to your PV Sales account."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" className="text-brand-600 hover:text-brand-700 font-medium">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
          />
        </Field>
        <Field label="Password" required>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </Field>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <Button type="submit" loading={loading} size="lg">
          Sign in
        </Button>
        <button
          type="button"
          onClick={useDemo}
          className="text-xs text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline"
        >
          Use demo admin credentials
        </button>
      </form>
    </AuthLayout>
  );
}
