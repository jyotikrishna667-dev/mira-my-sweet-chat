import { useState } from "react";
import { Download, X } from "lucide-react";
import { toast } from "sonner";
import { downloadImage } from "@/lib/download-image";

async function save(src: string) {
  try {
    await downloadImage(src);
    toast.success("Photo saved 💕");
  } catch {
    toast.error("Couldn't save the photo");
  }
}

export function ChatImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="relative mb-1 inline-block">
        <img src={src} alt={alt} onClick={() => setOpen(true)} className={`${className} cursor-zoom-in`} />
        <button
          onClick={(e) => { e.stopPropagation(); save(src); }}
          className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-background/70 text-foreground backdrop-blur"
          aria-label="Download photo"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 pt-safe pb-safe" onClick={() => setOpen(false)}>
          <img src={src} alt={alt} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
          <div className="absolute right-3 top-3 flex gap-2" style={{ marginTop: "env(safe-area-inset-top)" }}>
            <button onClick={(e) => { e.stopPropagation(); save(src); }} className="grid h-10 w-10 place-items-center rounded-full bg-card text-foreground" aria-label="Download photo">
              <Download className="h-5 w-5" />
            </button>
            <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-card text-foreground" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
