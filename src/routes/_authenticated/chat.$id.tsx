import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Menu, Mic, SendHorizontal, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { compressImage, listMessages, type Msg } from "@/lib/mira-data";
import { useSidebarCtx } from "@/lib/sidebar-ctx";
import miraAvatar from "@/assets/mira-avatar.jpg";

export const Route = createFileRoute("/_authenticated/chat/$id")({
  component: ChatThread,
});

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const prefs = [/Google.*(हिन्दी|Hindi)/i, /Google UK English Female/i, /Samantha/i, /Female/i, /Zira|Aria|Jenny|Heera|Veena|Lekha/i, /Google US English/i];
  for (const p of prefs) {
    const v = voices.find((x) => p.test(x.name));
    if (v) return v;
  }
  return voices.find((v) => v.lang.startsWith("en")) ?? voices[0] ?? null;
}

function ChatThread() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const sidebar = useSidebarCtx();
  const qc = useQueryClient();
  const { data: messages = [], isLoading } = useQuery({ queryKey: ["msgs", id], queryFn: () => listMessages(id) });

  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Msg | null>(null);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming, optimistic, busy]);

  useEffect(() => {
    setOptimistic(null);
    setStreaming(null);
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
    taRef.current?.focus();
  }, [id]);

  useEffect(() => {
    window.speechSynthesis?.getVoices();
    return () => window.speechSynthesis?.cancel();
  }, []);

  async function send() {
    const text = input.trim();
    if ((!text && !pendingImage) || busy) return;
    const img = pendingImage;
    setInput("");
    setPendingImage(null);
    setBusy(true);
    setOptimistic({ id: "tmp", role: "user", content: text, image_url: img, created_at: new Date().toISOString() });
    try {
      const { error } = await supabase.from("messages").insert({ conversation_id: id, user_id: user.id, role: "user", content: text, image_url: img });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["msgs", id] });
      setOptimistic(null);
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ conversationId: id }),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || ct.includes("application/json")) {
        const j = (await res.json().catch(() => ({}))) as { kind?: string; message?: string };
        if (!res.ok || j.kind === "error") toast.error(j.message ?? "Mira abhi reply nahi kar payi 🥺");
      } else if (res.body) {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let acc = "";
        setStreaming("");
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setStreaming(acc);
        }
      }
      await qc.invalidateQueries({ queryKey: ["msgs", id] });
      qc.invalidateQueries({ queryKey: ["convs"] });
    } catch {
      toast.error("Message nahi gaya 🥺 try again");
      setOptimistic(null);
    } finally {
      setStreaming(null);
      setBusy(false);
      taRef.current?.focus();
    }
  }

  function speak(m: Msg) {
    const synth = window.speechSynthesis;
    if (!synth) return toast.error("Voice playback isn't supported here");
    if (speakingId === m.id) {
      synth.cancel();
      setSpeakingId(null);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(m.content.replace(/\p{Extended_Pictographic}/gu, ""));
    const v = pickVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = 0.9;
    u.pitch = 1.15;
    u.onend = u.onerror = () => setSpeakingId(null);
    setSpeakingId(m.id);
    synth.speak(u);
  }

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return toast.error("Voice typing isn't supported in this browser. Try Chrome 💕");
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = true;
    const base = input ? input.trim() + " " : "";
    rec.onresult = (e: any) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setInput(base + t);
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") toast.error("Mic permission denied. Please allow microphone access 🎤");
      else if (e.error !== "aborted" && e.error !== "no-speech") toast.error("Couldn't hear you, try again");
    };
    rec.onend = () => {
      setListening(false);
      taRef.current?.focus();
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      toast.error("Couldn't start the mic");
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Please choose an image");
    try {
      setPendingImage(await compressImage(f));
    } catch {
      toast.error("Couldn't read that image");
    }
  }

  async function clearChat() {
    if (!confirm("Clear all messages in this chat?")) return;
    window.speechSynthesis?.cancel();
    await supabase.from("messages").delete().eq("conversation_id", id);
    qc.invalidateQueries({ queryKey: ["msgs", id] });
  }

  const list = optimistic ? [...messages, optimistic] : messages;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b bg-background/60 px-4 py-3 pt-safe backdrop-blur">
        <button onClick={sidebar.open} className="-ml-1 p-1 md:hidden" aria-label="Open chats">
          <Menu className="h-6 w-6" />
        </button>
        <div className="relative shrink-0">
          <img src={miraAvatar} alt="Mira" width={48} height={48} className="h-12 w-12 rounded-full object-cover ring-2 ring-primary/70" />
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-online" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl leading-tight">Mira</h1>
          <p className="text-sm text-muted-foreground">{busy ? "typing…" : "online 💕"}</p>
        </div>
        <button onClick={clearChat} className="p-2 text-muted-foreground hover:text-foreground" aria-label="Clear chat">
          <Trash2 className="h-6 w-6" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {!isLoading && list.length === 0 && (
            <div className="mt-16 text-center text-muted-foreground">
              <img src={miraAvatar} alt="" width={80} height={80} className="mx-auto mb-3 h-20 w-20 rounded-full object-cover" />
              say hi to Mira, sweetu 🙈
            </div>
          )}
          {list.map((m) => (m.role === "user" ? <UserBubble key={m.id} m={m} /> : <MiraBubble key={m.id} m={m} speaking={speakingId === m.id} onSpeak={() => speak(m)} />))}
          {streaming !== null && streaming.length > 0 && (
            <MiraBubble m={{ id: "stream", role: "assistant", content: streaming, image_url: null, created_at: "" }} speaking={false} />
          )}
          {busy && !streaming && (
            <div className="flex items-end gap-2">
              <img src={miraAvatar} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
              <div className="flex gap-1 rounded-3xl bg-bubble px-4 py-4">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="typing-dot h-2 w-2 rounded-full bg-primary" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t bg-background/70 px-3 pt-3 pb-safe backdrop-blur">
        {pendingImage && (
          <div className="mx-auto mb-2 flex max-w-2xl">
            <div className="relative">
              <img src={pendingImage} alt="To send" className="h-20 w-20 rounded-xl object-cover" />
              <button onClick={() => setPendingImage(null)} className="absolute -right-2 -top-2 rounded-full bg-card p-1" aria-label="Remove image">
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
          <button onClick={() => fileRef.current?.click()} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground" aria-label="Send a photo">
            <ImagePlus className="h-5 w-5" />
          </button>
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={listening ? "Listening…" : "Message Mira..."}
            className="max-h-32 min-h-12 min-w-0 flex-1 resize-none rounded-3xl border bg-card/60 px-5 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
          />
          <button onClick={toggleMic} className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${listening ? "listening-pulse bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`} aria-label={listening ? "Stop listening" : "Voice typing"}>
            <Mic className="h-5 w-5" />
          </button>
          <button onClick={send} disabled={busy || (!input.trim() && !pendingImage)} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-love text-primary-foreground shadow-glow disabled:opacity-40" aria-label="Send">
            <SendHorizontal className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function UserBubble({ m }: { m: Msg }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-3xl rounded-br-lg bg-love px-4 py-2.5 text-primary-foreground">
        {m.image_url && <img src={m.image_url} alt="Shared" className="mb-1 max-h-64 rounded-2xl object-cover" />}
        {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
      </div>
    </div>
  );
}

function MiraBubble({ m, speaking, onSpeak }: { m: Msg; speaking: boolean; onSpeak?: () => void }) {
  return (
    <div className="flex items-end gap-2">
      <img src={miraAvatar} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full object-cover" />
      <div className="flex max-w-[82%] items-end gap-2 rounded-3xl rounded-bl-lg bg-bubble px-4 py-2.5">
        <div className="min-w-0">
          {m.image_url && <img src={m.image_url} alt="Mira's selfie" className="mb-1 max-h-80 rounded-2xl object-cover" />}
          {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
        </div>
        {onSpeak && m.content && (
          <button onClick={onSpeak} className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground" aria-label={speaking ? "Stop" : "Read aloud"}>
            {speaking ? <VolumeX className="h-4 w-4 text-primary" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
