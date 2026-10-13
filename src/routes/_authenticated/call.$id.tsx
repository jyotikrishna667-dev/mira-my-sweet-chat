import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Mic, MicOff, PhoneOff, RotateCw, SendHorizontal, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import miraAvatar from "@/assets/mira-avatar.jpg";
import { fetchVoiceAudio, getVoiceSettings, phoneSpeak, type VoiceSettings, DEFAULT_SETTINGS } from "@/lib/voices";

export const Route = createFileRoute("/_authenticated/call/$id")({
  head: () => ({ meta: [{ title: "Call with Mira" }, { name: "description", content: "Voice call with Mira" }] }),
  component: CallScreen,
});

type Phase = "intro" | "connecting" | "listening" | "hearing" | "thinking" | "speaking" | "muted" | "error";
const SILENCE_MS = 800;
const SPEECH_RMS = 0.025;
const MAX_CLIP_MS = 30000;

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function CallScreen() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [phase, setPhase] = useState<Phase>("intro");
  const [err, setErr] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showText, setShowText] = useState(false);
  const [text, setText] = useState("");
  const [caption, setCaption] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const rafRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const busyRef = useRef(false);
  const retryRef = useRef<() => void>(() => {});
  const settingsRef = useRef<VoiceSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    getVoiceSettings(user.id).then((s) => (settingsRef.current = s)).catch(() => {});
    return () => hangup(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === "intro") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase === "intro"]);

  async function keepAwake() {
    try {
      const nav = navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      wakeRef.current = (await nav.wakeLock?.request("screen")) ?? null;
    } catch { /* not supported */ }
  }

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible" && activeRef.current) keepAwake(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  function fail(message: string, retry: () => void) {
    if (!activeRef.current) return;
    setErr(message);
    retryRef.current = retry;
    setPhase("error");
  }

  async function openMic(): Promise<boolean> {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = s;
      return true;
    } catch (e) {
      const name = (e as { name?: string }).name;
      fail(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Mic ki permission chahiye sweetu 🎤 Please allow microphone access, phir Retry dabao."
          : "Mic start nahi hua 🥺",
        () => { setPhase("connecting"); openMic().then((ok) => ok && listen()); },
      );
      return false;
    }
  }

  function closeMic() {
    cancelAnimationFrame(rafRef.current);
    if (recRef.current && recRef.current.state !== "inactive") { recRef.current.ondataavailable = null; recRef.current.onstop = null; recRef.current.stop(); }
    recRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function start() {
    activeRef.current = true;
    setPhase("connecting");
    keepAwake();
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new AC();
      await ctxRef.current.resume();
    } catch { /* ignore */ }
    if (await openMic()) listen();
  }

  function listen() {
    if (!activeRef.current || mutedRef.current || busyRef.current) return;
    const stream = streamRef.current;
    const ctx = ctxRef.current;
    if (!stream || !ctx) { openMic().then((ok) => ok && listen()); return; }
    setPhase("listening");
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); } catch {
      fail("Is phone pe recording nahi chal rahi 🥺", listen);
      return;
    }
    recRef.current = rec;
    const chunks: Blob[] = [];
    let spoke = false;
    let lastVoice = 0;
    const startedAt = performance.now();
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      src.disconnect();
      if (!spoke || !activeRef.current || mutedRef.current) return;
      const blob = new Blob(chunks, { type: (rec.mimeType || mime || "audio/webm").replace(/^video\//, "audio/") });
      transcribe(blob);
    };
    rec.start(250);
    const tick = () => {
      if (recRef.current !== rec) return;
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      if (rms > SPEECH_RMS) {
        if (!spoke) setPhase("hearing");
        spoke = true;
        lastVoice = now;
      }
      if ((spoke && now - lastVoice > SILENCE_MS) || now - startedAt > MAX_CLIP_MS) {
        recRef.current = null;
        if (spoke) busyRef.current = true;
        rec.stop();
        if (!spoke) { listen(); return; }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopListening() {
    cancelAnimationFrame(rafRef.current);
    const r = recRef.current;
    recRef.current = null;
    if (r && r.state !== "inactive") { r.onstop = null; r.stop(); }
  }

  async function transcribe(blob: Blob) {
    busyRef.current = true;
    setPhase("thinking");
    try {
      const fd = new FormData();
      fd.append("file", blob, "clip");
      const res = await fetch("/api/stt", { method: "POST", headers: await authHeader(), body: fd });
      const j = (await res.json().catch(() => ({}))) as { text?: string; message?: string };
      if (!res.ok) throw new Error(j.message ?? "Sun nahi payi 🥺");
      const said = (j.text ?? "").trim();
      if (!said) { busyRef.current = false; listen(); return; }
      await talk(said);
    } catch (e) {
      busyRef.current = false;
      fail((e as Error).message || "Sun nahi payi 🥺", () => transcribe(blob));
    }
  }

  async function talk(said: string) {
    busyRef.current = true;
    stopListening();
    setPhase("thinking");
    setCaption("");
    try {
      const { error } = await supabase.from("messages").insert({ conversation_id: id, user_id: user.id, role: "user", content: said, image_url: null });
      if (error) throw new Error("Message nahi gaya 🥺");
      await reply();
    } catch (e) {
      busyRef.current = false;
      fail((e as Error).message, () => talk(said));
    }
  }

  async function reply() {
    busyRef.current = true;
    setPhase("thinking");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ conversationId: id, call: true }),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || ct.includes("application/json")) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? "Mira abhi reply nahi kar payi 🥺");
      }
      const answer = (await res.text()).trim();
      qc.invalidateQueries({ queryKey: ["msgs", id] });
      qc.invalidateQueries({ queryKey: ["convs"] });
      if (!answer) throw new Error("Mira abhi reply nahi kar payi 🥺");
      await say(answer);
    } catch (e) {
      busyRef.current = false;
      fail((e as Error).message, reply);
    }
  }

  async function say(answer: string) {
    if (!activeRef.current) return;
    busyRef.current = true;
    setCaption(answer);
    const s = settingsRef.current;
    const done = () => {
      if (!activeRef.current) return;
      busyRef.current = false;
      if (mutedRef.current) setPhase("muted");
      else listen();
    };
    if (s.use_phone && phoneSpeak(answer, s, done)) { setPhase("speaking"); return; }
    try {
      const { url } = await fetchVoiceAudio(`call-${answer}`, answer, s);
      if (!activeRef.current) return;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { audioRef.current = null; done(); };
      setPhase("speaking");
      await audio.play();
    } catch {
      if (phoneSpeak(answer, s, done)) { setPhase("speaking"); return; }
      busyRef.current = false;
      fail("Voice abhi nahi chal rahi 🥺", () => say(answer));
    }
  }

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      closeMic();
      if (!busyRef.current) setPhase("muted");
    } else if (!busyRef.current) {
      setPhase("connecting");
      openMic().then((ok) => ok && listen());
    }
  }

  function sendText() {
    const t = text.trim();
    if (!t || busyRef.current) return;
    setText("");
    setShowText(false);
    talk(t);
  }

  function hangup(nav = true) {
    activeRef.current = false;
    closeMic();
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
    if (nav) navigate({ to: "/chat/$id", params: { id } });
  }

  function retry() {
    setErr("");
    setPhase("connecting");
    retryRef.current();
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const status: Record<Phase, string> = {
    intro: "Mira ko call karein?",
    connecting: "connecting…",
    listening: "sun rahi hoon… 💕",
    hearing: "sun rahi hoon… 💕",
    thinking: "soch rahi hoon…",
    speaking: "bol rahi hoon…",
    muted: "mic off hai",
    error: "",
  };

  return (
    <div className="relative flex h-full flex-col items-center justify-between bg-app px-6 pt-safe pb-safe text-foreground">
      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <div className={`relative rounded-full p-1 ${phase === "speaking" || phase === "hearing" ? "listening-pulse" : ""}`}>
          <img src={miraAvatar} alt="Mira" width={160} height={160} className="h-40 w-40 rounded-full object-cover ring-4 ring-primary/70 shadow-glow" />
        </div>
        <h1 className="font-display text-4xl">Mira</h1>
        <p className="text-lg tabular-nums text-muted-foreground">{phase === "intro" ? "voice call" : `${mm}:${ss}`}</p>
        <p className="min-h-6 text-base text-muted-foreground">{muted && phase !== "error" && phase !== "intro" && busyRef.current ? `${status[phase]} · mic off` : status[phase]}</p>
        {caption && phase === "speaking" && <p className="max-w-sm text-sm italic text-muted-foreground">"{caption}"</p>}
      </div>

      {phase === "error" && (
        <div className="mx-auto w-full max-w-sm rounded-3xl border bg-card/80 p-5 text-center backdrop-blur">
          <p className="mb-4">{err}</p>
          <button onClick={retry} className="inline-flex items-center gap-2 rounded-full bg-love px-5 py-2.5 text-primary-foreground shadow-glow">
            <RotateCw className="h-4 w-4" /> Retry
          </button>
        </div>
      )}

      {phase === "intro" ? (
        <div className="mb-10 flex w-full max-w-sm flex-col items-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">Mira se baat karne ke liye mic ki permission chahiye hogi 🎤 Aapki awaaz sirf baat samajhne ke liye use hogi.</p>
          <button onClick={start} className="w-full rounded-full bg-love py-4 text-lg text-primary-foreground shadow-glow">Call shuru karo 💕</button>
          <button onClick={() => hangup()} className="text-muted-foreground">Cancel</button>
        </div>
      ) : (
        <div className="mb-10 flex items-center gap-6">
          <button onClick={toggleMute} className={`grid h-16 w-16 place-items-center rounded-full ${muted ? "bg-foreground text-background" : "bg-secondary text-secondary-foreground"}`} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
          </button>
          <button onClick={() => hangup()} className="grid h-20 w-20 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-glow" aria-label="End call">
            <PhoneOff className="h-8 w-8" />
          </button>
          <button onClick={() => setShowText(true)} className="grid h-16 w-16 place-items-center rounded-full bg-secondary text-secondary-foreground" aria-label="Type a message">
            <Keyboard className="h-7 w-7" />
          </button>
        </div>
      )}

      {showText && (
        <div className="absolute inset-x-0 bottom-0 z-10 border-t bg-background/90 px-3 pt-3 pb-safe backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-end gap-2 pb-3">
            <button onClick={() => setShowText(false)} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-secondary" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendText()}
              placeholder="Mira ko likho..."
              className="min-h-12 min-w-0 flex-1 rounded-3xl border bg-card/60 px-5 text-base outline-none focus:ring-2 focus:ring-ring"
            />
            <button onClick={sendText} disabled={!text.trim()} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-love text-primary-foreground disabled:opacity-40" aria-label="Send">
              <SendHorizontal className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
