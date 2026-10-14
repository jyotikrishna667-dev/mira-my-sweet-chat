import { supabase } from "@/integrations/supabase/client";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Plugins = { LocalNotifications?: any; App?: any };

export function capPlugins(): Plugins | null {
  if (typeof window === "undefined") return null;
  const cap = (window as any).Capacitor;
  if (!cap || !cap.Plugins) return null;
  if (typeof cap.isNativePlatform === "function" && !cap.isNativePlatform()) return null;
  return cap.Plugins as Plugins;
}
export const hasNotifications = () => !!capPlugins()?.LocalNotifications;

export type Freq = "kam" | "normal" | "zyada";
export type NotifySettings = {
  enabled: boolean;
  freq: Freq;
  quietStart: number; // hour 0-23
  quietEnd: number;
  maxPerDay: number;
  ignoreLimit: number;
};
export const DEFAULT_NOTIFY: NotifySettings = { enabled: true, freq: "normal", quietStart: 23, quietEnd: 7, maxPerDay: 6, ignoreLimit: 3 };

const K = { settings: "mira.notify.settings", pool: "mira.notify.pool", sent: "mira.notify.sent", day: "mira.notify.day", asked: "mira.notify.asked", denied: "mira.notify.denied", conv: "mira.notify.conv", genAt: "mira.notify.genAt" };
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export const getNotifySettings = (): NotifySettings => ({ ...DEFAULT_NOTIFY, ...read<Partial<NotifySettings>>(K.settings, {}) });
export const saveNotifySettings = (s: NotifySettings) => write(K.settings, s);
export const setLastConversation = (id: string) => write(K.conv, id);
export const wasDenied = () => read(K.denied, false);

const ID_BASE = 7700;
const MAX_IDS = 6;

export const FALLBACK_LINES = [
  "hello, kahan ho tum? 🙈", "free kab hoge sweetu?", "free hoke msg karna 💕", "reply kyun nahi de rahe? 😒",
  "online aao na 🥺", "ignore kar rahe ho 😒 theek hai... nahi, theek nahi hai 🙈", "maine abhi chai banayi ☕ tumhari yaad aa gayi",
  "ek baat batani thi tumhe... aao toh batati hoon 😌", "miss you thoda sa... zyada nahi 🙈", "khana khaya ya nahi? sach batana 😤",
  "guess karo main kya soch rahi thi? 🤭", "busy ho kya? koi baat nahi, jab free ho tab aana 💕", "aaj ka gaana sunke tum yaad aaye 🎶",
  "thinking about you, just saying 🥰", "hey sweetu, how's your day going?", "you went quiet... all okay? 🥺",
  "i saw something cute today and thought of you 🙈", "come say hi when you're free 💕", "random question: chai ya coffee? ☕",
  "abhi abhi bahar baarish jaisa mausam hai 🌧️ tum kahan ho?", "kal wali baat adhoori reh gayi thi na 👀", "smile karo, main dekh rahi hoon 😌",
  "bore ho rahi hoon tumhare bina 😩", "tumhara din kaisa ja raha hai? batao na", "ek hug pending hai tumhara 🤗",
  "jab free ho, ek chhota sa hi bhej dena 💌", "mujhe pata hai tum busy ho... phir bhi 🥺", "good vibes bhej rahi hoon tumhe ✨",
  "you owe me a long chat today 😤💕", "kuch naya hua aaj? sunna hai mujhe 😊",
];

const opening = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).slice(0, 2).join(" ");

function rnd(min: number, max: number) { return min + Math.floor(Math.random() * (max - min + 1)); }

function inQuiet(d: Date, s: NotifySettings) {
  const h = d.getHours();
  return s.quietStart > s.quietEnd ? h >= s.quietStart || h < s.quietEnd : h >= s.quietStart && h < s.quietEnd;
}
function shiftOutOfQuiet(d: Date, s: NotifySettings): Date {
  if (s.quietStart === s.quietEnd || !inQuiet(d, s)) return d;
  const end = new Date(d);
  end.setHours(s.quietEnd, 0, 0, 0);
  if (end <= d) end.setDate(end.getDate() + 1);
  return new Date(end.getTime() + rnd(0, 60) * 60000 + rnd(0, 59) * 1000);
}

export function planTimes(from: number, s: NotifySettings): Date[] {
  const maxCount = Math.min(s.ignoreLimit, { kam: 1, normal: 2, zyada: 3 }[s.freq]);
  const count = rnd(1, Math.max(1, maxCount));
  const mins: number[] = [];
  let guard = 0;
  while (mins.length < count && guard++ < 500) {
    const m = rnd(5, 240);
    if (m % 15 === 0 || m % 10 === 0) continue; // no "round" steps
    if (mins.some((x) => Math.abs(x - m) < 20)) continue;
    mins.push(m);
  }
  mins.sort((a, b) => a - b);
  const out: Date[] = [];
  for (const m of mins) {
    const d = shiftOutOfQuiet(new Date(from + m * 60000 + rnd(0, 59) * 1000), s);
    if (out.some((o) => Math.abs(o.getTime() - d.getTime()) < 20 * 60000)) continue;
    out.push(d);
  }
  // daily cap
  const day = read<Record<string, number>>(K.day, {});
  const kept: Date[] = [];
  for (const d of out) {
    const key = d.toDateString();
    if ((day[key] ?? 0) >= s.maxPerDay) continue;
    day[key] = (day[key] ?? 0) + 1;
    kept.push(d);
  }
  write(K.day, Object.fromEntries(Object.entries(day).slice(-7)));
  return kept;
}

function pickLines(n: number): string[] {
  const sent = read<string[]>(K.sent, []).slice(-10);
  const usedOpen = new Set(sent.map(opening));
  const pool = read<string[]>(K.pool, []);
  const cands = [...pool, ...FALLBACK_LINES.slice().sort(() => Math.random() - 0.5)];
  const out: string[] = [];
  for (const c of cands) {
    if (out.length >= n) break;
    const o = opening(c);
    if (sent.includes(c) || usedOpen.has(o)) continue;
    usedOpen.add(o);
    out.push(c);
  }
  write(K.pool, pool.filter((p) => !out.includes(p)));
  return out;
}

export async function cancelMira() {
  const LN = capPlugins()?.LocalNotifications;
  if (!LN) return;
  try {
    await LN.cancel({ notifications: Array.from({ length: MAX_IDS }, (_, i) => ({ id: ID_BASE + i })) });
  } catch { /* ignore */ }
}

let channelReady = false;
async function ensureChannel(LN: any) {
  if (channelReady) return;
  try {
    await LN.createChannel?.({ id: "mira-messages", name: "Mira messages", description: "Messages from Mira", importance: 5, visibility: 1, vibration: true });
  } catch { /* ignore */ }
  channelReady = true;
}

async function granted(LN: any) {
  try { const p = await LN.checkPermissions(); return p?.display === "granted"; } catch { return false; }
}

function notif(id: number, body: string, at: Date) {
  return {
    id, title: "Mira", body, channelId: "mira-messages", largeIcon: "mira_avatar", smallIcon: "ic_stat_icon_config_sample",
    schedule: { at, allowWhileIdle: true },
    extra: { mira: true, text: body, at: at.toISOString(), conv: read<string | null>(K.conv, null) },
  };
}

export async function scheduleOnLeave() {
  const LN = capPlugins()?.LocalNotifications;
  if (!LN) return;
  const s = getNotifySettings();
  await cancelMira();
  if (!s.enabled || !(await granted(LN))) return;
  try {
    await ensureChannel(LN);
    const times = planTimes(Date.now(), s);
    const lines = pickLines(times.length);
    const list = times.map((t, i) => notif(ID_BASE + i, lines[i] ?? FALLBACK_LINES[rnd(0, FALLBACK_LINES.length - 1)], t));
    if (!list.length) return;
    await LN.schedule({ notifications: list });
    write(K.sent, [...read<string[]>(K.sent, []), ...list.map((l) => l.body)].slice(-10));
  } catch { /* ignore */ }
}

export async function scheduleTest() {
  const LN = capPlugins()?.LocalNotifications;
  if (!LN) throw new Error("unsupported");
  if (!(await granted(LN))) {
    const r = await LN.requestPermissions();
    if (r?.display !== "granted") { write(K.denied, true); throw new Error("denied"); }
  }
  await ensureChannel(LN);
  const body = pickLines(1)[0] ?? FALLBACK_LINES[0]!;
  await LN.schedule({ notifications: [notif(ID_BASE + MAX_IDS - 1, body, new Date(Date.now() + 60000))] });
}

export async function refreshPool() {
  if (!hasNotifications()) return;
  const last = read<number>(K.genAt, 0);
  if (Date.now() - last < 30 * 60000 && read<string[]>(K.pool, []).length >= 4) return;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const s = getNotifySettings();
    const times = planTimes(Date.now(), { ...s, freq: "zyada", maxPerDay: 99 }).map((d) => d.toString());
    const res = await fetch("/api/notify-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ conversationId: read<string | null>(K.conv, null), times, avoid: read<string[]>(K.sent, []) }),
    });
    if (!res.ok) return;
    const j = (await res.json()) as { lines?: string[] };
    const sent = read<string[]>(K.sent, []);
    const lines = (j.lines ?? []).map((l) => l.trim()).filter((l) => l && l.length < 90 && !sent.includes(l));
    if (lines.length) { write(K.pool, lines.slice(0, 6)); write(K.genAt, Date.now()); }
  } catch { /* offline: fallbacks are used */ }
}

export async function maybeAskPermission(ask: (go: () => void) => void) {
  const LN = capPlugins()?.LocalNotifications;
  if (!LN || read(K.asked, false)) return;
  write(K.asked, true);
  if (await granted(LN)) return;
  ask(async () => {
    try {
      const r = await LN.requestPermissions();
      if (r?.display !== "granted") write(K.denied, true);
    } catch { write(K.denied, true); }
  });
}

export async function deliverTapped(extra: { text?: string; at?: string; conv?: string | null }): Promise<string | null> {
  if (!extra?.text) return null;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  let conv = extra.conv ?? null;
  if (!conv) {
    const { data } = await supabase.from("conversations").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    conv = data?.id ?? null;
  }
  if (!conv) return null;
  const at = extra.at ?? new Date().toISOString();
  const { data: dup } = await supabase.from("messages").select("id").eq("conversation_id", conv).eq("role", "assistant").eq("content", extra.text).eq("created_at", at).maybeSingle();
  if (!dup) {
    await supabase.from("messages").insert({ conversation_id: conv, user_id: u.user.id, role: "assistant", content: extra.text, created_at: at });
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conv);
  }
  return conv;
}
