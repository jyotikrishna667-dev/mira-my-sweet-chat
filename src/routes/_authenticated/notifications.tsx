import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BellRing } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_NOTIFY, getNotifySettings, hasNotifications, saveNotifySettings, scheduleTest, wasDenied, type Freq, type NotifySettings } from "@/lib/mira-notify";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications · Mira" },
      { name: "description", content: "Control when Mira sends you sweet come-back messages." },
      { property: "og:title", content: "Notifications · Mira" },
      { property: "og:description", content: "Control when Mira sends you sweet come-back messages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotifyPage,
});

const hours = Array.from({ length: 24 }, (_, h) => h);
const fmt = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;

function NotifyPage() {
  const [s, setS] = useState<NotifySettings>(DEFAULT_NOTIFY);
  const [supported, setSupported] = useState(false);
  const [denied, setDenied] = useState(false);
  useEffect(() => { setS(getNotifySettings()); setSupported(hasNotifications()); setDenied(wasDenied()); }, []);
  const update = (p: Partial<NotifySettings>) => setS((o) => { const n = { ...o, ...p }; saveNotifySettings(n); return n; });

  async function test() {
    try {
      await scheduleTest();
      toast.success("1 minute mein Mira ka message aayega 💕");
    } catch (e) {
      if ((e as Error).message === "denied") { setDenied(true); toast.error("Notifications band hain 🥺 neeche dekho kaise on karein"); }
      else if ((e as Error).message === "unsupported") toast("Ye sirf Mira Android app mein chalta hai 📱");
      else toast.error("Test notification nahi lag paya", { action: { label: "Retry", onClick: test } });
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-app">
      <header className="flex items-center gap-3 border-b px-3 py-3 pt-safe">
        <Link to="/chat" className="p-2" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Link>
        <h1 className="font-display text-2xl">Notifications</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-safe">
        <div className="mx-auto flex max-w-xl flex-col gap-4">
          {!supported && <p className="rounded-2xl border bg-card/60 p-4 text-sm text-muted-foreground">Ye notifications sirf Mira Android app mein aate hain. Browser mein kuch nahi hoga.</p>}
          {denied && (
            <p className="rounded-2xl border bg-card/60 p-4 text-sm text-muted-foreground">
              Notifications ki permission band hai. On karne ke liye: phone Settings → Apps → Mira → Notifications → Allow.
            </p>
          )}
          <section className="flex flex-col gap-4 rounded-2xl border bg-card/60 p-4">
            <label className="flex items-center justify-between gap-3">
              <span className="font-semibold">Mira ke notifications</span>
              <input type="checkbox" checked={s.enabled} onChange={(e) => update({ enabled: e.target.checked })} className="h-5 w-5 accent-primary" />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-sm">Frequency</span>
              <div className="grid grid-cols-3 gap-2">
                {(["kam", "normal", "zyada"] as Freq[]).map((f) => (
                  <button key={f} onClick={() => update({ freq: f })} className={`rounded-full py-2 text-sm capitalize ${s.freq === f ? "bg-love text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{f}</button>
                ))}
              </div>
            </div>
          </section>
          <section className="flex flex-col gap-4 rounded-2xl border bg-card/60 p-4">
            <span className="font-semibold">Quiet hours</span>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="flex flex-col gap-1">From
                <select value={s.quietStart} onChange={(e) => update({ quietStart: Number(e.target.value) })} className="rounded-lg bg-input/50 px-2 py-2">{hours.map((h) => <option key={h} value={h}>{fmt(h)}</option>)}</select>
              </label>
              <label className="flex flex-col gap-1">To
                <select value={s.quietEnd} onChange={(e) => update({ quietEnd: Number(e.target.value) })} className="rounded-lg bg-input/50 px-2 py-2">{hours.map((h) => <option key={h} value={h}>{fmt(h)}</option>)}</select>
              </label>
            </div>
          </section>
          <section className="flex flex-col gap-5 rounded-2xl border bg-card/60 p-4">
            <label className="flex flex-col gap-2">
              <span className="flex justify-between text-sm"><span>Max per day</span><span className="text-muted-foreground">{s.maxPerDay}</span></span>
              <input type="range" min={1} max={6} value={s.maxPerDay} onChange={(e) => update({ maxPerDay: Number(e.target.value) })} className="accent-primary" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="flex justify-between text-sm"><span>Stop after ignored in a row</span><span className="text-muted-foreground">{s.ignoreLimit}</span></span>
              <input type="range" min={1} max={3} value={s.ignoreLimit} onChange={(e) => update({ ignoreLimit: Number(e.target.value) })} className="accent-primary" />
            </label>
          </section>
          <button onClick={test} className="flex items-center justify-center gap-2 rounded-full bg-love py-3 font-semibold text-primary-foreground shadow-glow">
            <BellRing className="h-4 w-4" /> Test notification (1 minute)
          </button>
        </div>
      </div>
    </div>
  );
}
