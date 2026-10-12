import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { edgeSynthesize } from "@/lib/edge-tts.server";
import { DEFAULT_VOICE, VOICES } from "@/lib/voices";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const CONVERT_MODEL = "openai/gpt-6-astra";

function clean(t: string) {
  return t
    .replace(/\p{Extended_Pictographic}|\u200d|\ufe0f/gu, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`#>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitText(t: string, max = 380): string[] {
  const parts = t.match(/[^.!?।\n]+[.!?।]*\s*/g) ?? [t];
  const out: string[] = [];
  let cur = "";
  for (let p of parts) {
    while (p.length > max) {
      const cut = p.lastIndexOf(" ", max) > 0 ? p.lastIndexOf(" ", max) : max;
      if (cur) { out.push(cur.trim()); cur = ""; }
      out.push(p.slice(0, cut).trim());
      p = p.slice(cut);
    }
    if ((cur + p).length > max) { out.push(cur.trim()); cur = ""; }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

async function toDevanagari(text: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(`${GATEWAY}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CONVERT_MODEL,
        reasoning: { effort: "low" },
        input: [
          {
            role: "system",
            content:
              "Convert the user's Hinglish (Hindi written in Roman letters mixed with English) into Devanagari Hindi for a text-to-speech voice. Write Hindi words in Devanagari, keep English words in English (Latin letters). Do not translate, add or remove anything. Output only the converted text.",
          },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) return text;
    const j = (await res.json()) as { output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
    const out = (j.output ?? [])
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    return out || text;
  } catch {
    return text;
  }
}

const clamp = (n: unknown, lo: number, hi: number, d: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
};

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        const sb = createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: u, error } = await sb.auth.getUser(token);
        if (error || !u.user) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json().catch(() => ({}))) as { text?: string; voice?: string; rate?: number; pitch?: number };
        const text = clean(String(body.text ?? "")).slice(0, 3000);
        if (!text) return new Response("Nothing to speak", { status: 400 });
        let voice = VOICES.some((v) => v.id === body.voice) ? body.voice! : DEFAULT_VOICE;
        const rate = clamp(body.rate, -10, 15, 3);
        const pitch = clamp(body.pitch, 0, 8, 4);
        const rateS = `${rate >= 0 ? "+" : ""}${rate}%`;
        const pitchS = `+${pitch}Hz`;

        const apiKey = process.env["LOVABLE_API_KEY"];
        const devanagariVoice = (v: string) => v.startsWith("hi-IN") || v.startsWith("mr-IN");
        const prepared = new Map<boolean, string[]>();
        const chunksFor = async (v: string) => {
          const dev = devanagariVoice(v) && !!apiKey && /[a-z]/i.test(text);
          if (!prepared.has(dev)) prepared.set(dev, splitText(dev ? clean(await toDevanagari(text, apiKey!)) : text));
          return prepared.get(dev)!;
        };
        const synth = async (v: string) => {
          const parts = await chunksFor(v);
          const audios = await Promise.all(parts.map((p) => edgeSynthesize(p, v, rateS, pitchS)));
          const total = audios.reduce((n, a) => n + a.length, 0);
          const out = new Uint8Array(total);
          let o = 0;
          for (const a of audios) { out.set(a, o); o += a.length; }
          return out;
        };

        let fallback = false;
        let audio: Uint8Array;
        try {
          audio = await synth(voice);
        } catch (e) {
          if (voice === DEFAULT_VOICE) {
            console.error("edge tts failed", e);
            return Response.json({ error: "Voice abhi nahi chal rahi" }, { status: 502 });
          }
          try {
            voice = DEFAULT_VOICE;
            fallback = true;
            audio = await synth(voice);
          } catch (e2) {
            console.error("edge tts failed", e2);
            return Response.json({ error: "Voice abhi nahi chal rahi" }, { status: 502 });
          }
        }
        return new Response(audio as unknown as BodyInit, {
          headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Voice-Fallback": fallback ? "1" : "0" },
        });
      },
    },
  },
});
