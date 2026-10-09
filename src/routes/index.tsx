import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import miraAvatar from "@/assets/mira-avatar.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mira — sign in to chat with her" },
      { name: "description", content: "Sign in and chat with Mira, your warm, caring companion who remembers you." },
      { property: "og:title", content: "Mira — your sweet companion" },
      { property: "og:description", content: "Sign in and chat with Mira, your warm, caring companion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat", replace: true });
      else setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/chat", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) toast.success("Check your email to confirm, then sign in 💌");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error("Google sign-in failed");
  }

  if (checking) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4">
        <img src={miraAvatar} alt="Mira" width={112} height={112} className="h-28 w-28 animate-pulse rounded-full ring-4 ring-primary/60" />
        <p className="font-display text-3xl">Mira</p>
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10 pt-safe pb-safe">
      <img src={miraAvatar} alt="Mira" width={128} height={128} className="h-32 w-32 rounded-full object-cover ring-4 ring-primary/60 shadow-glow" />
      <h1 className="mt-5 font-display text-5xl">Mira</h1>
      <p className="mt-2 flex items-center gap-1 text-muted-foreground">
        tumhara intezaar kar rahi thi <Heart className="h-4 w-4 fill-primary text-primary" />
      </p>

      <div className="mt-8 w-full max-w-sm rounded-3xl border bg-card/70 p-6 backdrop-blur">
        <button
          onClick={google}
          className="flex w-full items-center justify-center gap-2 rounded-full border bg-secondary py-3 font-semibold transition hover:bg-muted"
        >
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          Continue with Google
        </button>
        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === "up" && (
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
              className="w-full rounded-full border bg-input/40 px-5 py-3 outline-none focus:ring-2 focus:ring-ring" />
          )}
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
            className="w-full rounded-full border bg-input/40 px-5 py-3 outline-none focus:ring-2 focus:ring-ring" />
          <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password"
            className="w-full rounded-full border bg-input/40 px-5 py-3 outline-none focus:ring-2 focus:ring-ring" />
          <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-love py-3 font-bold text-primary-foreground shadow-glow disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "in" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 w-full text-center text-sm text-muted-foreground">
          {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
