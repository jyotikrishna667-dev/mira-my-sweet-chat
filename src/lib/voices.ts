import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_VOICE = "hi-IN-SwaraNeural";
export const VOICES = [
  { id: "hi-IN-SwaraNeural", label: "Swara (Hindi, default)" },
  { id: "en-IN-NeerjaNeural", label: "Neerja (Indian English)" },
  { id: "en-IN-NeerjaExpressiveNeural", label: "Neerja Expressive (Indian English)" },
  { id: "mr-IN-AarohiNeural", label: "Aarohi (Marathi)" },
  { id: "bn-IN-TanishaaNeural", label: "Tanishaa (Bengali)" },
  { id: "gu-IN-DhwaniNeural", label: "Dhwani (Gujarati)" },
  { id: "ta-IN-PallaviNeural", label: "Pallavi (Tamil)" },
  { id: "te-IN-ShrutiNeural", label: "Shruti (Telugu)" },
  { id: "kn-IN-SapnaNeural", label: "Sapna (Kannada)" },
  { id: "ml-IN-SobhanaNeural", label: "Sobhana (Malayalam)" },
  { id: "ur-IN-GulNeural", label: "Gul (Urdu)" },
];

export type VoiceSettings = { voice: string; rate: number; pitch: number; use_phone: boolean };
export const DEFAULT_SETTINGS: VoiceSettings = { voice: DEFAULT_VOICE, rate: 3, pitch: 4, use_phone: false };

export async function getVoiceSettings(userId: string): Promise<VoiceSettings> {
  const { data } = await supabase.from("voice_settings").select("voice,rate,pitch,use_phone").eq("user_id", userId).maybeSingle();
  return data ?? DEFAULT_SETTINGS;
}

export async function saveVoiceSettings(userId: string, s: VoiceSettings) {
  const { error } = await supabase.from("voice_settings").upsert({ user_id: userId, ...s, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export function stripForSpeech(t: string) {
  return t.replace(/\p{Extended_Pictographic}|\u200d|\ufe0f/gu, "").replace(/[*_~`#>|]+/g, "").replace(/\s+/g, " ").trim();
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const prefs = [/Google.*(हिन्दी|Hindi)/i, /Google UK English Female/i, /Samantha/i, /Female/i, /Zira|Aria|Jenny|Heera|Veena|Lekha/i, /Google US English/i];
  for (const p of prefs) {
    const v = voices.find((x) => p.test(x.name));
    if (v) return v;
  }
  return voices.find((v) => v.lang.startsWith("en")) ?? voices[0] ?? null;
}

export const phoneVoiceAvailable = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/** Speaks with the device voice. Returns false if unavailable. */
export function phoneSpeak(text: string, s: Pick<VoiceSettings, "rate" | "pitch">, onEnd: () => void): boolean {
  if (!phoneVoiceAvailable()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(stripForSpeech(text));
  const v = pickVoice();
  if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = 0.9 * (1 + s.rate / 100);
  u.pitch = 1.1 + s.pitch / 40;
  u.onend = u.onerror = onEnd;
  synth.speak(u);
  return true;
}

const cache = new Map<string, { url: string; fallback: boolean }>();

/** Fetches (cached) Edge neural audio as an object URL. */
export async function fetchVoiceAudio(cacheKey: string, text: string, s: VoiceSettings) {
  const key = `${cacheKey}|${s.voice}|${s.rate}|${s.pitch}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ text, voice: s.voice, rate: s.rate, pitch: s.pitch }),
  });
  if (!res.ok) throw new Error("tts failed");
  const blob = await res.blob();
  if (!blob.size) throw new Error("empty audio");
  const val = { url: URL.createObjectURL(blob), fallback: res.headers.get("X-Voice-Fallback") === "1" };
  cache.set(key, val);
  return val;
}
