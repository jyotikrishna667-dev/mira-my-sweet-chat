import { supabase } from "@/integrations/supabase/client";

export type Conversation = { id: string; title: string; updated_at: string };
export type Msg = { id: string; role: string; content: string; image_url: string | null; created_at: string };

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createConversation(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title: "New chat" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function listMessages(conversationId: string): Promise<Msg[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id,role,content,image_url,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function groupByDate(convs: Conversation[]) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;
  const groups: Record<string, Conversation[]> = {};
  const order = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];
  for (const c of convs) {
    const t = new Date(c.updated_at).getTime();
    const k =
      t >= startToday ? "Today" : t >= startToday - day ? "Yesterday" : t >= startToday - 7 * day ? "Previous 7 days" : t >= startToday - 30 * day ? "Previous 30 days" : "Older";
    (groups[k] ??= []).push(c);
  }
  return order.filter((k) => groups[k]).map((k) => ({ label: k, items: groups[k] }));
}

export async function compressImage(file: File, max = 1024): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}
