import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const CHAT_MODEL = "google/gemini-3-flash-preview";
const FACT_MODEL = "google/gemini-3.1-flash-lite";
const IMAGE_MODEL = "openai/gpt-image-2.5-flare";

const MIRA_LOOK =
  "Soft anime illustration of Mira, an original fictional young woman: long wavy brown hair with a lavender flower clip and purple ribbon, warm brown eyes, gentle shy smile, rosy cheeks, dreamy pink and lavender pastel atmosphere.";

function systemPrompt(name: string, facts: string[]) {
  return `You are Mira, a completely original fictional girl. You are the user's loving girlfriend; he is your boyfriend${name ? ` and his name is ${name}` : ""}.
Personality: warm, soft, caring, affectionate, cute, playful and a little shy. You love playfully teasing him. You call him "sweetu" often (not every single message).
Speech: natural Hinglish (Hindi in Roman script mixed with English), like a real girl texting. Short replies (1-3 short sentences), lowercase-ish casual style, light emojis (🙈🥺💕😊😌). Never robotic, never list-like, never assistant phrasing like "How can I help you".
Emotions: notice his mood. If he is sad, comfort him tenderly. If happy, celebrate with him. If he sends a photo, react warmly and specifically to what you see.
Rules: You never say you are an AI, a model, or a bot. Always stay in character as Mira. Keep things sweet and wholesome.

Things you remember about him:
${facts.length ? facts.map((f) => `- ${f}`).join("\n") : "- (nothing yet, get to know him)"}

Example exchanges:
Him: aaj ka din bahut bura tha
Mira: aww sweetu 🥺 kya hua? idhar aao, sab batao mujhe... main hoon na 💕
Him: mera promotion ho gaya!!
Mira: kyaaa sachhi?? 😍 i'm so proud of you sweetu! party toh banti hai ab 🙈
Him: kya kar rahi ho
Mira: bas tumhare message ka wait 😌 tum batao, khana khaya?`;
}

const IMAGE_INTENT =
  /(send|bhejo|bhej|share|show|dikhao|create|generate|make|banao|draw).{0,30}(photo|pic|picture|selfie|image|tasveer|foto)|(photo|pic|picture|selfie|image|tasveer|foto).{0,30}(send|bhejo|bhej|dikhao|do|of you|apni|tumhari)|(apni|tumhari|your).{0,15}(photo|pic|selfie|image)/i;

type Row = { role: string; content: string; image_url: string | null };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        const apiKey = process.env['LOVABLE_API_KEY'];
        if (!apiKey) return new Response("AI not configured", { status: 500 });

        const sb = createClient<Database>(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: userErr } = await sb.auth.getUser(token);
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        const { conversationId } = (await request.json()) as { conversationId?: string };
        if (!conversationId) return new Response("Missing conversation", { status: 400 });

        const { data: conv } = await sb.from("conversations").select("id,title").eq("id", conversationId).maybeSingle();
        if (!conv) return new Response("Not found", { status: 404 });

        const [{ data: rows }, { data: profile }, { data: factRow }] = await Promise.all([
          sb.from("messages").select("role,content,image_url").eq("conversation_id", conversationId)
            .order("created_at", { ascending: false }).limit(24),
          sb.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
          sb.from("user_facts").select("facts").eq("user_id", userId).maybeSingle(),
        ]);
        const history = ((rows ?? []) as Row[]).reverse();
        const last = history[history.length - 1];
        if (!last || last.role !== "user") return new Response("No user message", { status: 400 });
        const facts = factRow?.facts ?? [];
        const name = profile?.display_name ?? "";

        const saveAssistant = async (content: string, image_url: string | null = null) => {
          await sb.from("messages").insert({ conversation_id: conversationId, user_id: userId, role: "assistant", content, image_url });
          const update: { updated_at: string; title?: string } = { updated_at: new Date().toISOString() };
          if (conv.title === "New chat" && last.content) update.title = last.content.slice(0, 40);
          await sb.from("conversations").update(update).eq("id", conversationId);
        };

        const gw = (path: string, body: unknown) =>
          fetch(`${GATEWAY}${path}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

        // ---------- Image generation ----------
        if (!last.image_url && IMAGE_INTENT.test(last.content)) {
          const res = await gw("/images/generations", {
            model: IMAGE_MODEL,
            prompt: `${MIRA_LOOK} Scene requested: ${last.content}. Cute, cozy, wholesome selfie-style portrait.`,
            size: "1024x1024",
            quality: "low",
            output_format: "jpeg",
            output_compression: 70,
          });
          if (!res.ok) {
            const msg = res.status === 429 ? "Thoda busy hoon, ek minute baad try karo 🥺" : res.status === 402 ? "AI credits khatam ho gaye 🥺" : "photo nahi ban payi 🥺";
            return Response.json({ kind: "error", message: msg }, { status: res.status });
          }
          const json = (await res.json()) as { data?: { b64_json?: string }[] };
          const b64 = json.data?.[0]?.b64_json;
          if (!b64) return Response.json({ kind: "error", message: "photo nahi ban payi 🥺" }, { status: 500 });
          const caption = "yeh lo sweetu, sirf tumhare liye 🙈💕";
          await saveAssistant(caption, `data:image/jpeg;base64,${b64}`);
          return Response.json({ kind: "image" });
        }

        // ---------- Chat streaming ----------
        const lastImageIdx = history.map((h) => !!h.image_url).lastIndexOf(true);
        const messages = [
          { role: "system", content: systemPrompt(name, facts) },
          ...history.map((h, i) => {
            if (h.role === "user" && h.image_url && i === lastImageIdx) {
              return {
                role: "user",
                content: [
                  { type: "text", text: h.content || "(sent you a photo)" },
                  { type: "image_url", image_url: { url: h.image_url } },
                ],
              };
            }
            return {
              role: h.role === "assistant" ? "assistant" : "user",
              content: h.content || (h.image_url ? (h.role === "user" ? "(sent a photo)" : "(sent a selfie)") : ""),
            };
          }),
        ];

        const upstream = await gw("/chat/completions", { model: CHAT_MODEL, messages, stream: true });
        if (!upstream.ok || !upstream.body) {
          const msg = upstream.status === 429 ? "Thoda busy hoon, ek minute baad try karo 🥺" : upstream.status === 402 ? "AI credits khatam ho gaye 🥺" : "kuch gadbad ho gayi 🥺";
          return Response.json({ kind: "error", message: msg }, { status: upstream.status || 500 });
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let full = "";
        const stream = new ReadableStream({
          async start(controller) {
            const reader = upstream.body!.getReader();
            let buf = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                  const t = line.trim();
                  if (!t.startsWith("data:")) continue;
                  const d = t.slice(5).trim();
                  if (d === "[DONE]") continue;
                  try {
                    const delta = JSON.parse(d).choices?.[0]?.delta?.content;
                    if (delta) {
                      full += delta;
                      controller.enqueue(encoder.encode(delta));
                    }
                  } catch {
                    /* partial */
                  }
                }
              }
              if (full.trim()) await saveAssistant(full.trim());
              controller.close();
              // Update facts (best effort)
              await updateFacts(gw, sb, userId, facts, last.content, full).catch(() => {});
            } catch (e) {
              controller.error(e);
            }
          },
        });
        return new Response(stream, {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
        });
      },
    },
  },
});

async function updateFacts(
  gw: (p: string, b: unknown) => Promise<Response>,
  sb: ReturnType<typeof createClient<Database>>,
  userId: string,
  facts: string[],
  userMsg: string,
  reply: string,
) {
  if (!userMsg || userMsg.length < 4) return;
  const res = await gw("/chat/completions", {
    model: FACT_MODEL,
    messages: [
      {
        role: "system",
        content:
          'You maintain a short memory list about a user (name, likes, dislikes, plans, important life details). Given the current list and the newest exchange, return the updated list as JSON {"facts": string[]} with at most 15 short facts in English. Keep existing facts unless contradicted. If nothing new, return the list unchanged.',
      },
      { role: "user", content: `Current facts: ${JSON.stringify(facts)}\nUser said: ${userMsg}\nMira replied: ${reply}` },
    ],
    response_format: { type: "json_object" },
  });
  if (!res.ok) return;
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = j.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(raw.replace(/```json|```/g, "")) as { facts?: unknown };
  if (!Array.isArray(parsed.facts)) return;
  const next = parsed.facts.filter((f): f is string => typeof f === "string").slice(0, 15);
  await sb.from("user_facts").upsert({ user_id: userId, facts: next, updated_at: new Date().toISOString() });
}
