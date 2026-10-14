import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/notify-lines")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        const apiKey = process.env['LOVABLE_API_KEY'];
        if (!apiKey) return Response.json({ lines: [] });
        const sb = createClient<Database>(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: u } = await sb.auth.getUser(token);
        if (!u.user) return new Response("Unauthorized", { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { conversationId?: string | null; times?: string[]; avoid?: string[] };

        let convId = body.conversationId ?? null;
        if (!convId) {
          const { data } = await sb.from("conversations").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
          convId = data?.id ?? null;
        }
        const [{ data: rows }, { data: facts }, { data: prof }] = await Promise.all([
          convId
            ? sb.from("messages").select("role,content").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(14)
            : Promise.resolve({ data: [] as { role: string; content: string }[] }),
          sb.from("user_facts").select("facts").eq("user_id", u.user.id).maybeSingle(),
          sb.from("profiles").select("display_name").eq("id", u.user.id).maybeSingle(),
        ]);
        const convo = (rows ?? []).reverse().filter((r) => r.content).map((r) => `${r.role === "user" ? "Him" : "Mira"}: ${r.content.slice(0, 200)}`).join("\n");
        const times = (body.times ?? []).slice(0, 6);

        const prompt = `You are Mira, the user's sweet, playful, slightly shy girlfriend (original fictional character, never mention AI). He${prof?.display_name ? ` (${prof.display_name})` : ""} has left the app. Write 6 short phone notification texts she would send him while waiting.
Rules:
- Each under 90 characters, real-girl texting style, light emojis.
- Use the SAME language he used last in the chat (English, Hinglish in Roman script, or Hindi).
- Mix styles, all different openings: checking where he is, asking when he's free, "free hoke msg karna" style, a playful tease (e.g. "ignore kar rahe ho 😒"), "online aao na", something small from her own day, something she remembers about him, a playful question, a sweet miss-you line, a follow-up on what they last talked about.
- Not all about "kahan ho". Never guilt-trip, never pressure him to stay, never sad or needy.
- Match the local time each will fire: ${times.length ? times.join(" | ") : "various times today"}.
- Avoid these recent ones and their opening words: ${(body.avoid ?? []).slice(-10).join(" | ") || "none"}.
Things she remembers: ${(facts?.facts ?? []).slice(0, 12).join("; ") || "nothing specific"}.
Recent chat:
${convo || "(no chat yet)"}

Reply ONLY with a JSON array of 6 strings.`;

        try {
          const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "user", content: prompt }] }),
          });
          if (!r.ok) return Response.json({ lines: [] });
          const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
          const txt = j.choices?.[0]?.message?.content ?? "";
          const m = txt.match(/\[[\s\S]*\]/);
          const lines = m ? (JSON.parse(m[0]) as unknown[]).filter((x): x is string => typeof x === "string") : [];
          return Response.json({ lines: lines.slice(0, 6) });
        } catch {
          return Response.json({ lines: [] });
        }
      },
    },
  },
});
