import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { Loader2 } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message.replace("Firebase: ", "").replace(/ \(auth.*\)\.?/, ""));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{
        background: "linear-gradient(135deg, #030906 0%, #061209 25%, #0D2518 55%, #163828 100%)",
      }}
    >
      {/* Decorative background orbs */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: "10%", left: "8%",
          width: 480, height: 480,
          background: "radial-gradient(circle, rgba(76,175,80,0.18) 0%, transparent 65%)",
          filter: "blur(60px)",
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          bottom: "15%", right: "10%",
          width: 320, height: 320,
          background: "radial-gradient(circle, rgba(34,197,94,0.14) 0%, transparent 65%)",
          filter: "blur(50px)",
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          top: "55%", left: "55%",
          width: 200, height: 200,
          background: "radial-gradient(circle, rgba(76,175,80,0.10) 0%, transparent 65%)",
          filter: "blur(40px)",
        }}
      />

      {/* Card */}
      <div
        className="animate-fade-up relative z-10 w-full max-w-[420px]"
        style={{
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRadius: 28,
          padding: "44px 40px",
          boxShadow:
            "0 32px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.6)",
        }}
      >
        {/* Brand */}
        <div className="mb-8 flex items-center gap-3.5">
          <div
            className="grid h-12 w-12 place-items-center rounded-2xl text-base font-black text-white"
            style={{
              background: "linear-gradient(135deg, #163828 0%, #4CAF50 100%)",
              boxShadow: "0 6px 20px rgba(76,175,80,0.4)",
            }}
          >
            kT
          </div>
          <div>
            <h1
              className="text-2xl font-black leading-none"
              style={{
                background: "linear-gradient(135deg, #163828 0%, #2E7D32 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              kaTuro AI
            </h1>
            <p className="mt-0.5 text-xs text-[#7A9F8A]">Teacher Co-pilot</p>
          </div>
        </div>

        <h2 className="text-xl font-black text-[#163828]">Welcome back</h2>
        <p className="mt-1 mb-7 text-sm text-[#5A7566]">Sign in to your teacher workspace</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">Email address</label>
            <input
              type="email"
              placeholder="you@school.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              className="input"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              className="input"
            />
          </div>

          {error && (
            <div
              className="rounded-xl px-4 py-3 text-sm font-bold text-red-700"
              style={{ background: "rgba(254,226,226,0.8)", border: "1px solid rgba(252,165,165,0.4)" }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="btn-primary w-full justify-center py-3.5 text-base mt-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs text-[#9BB8A5]">
          Contact your administrator to create an account.
        </p>
      </div>
    </div>
  );
}
