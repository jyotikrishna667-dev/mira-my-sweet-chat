import { Copy, Trash2 } from "lucide-react";

export function MessageMenu({ rect, mine, onCopy, onUnsend, onClose }: { rect: DOMRect; mine: boolean; onCopy: () => void; onUnsend: () => void; onClose: () => void }) {
  const W = 180, H = 104, pad = 12;
  const vh = window.innerHeight, vw = window.innerWidth;
  let top = rect.bottom + 8;
  if (top + H > vh - pad) top = rect.top - H - 8;
  top = Math.max(pad, Math.min(top, vh - H - pad));
  let left = mine ? rect.right - W : rect.left;
  left = Math.max(pad, Math.min(left, vw - W - pad));
  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm animate-in fade-in" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div style={{ top, left, width: W }} className="fixed z-50 overflow-hidden rounded-2xl border bg-card shadow-glow animate-in fade-in zoom-in-95">
        <button onClick={onCopy} className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-accent">
          Copy <Copy className="h-4 w-4" />
        </button>
        <div className="h-px bg-border" />
        <button onClick={onUnsend} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-destructive hover:bg-accent">
          Unsend <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
