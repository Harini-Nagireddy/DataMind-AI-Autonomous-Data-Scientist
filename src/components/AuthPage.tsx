import React, { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Sparkles, UserRound } from "lucide-react";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
}

interface AuthPageProps {
  onAuthenticated: (user: AuthUser) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || "Authentication failed.");
      onAuthenticated(data.user);
    } catch (err: any) {
      setError(err?.message || "Unable to complete authentication.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-5 py-10 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-indigo-600/10 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[9px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-xl tracking-tight">DataMind</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-semibold border border-indigo-500/30">AI</span>
              </div>
              <p className="text-[11px] text-slate-500">Autonomous Data Scientist</p>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="text-sm text-slate-400 mt-2">
            {mode === "login" ? "Sign in to continue your data science workspace." : "Create an account to access your DataMind workspace."}
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 md:p-7 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-950 border border-slate-800 mb-6">
            {(["login", "signup"] as const).map((item) => (
              <button key={item} type="button" onClick={() => { setMode(item); setError(""); }} className={`py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === item ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"}`}>
                {item === "login" ? "Login" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && <Field icon={<UserRound />} label="Full name" value={name} onChange={setName} placeholder="Your name" autoComplete="name" />}
            <Field icon={<Mail />} label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Password</label>
              <div className="relative">
                <LockKeyhole className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input required minLength={8} type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} className="w-full h-11 pl-10 pr-11 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" aria-label="Toggle password visibility">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {mode === "signup" && <Field icon={<LockKeyhole />} label="Confirm password" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter your password" autoComplete="new-password" />}

            {error && <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-3.5 py-3 text-xs text-red-300">{error}</div>}

            <button disabled={loading} className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2">
              {loading ? "Please wait..." : mode === "login" ? "Login to DataMind" : "Create DataMind Account"}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-600 mt-5">Your password is never stored as plain text. Authentication is handled by the DataMind server.</p>
      </div>
    </div>
  );
};

function Field({ icon, label, type = "text", value, onChange, placeholder, autoComplete }: { icon: React.ReactNode; label: string; type?: string; value: string; onChange: (value: string) => void; placeholder: string; autoComplete?: string }) {
  return <div>
    <label className="block text-xs font-semibold text-slate-300 mb-2">{label}</label>
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
      <input required type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} className="w-full h-11 pl-10 pr-3 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all" />
    </div>
  </div>;
}
