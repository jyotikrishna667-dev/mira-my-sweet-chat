import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Bell, Menu, Mic, Phone, Settings2, SendHorizontal, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { compressImage, listMessages, type Msg } from "@/lib/mira-data";
import { useSidebarCtx } from "@/lib/sidebar-ctx";
import miraAvatar from "@/assets/mira-avatar.jpg";
import { ChatImage } from "@/components/ChatImage";
import { DEFAULT_SETTINGS, fetchVoiceAudio, getVoiceSettings, phoneSpeak } from "@/lib/voices";
import { useLongPress } from "@/hooks/use-long-press";
import { MessageMenu } from "@/components/MessageMenu";
import { maybeAskPermission, setLastConversation } from "@/lib/mira-notify";

export const Route = createFileRoute("/_authenticated/chat/$id")({
  component: ChatThread,
});

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
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { data: voiceSettings = DEFAULT_SETTINGS } = useQuery({ queryKey: ["voice", user.id], queryFn: () => getVoiceSettings(user.id) });
  const [listening, setListening] = useState(false);
  const [menu, setMenu] = useState<{ m: Msg; rect: DOMRect } | null>(null);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
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
    stopAudio();
    taRef.current?.focus();
  }, [id]);

  useEffect(() => {
    window.speechSynthesis?.getVoices();
    return () => stopAudio();
  }, []);
  useEffect(() => { setLastConversation(id); }, [id]);

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
      void maybeAskPermission((go) =>
        toast("Mira tumhe kabhi kabhi message bhejna chahti hai 💌 notifications on karein?", {
          duration: 12000,
          action: { label: "Haan", onClick: go },
        }),
      );
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

  function stopAudio() {
    window.speechSynthesis?.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeakingId(null);
    setLoadingId(null);
  }

  async function speak(m: Msg) {
    if (speakingId === m.id || loadingId === m.id) {
      stopAudio();
      return;
    }
    stopAudio();
    const s = voiceSettings;
    const done = () => setSpeakingId((cur) => (cur === m.id ? null : cur));
    if (s.use_phone && phoneSpeak(m.content, s, done)) {
      setSpeakingId(m.id);
      return;
    }
    setLoadingId(m.id);
    try {
      const { url, fallback } = await fetchVoiceAudio(m.id, m.content, s);
      if (fallback) toast("Chuni hui voice nahi chali, Swara se sun lo 💕");
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = audio.onerror = () => {
        if (audioRef.current === audio) audioRef.current = null;
        done();
      };
      setLoadingId((cur) => (cur === m.id ? null : cur));
      setSpeakingId(m.id);
      await audio.play();
    } catch {
      setLoadingId(null);
      setSpeakingId(null);
      if (phoneSpeak(m.content, s, done)) {
        setSpeakingId(m.id);
        return;
      }
      toast.error("Voice abhi nahi chal rahi", { action: { label: "Retry", onClick: () => speak(m) } });
    }
  }

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { toast.error("Voice typing isn't supported in this browser. Try Chrome 💕"); return; }
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
    if (!f.type.startsWith("image/")) { toast.error("Please choose an image"); return; }
    try {
      setPendingImage(await compressImage(f));
    } catch {
      toast.error("Couldn't read that image");
    }
  }

  async function clearChat() {
    if (!confirm("Clear all messages in this chat?")) return;
    stopAudio();
    await supabase.from("messages").delete().eq("conversation_id", id);
    qc.invalidateQueries({ queryKey: ["msgs", id] });
  }

  async function copyMsg(m: Msg) {
    setMenu(null);
    try {
      await navigator.clipboard.writeText(m.content || m.image_url || "");
      toast("Copied 💕");
    } catch {
      toast.error("Copy nahi hua", { action: { label: "Retry", onClick: () => copyMsg(m) } });
    }
  }

  async function unsend(m: Msg) {
    setMenu(null);
    if (speakingId === m.id || loadingId === m.id) stopAudio();
    setRemoving((s) => new Set(s).add(m.id));
    await new Promise((r) => setTimeout(r, 300));
    const { error } = await supabase.from("messages").delete().eq("id", m.id);
    if (!error) qc.setQueryData<Msg[]>(["msgs", id], (old) => (old ?? []).filter((x) => x.id !== m.id));
    setRemoving((s) => { const n = new Set(s); n.delete(m.id); return n; });
    if (error) toast.error("Unsend nahi hua 🥺", { action: { label: "Retry", onClick: () => unsend(m) } });
    else qc.invalidateQueries({ queryKey: ["msgs", id] });
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
        <Link to="/call/$id" params={{ id }} className="p-2 text-muted-foreground hover:text-foreground" aria-label="Call Mira">
          <Phone className="h-6 w-6" />
        </Link>
        <Link to="/notifications" className="p-2 text-muted-foreground hover:text-foreground" aria-label="Notification settings">
          <Bell className="h-6 w-6" />
        </Link>
        <Link to="/voice" className="p-2 text-muted-foreground hover:text-foreground" aria-label="Voice settings">
          <Settings2 className="h-6 w-6" />
        </Link>
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
          {list.map((m) => {
            const mp = m.id === "tmp" ? {} : { lifted: menu?.m.id === m.id, removing: removing.has(m.id), onLong: (el: HTMLElement) => setMenu({ m, rect: el.getBoundingClientRect() }) };
            return m.role === "user" ? <UserBubble key={m.id} m={m} {...mp} /> : <MiraBubble key={m.id} m={m} speaking={speakingId === m.id} loading={loadingId === m.id} onSpeak={() => speak(m)} {...mp} />;
          })}
          {menu && (
            <MessageMenu rect={menu.rect} mine={menu.m.role === "user"} onClose={() => setMenu(null)} onCopy={() => copyMsg(menu.m)} onUnsend={() => unsend(menu.m)} />
          )}
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

type MenuProps = { lifted?: boolean; removing?: boolean; onLong?: (el: HTMLElement) => void };

function Wrap({ lifted, removing, onLong, className, children }: MenuProps & { className: string; children: React.ReactNode }) {
  const lp = useLongPress((el) => onLong?.(el));
  return (
    <div
      {...(onLong ? lp : {})}
      style={{ WebkitTouchCallout: "none" }}
      className={`${className} select-none transition-all duration-300 ${lifted ? "relative z-50 scale-[1.03]" : ""} ${removing ? "scale-95 opacity-0" : ""}`}
    >
      {children}
    </div>
  );
}

function UserBubble({ m, ...p }: { m: Msg } & MenuProps) {
  return (
    <div className="flex justify-end">
      <Wrap {...p} className="max-w-[80%] rounded-3xl rounded-br-lg bg-love px-4 py-2.5 text-primary-foreground">
        {m.image_url && <ChatImage src={m.image_url} alt="Shared" className="max-h-64 rounded-2xl object-cover" />}
        {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
      </Wrap>
    </div>
  );
}

function MiraBubble({ m, speaking, loading, onSpeak, ...p }: { m: Msg; speaking: boolean; loading?: boolean; onSpeak?: () => void } & MenuProps) {
  return (
    <div className={`flex items-end gap-2 transition-opacity duration-300 ${p.removing ? "opacity-0" : ""}`}>
      <img src={miraAvatar} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full object-cover" />
      <Wrap {...p} className="flex max-w-[82%] items-end gap-2 rounded-3xl rounded-bl-lg bg-bubble px-4 py-2.5">
        <div className="min-w-0">
          {m.image_url && <ChatImage src={m.image_url} alt="Mira's selfie" className="max-h-80 rounded-2xl object-cover" />}
          {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
        </div>
        {onSpeak && m.content && (
          <button onClick={onSpeak} className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground" aria-label={loading || speaking ? "Stop" : "Read aloud"}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : speaking ? <VolumeX className="h-4 w-4 text-primary" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}
      </Wrap>
    </div>
  );
}
