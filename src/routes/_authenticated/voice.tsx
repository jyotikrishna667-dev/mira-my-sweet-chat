import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_SETTINGS,
  VOICES,
  fetchVoiceAudio,
  getVoiceSettings,
  phoneSpeak,
  phoneVoiceAvailable,
  saveVoiceSettings,
  type VoiceSettings,
} from "@/lib/voices";

export const Route = createFileRoute("/_authenticated/voice")({
  head: () => ({
    meta: [
      { title: "Voice settings · Mira" },
      { name: "description", content: "Choose Mira's voice, speed and pitch for Read aloud." },
      { property: "og:title", content: "Voice settings · Mira" },
      { property: "og:description", content: "Choose Mira's voice, speed and pitch for Read aloud." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VoicePage,
});

const SAMPLE = "Hi sweetu, aaj tumne khana khaya?";

function VoicePage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["voice", user.id], queryFn: () => getVoiceSettings(user.id) });
  const [s, setS] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneOk = phoneVoiceAvailable();

  useEffect(() => { if (data) setS(data); }, [data]);
  useEffect(() => () => stop(), []);

  function update(patch: Partial<VoiceSettings>) {
    const next = { ...s, ...patch };
    setS(next);
    qc.setQueryData(["voice", user.id], next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveVoiceSettings(user.id, next).catch(() => toast.error("Settings save nahi hui 🥺"));
    }, 400);
  }

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setPlaying(null);
    setLoading(null);
  }

  async function preview(id: string) {
    if (playing === id || loading === id) { stop(); return; }
    stop();
    if (id === "phone") {
      if (phoneSpeak(SAMPLE, s, () => setPlaying(null))) setPlaying("phone");
      return;
    }
    setLoading(id);
    try {
      const { url, fallback } = await fetchVoiceAudio("sample", SAMPLE, { ...s, voice: id });
      if (fallback) toast("Yeh voice abhi nahi chali, Swara suna rahi hoon");
      const a = new Audio(url);
      audioRef.current = a;
      a.onended = a.onerror = () => setPlaying(null);
      setLoading(null);
      setPlaying(id);
      await a.play();
    } catch {
      setLoading(null);
      setPlaying(null);
      toast.error("Voice abhi nahi chal rahi", { action: { label: "Retry", onClick: () => preview(id) } });
    }
  }

  const rows = [...VOICES.map((v) => ({ id: v.id, label: v.label })), ...(phoneOk ? [{ id: "phone", label: "Phone ki awaaz" }] : [])];

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b bg-background/60 px-4 py-3 pt-safe backdrop-blur">
        <Link to="/chat" className="-ml-1 p-1" aria-label="Back">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="font-display text-2xl">Voice</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-safe">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <section className="flex flex-col gap-2">
            {rows.map((r) => {
              const selected = r.id === "phone" ? s.use_phone : !s.use_phone && s.voice === r.id;
              return (
                <div key={r.id} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${selected ? "border-primary bg-primary/10" : "bg-card/60"}`}>
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => update(r.id === "phone" ? { use_phone: true } : { voice: r.id, use_phone: false })}
                  >
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : ""}`}>
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{r.label}</span>
                  </button>
                  <button onClick={() => preview(r.id)} className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-sm text-secondary-foreground">
                    {loading === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : playing === r.id ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    Sunke dekho
                  </button>
                </div>
              );
            })}
          </section>

          <section className="flex flex-col gap-5 rounded-2xl border bg-card/60 p-4">
            <label className="flex flex-col gap-2">
              <span className="flex justify-between text-sm"><span>Speed</span><span className="text-muted-foreground">{s.rate >= 0 ? "+" : ""}{s.rate}%</span></span>
              <input type="range" min={-10} max={15} step={1} value={s.rate} onChange={(e) => update({ rate: Number(e.target.value) })} className="accent-primary" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="flex justify-between text-sm"><span>Pitch</span><span className="text-muted-foreground">+{s.pitch} Hz</span></span>
              <input type="range" min={0} max={8} step={1} value={s.pitch} onChange={(e) => update({ pitch: Number(e.target.value) })} className="accent-primary" />
            </label>
          </section>
        </div>
      </div>
    </div>
  );
}
