import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { createConversation, listConversations } from "@/lib/mira-data";

export const Route = createFileRoute("/_authenticated/chat/")({
  component: PickChat,
});

function PickChat() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const convs = await listConversations();
      const id = convs[0]?.id ?? (await createConversation(user.id));
      if (!cancelled) navigate({ to: "/chat/$id", params: { id }, replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, user.id]);
  return <div className="flex flex-1 items-center justify-center text-muted-foreground">loading… 💕</div>;
}
