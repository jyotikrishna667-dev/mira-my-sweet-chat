function fileName() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `mira-photo-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}

async function toPngBlob(src: string): Promise<Blob> {
  const blob = await (await fetch(src)).blob();
  if (blob.type === "image/png") return blob;
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"));
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = rej;
    r.readAsDataURL(b);
  });
}

export async function downloadImage(src: string): Promise<void> {
  const name = fileName();
  const blob = await toPngBlob(src);
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return;
    } catch {
      /* fall through to native */
    }
  }
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const data = await blobToBase64(blob);
  let uri: string;
  try {
    uri = (await Filesystem.writeFile({ path: `Download/${name}`, data, directory: Directory.ExternalStorage, recursive: true })).uri;
  } catch {
    uri = (await Filesystem.writeFile({ path: name, data, directory: Directory.Documents, recursive: true })).uri;
  }
  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title: "Mira photo", files: [uri], dialogTitle: "Save photo" });
  } catch {
    /* saved already; share cancelled */
  }
}
