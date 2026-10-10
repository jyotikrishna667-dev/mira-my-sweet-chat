import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, LogOut, MessageCircleHeart, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createConversation, groupByDate, listConversations } from "@/lib/mira-data";
import { SidebarCtx } from "@/lib/sidebar-ctx";
import miraAvatar from "@/assets/mira-avatar.jpg";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat with Mira" },
      { name: "description", content: "Your conversations with Mira." },
      { property: "og:title", content: "Chat with Mira" },
      { property: "og:description", content: "Your conversations with Mira." },
    ],
  }),
  component: ChatLayout,
});

function ChatLayout() {
  const { user } = Route.useRouteContext();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { id?: string };
  const { data: convs = [] } = useQuery({ queryKey: ["convs"], queryFn: listConversations });
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  async function newChat() {
    try {
      const id = await createConversation(user.id);
      await qc.invalidateQueries({ queryKey: ["convs"] });
      setOpen(false);
      navigate({ to: "/chat/$id", params: { id } });
    } catch {
      toast.error("New chat nahi ban paya");
    }
  }
  async function rename(id: string) {
    const t = title.trim();
    setEditing(null);
    if (!t) return;
    await supabase.from("conversations").update({ title: t }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["convs"] });
  }
  async function remove(id: string) {
    if (!confirm("Delete this chat?")) return;
    await supabase.from("conversations").delete().eq("id", id);
    await qc.invalidateQueries({ queryKey: ["convs"] });
    if (params.id === id) navigate({ to: "/chat" });
  }
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const name = (user.user_metadata?.['full_name'] as string) || user.email?.split("@")[0] || "sweetu";

  return (
    <SidebarCtx.Provider value={{ open: () => setOpen(true) }}>
      <div className="flex h-dvh w-full overflow-hidden">
        {open && <div className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r bg-sidebar pt-safe text-sidebar-foreground transition-transform md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-center gap-3 p-4">
            <img src={miraAvatar} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
            <span className="font-display text-2xl">Mira</span>
            <button className="ml-auto md:hidden" onClick={() => setOpen(false)} aria-label="Close sidebar">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-3">
            <button onClick={newChat} className="flex w-full items-center justify-center gap-2 rounded-full bg-love py-2.5 font-semibold text-primary-foreground shadow-glow">
              <Plus className="h-4 w-4" /> New Chat
            </button>
          </div>
          <nav className="mt-4 flex-1 overflow-y-auto px-2 pb-4">
            {groupByDate(convs).map((g) => (
              <div key={g.label} className="mb-3">
                <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                {(g.items ?? []).map((c) => (
                  <div key={c.id} className={`group flex items-center gap-1 rounded-xl px-2 ${params.id === c.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"}`}>
                    {editing === c.id ? (
                      <>
                        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && rename(c.id)}
                          className="min-w-0 flex-1 rounded-md bg-input/50 px-2 py-1.5 text-sm outline-none" />
                        <button onClick={() => rename(c.id)} aria-label="Save"><Check className="h-4 w-4" /></button>
                      </>
                    ) : (
                      <>
                        <Link to="/chat/$id" params={{ id: c.id }} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-sm">
                          <MessageCircleHeart className="h-4 w-4 shrink-0 text-primary" />
                          <span className="truncate">{c.title}</span>
                        </Link>
                        <button onClick={() => { setEditing(c.id); setTitle(c.title); }} className="p-1 text-muted-foreground opacity-70 hover:text-foreground md:opacity-0 md:group-hover:opacity-100" aria-label="Rename">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => remove(c.id)} className="p-1 text-muted-foreground opacity-70 hover:text-destructive md:opacity-0 md:group-hover:opacity-100" aria-label="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </nav>
          <div className="flex items-center gap-2 border-t p-3 pb-safe">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-love text-sm font-bold text-primary-foreground">{name[0]?.toUpperCase()}</div>
            <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
            <button onClick={signOut} aria-label="Sign out" className="p-1 text-muted-foreground hover:text-foreground"><LogOut className="h-4 w-4" /></button>
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </SidebarCtx.Provider>
  );
}
