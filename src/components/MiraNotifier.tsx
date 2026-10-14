import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { cancelMira, capPlugins, deliverTapped, refreshPool, scheduleOnLeave } from "@/lib/mira-notify";

/** Schedules "come back" notifications in the Android app; does nothing in a normal browser. */
export function MiraNotifier() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    const plugins = capPlugins();
    const LN = plugins?.LocalNotifications;
    if (!LN) return;
    const handles: { remove?: () => void }[] = [];
    let away = false;

    const leave = () => { if (!away) { away = true; void scheduleOnLeave(); } };
    const back = () => { away = false; void cancelMira(); void refreshPool(); };
    const onVis = () => (document.visibilityState === "hidden" ? leave() : back());

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", leave);
    back();

    const add = async (target: any, ev: string, fn: (e: any) => void) => {
      try { const h = await target?.addListener?.(ev, fn); if (h) handles.push(h); } catch { /* ignore */ }
    };
    void add(plugins?.App, "appStateChange", (s: { isActive: boolean }) => (s?.isActive ? back() : leave()));
    void add(LN, "localNotificationActionPerformed", async (e: any) => {
      try {
        const conv = await deliverTapped(e?.notification?.extra ?? {});
        if (conv) {
          await qc.invalidateQueries({ queryKey: ["msgs", conv] });
          qc.invalidateQueries({ queryKey: ["convs"] });
          navigate({ to: "/chat/$id", params: { id: conv } });
        }
      } catch { /* ignore */ }
    });

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", leave);
      handles.forEach((h) => { try { h.remove?.(); } catch { /* ignore */ } });
    };
  }, [navigate, qc]);

  return null;
}
