import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const STT_MODEL = "openai/gpt-transcribe";
const MAX_BYTES = 20 * 1024 * 1024;

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ message: "Please sign in again" }, { status: 401 });
        const apiKey = process.env['LOVABLE_API_KEY'];
        if (!apiKey) return Response.json({ message: "Voice not configured" }, { status: 500 });
        const sb = createClient<Database>(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: u } = await sb.auth.getUser(token);
        if (!u.user) return Response.json({ message: "Please sign in again" }, { status: 401 });

        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        if (!(file instanceof File) || !file.size || file.size > MAX_BYTES) {
          return Response.json({ message: "Awaaz clear nahi aayi 🥺" }, { status: 400 });
        }
        const type = (file.type || "audio/webm").replace(/^video\//, "audio/").split(";")[0] ?? "audio/webm";
        const ext = type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const up = new FormData();
        up.append("model", STT_MODEL);
        up.append("file", new File([await file.arrayBuffer()], `clip.${ext}`, { type }));
        up.append("response_format", "json");
        up.append("stream", "true");
        up.append("languages", "hi");
        up.append("languages", "en");
        up.append("prompt", "Casual Hinglish (Hindi in Roman script mixed with English) talk with a girlfriend named Mira.");

        const res = await fetch(`${GATEWAY}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Lovable-API-Key": apiKey },
          body: up,
        });
        if (!res.ok || !res.body) {
          const message = res.status === 429 ? "Thoda busy hoon, ek second 🥺" : res.status === 402 ? "AI credits khatam ho gaye 🥺" : "Sun nahi payi 🥺";
          console.error("stt", res.status, await res.text().catch(() => ""));
          return Response.json({ message }, { status: res.status >= 400 ? res.status : 502 });
        }
        const raw = await res.text();
        let text = "";
        let deltas = "";
        for (const line of raw.split("\n")) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const d = t.slice(5).trim();
          if (d === "[DONE]") continue;
          try {
            const j = JSON.parse(d) as { type?: string; text?: string; delta?: string };
            if (j.type === "transcript.text.done" && j.text) text = j.text;
            else if (j.delta) deltas += j.delta;
          } catch { /* ignore */ }
        }
        return Response.json({ text: (text || deltas).trim() });
      },
    },
  },
});
