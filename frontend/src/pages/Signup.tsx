import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { AuthLayout } from "../components/AuthLayout";
import { Field, Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

export function Signup() {
  const navigate = useNavigate();
  const setTokens = useAuth((s) => s.set);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", {
        email,
        password,
        fullName,
        role: "AGENT",
      });
      setTokens(data);
      navigate("/dashboard");
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Sign-up failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      description="Self-signup creates an AGENT account."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/signin" className="text-brand-600 hover:text-brand-700 font-medium">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Full name" required>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            required
          />
        </Field>
        <Field label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
          />
        </Field>
        <Field
          label="Password"
          required
          hint="At least 8 characters."
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
          />
        </Field>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <Button type="submit" loading={loading} size="lg">
          Create account
        </Button>
        <p className="text-xs text-slate-500 text-center">
          Need ADMIN or AREA_MANAGER access? An admin in your organization must invite you.
        </p>
      </form>
    </AuthLayout>
  );
}
