// Free Microsoft Edge "Read aloud" neural TTS over WebSocket.
const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROME_VER = "1-143.0.3650.75";
const BASE = "speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";

async function secMsGec(): Promise<string> {
  let ticks = Math.floor(Date.now() / 1000) + 11644473600;
  ticks -= ticks % 300;
  const s = `${BigInt(ticks) * 10000000n}${TOKEN}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const uuid = () => crypto.randomUUID().replace(/-/g, "");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

type WSLike = {
  send: (d: string) => void;
  close: () => void;
  addEventListener: (t: string, f: (e: any) => void) => void;
};

const WS_HEADERS = {
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
  Pragma: "no-cache",
  "Cache-Control": "no-cache",
  "Accept-Language": "en-US,en;q=0.9",
};
const muid = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

async function openSocket(url: string): Promise<WSLike> {
  // Cloudflare Workers: outbound websocket via fetch upgrade (allows custom headers)
  try {
    const res = (await fetch(url.replace("wss://", "https://"), {
      headers: { Upgrade: "websocket", ...WS_HEADERS, Cookie: `muid=${muid()};` },
    })) as Response & { webSocket?: WSLike & { accept: () => void } };
    if (res.webSocket) {
      res.webSocket.accept();
      return res.webSocket;
    }
  } catch {
    /* fall through to standard WebSocket */
  }
  const WS = WebSocket as unknown as new (u: string, o?: unknown) => WebSocket;
  const ws = new WS(url, { headers: { ...WS_HEADERS, Cookie: `muid=${muid()};` } });
  ws.binaryType = "arraybuffer";
  await new Promise<void>((ok, bad) => {
    ws.addEventListener("open", () => ok());
    ws.addEventListener("error", () => bad(new Error("ws error")));
  });
  return ws as unknown as WSLike;
}

export async function edgeSynthesize(text: string, voice: string, rate: string, pitch: string): Promise<Uint8Array> {
  const url = `wss://${BASE}?TrustedClientToken=${TOKEN}&Sec-MS-GEC=${await secMsGec()}&Sec-MS-GEC-Version=${CHROME_VER}&ConnectionId=${uuid()}`;
  const ws = await openSocket(url);
  const chunks: Uint8Array[] = [];
  const ts = new Date().toString();
  const done = new Promise<void>((ok, bad) => {
    const timer = setTimeout(() => bad(new Error("tts timeout")), 25000);
    ws.addEventListener("message", async (e: any) => {
      const d = e.data;
      if (typeof d === "string") {
        if (d.includes("Path:turn.end")) { clearTimeout(timer); ok(); }
        return;
      }
      const ab: ArrayBuffer = d instanceof ArrayBuffer ? d : await (d as Blob).arrayBuffer();
      const u = new Uint8Array(ab);
      if (u.length < 2) return;
      const hl = (u[0] << 8) | u[1];
      const header = new TextDecoder().decode(u.subarray(2, 2 + hl));
      if (header.includes("Path:audio")) chunks.push(u.subarray(2 + hl));
    });
    ws.addEventListener("close", () => { clearTimeout(timer); ok(); });
    ws.addEventListener("error", () => { clearTimeout(timer); bad(new Error("tts socket error")); });
  });
  ws.send(
    `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
      `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`,
  );
  const lang = voice.split("-").slice(0, 2).join("-");
  ws.send(
    `X-RequestId:${uuid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n` +
      `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='+0%'>${esc(text)}</prosody></voice></speak>`,
  );
  try {
    await done;
  } finally {
    try { ws.close(); } catch { /* ignore */ }
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (!total) throw new Error("no audio");
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
