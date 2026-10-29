import crypto from "crypto";
import { redis, dbConfigured, json } from "@/lib/server";
import { generateReply, settingsFrom, getHistory, saveTurn, clearHistory } from "@/lib/gemini";
import { addLog, checkLimit } from "@/lib/activity";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MSG_MAX = 2000;
// Batas total chat web per hari (WIB), supaya kuota key Gemini tidak habis dan bot Telegram ikut mati.
const DAILY_MAX = Number.parseInt(process.env.WEB_CHAT_DAILY_MAX, 10) || 300;
const SID = /^[A-Za-z0-9-]{16,64}$/;
const wibDay = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

const err = (message, status) => json({ error: message }, status);

// Pengunjung dikenali lewat hash alamat IP, bukan lewat sid dari browser, jadi batas pesan tidak bisa
// dihindari dengan mengganti sid. IP asli tidak disimpan.
function visitorId(req) {
  const ip =
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return crypto.createHash("sha256").update("web:" + ip).digest("hex").slice(0, 16);
}

export async function POST(req) {
  if (process.env.WEB_CHAT_OFF === "1") return err("Chat di web sedang dimatikan.", 503);
  if (!dbConfigured) return err("Layanan belum siap. Coba lagi nanti.", 503);

  const body = await req.json().catch(() => null);
  const sid = typeof body?.sid === "string" ? body.sid : "";
  if (!SID.test(sid)) return err("Sesi tidak valid. Muat ulang halaman ini.", 400);
  const chatId = `web:${sid}`;

  try {
    if (body.action === "reset") {
      await clearHistory(chatId);
      return json({ ok: true });
    }

    const text = typeof body.text === "string" ? body.text.trim().slice(0, MSG_MAX) : "";
    if (!text) return err("Pesan kosong.", 400);

    const cfg = (await redis.hgetall("cfg:bot")) || {};
    const s = settingsFrom(cfg);
    // Prompt bawaan menyebut Telegram, jadi beri tahu AI bahwa percakapan ini terjadi di web.
    s.systemPrompt += "\n\nCatatan tambahan. Percakapan ini terjadi lewat halaman web, bukan lewat Telegram.";

    const vid = visitorId(req);
    const who = `Web ${vid.slice(0, 4)}`;
    const t0 = Date.now();

    const lim = await checkLimit(`web:${vid}`, s);
    if (!lim.ok) {
      const mins = String(Math.max(1, Math.ceil(lim.retrySec / 60)));
      // Dicatat sekali per jendela saja, supaya spam tidak memenuhi log.
      if (lim.first) {
        await addLog({ uid: `web:${vid}`, name: who, q: text, a: "Batas tercapai (web).", st: "limited", ms: Date.now() - t0 });
      }
      return err(s.limitText.replaceAll("{sisa}", mins), 429);
    }

    try {
      const dk = `web:day:${wibDay()}`;
      const n = await redis.incr(dk);
      if (n === 1) await redis.expire(dk, 172800);
      if (n > DAILY_MAX) return err("Chat di web sudah penuh untuk hari ini. Coba lagi besok ya.", 503);
    } catch (e) {
      console.error("Gagal memeriksa batas harian web:", e?.message); // fail-open
    }

    const history = await getHistory(chatId, s.historyLimit);
    const r = await generateReply({ text, history, settings: s });
    if (r.ok) {
      await saveTurn(chatId, text, r.text, s.historyLimit);
      await addLog({ uid: `web:${vid}`, name: who, q: text, a: r.text, st: "ok", slot: r.slot, ms: Date.now() - t0 });
      return json({ reply: r.text });
    }
    console.error("Gemini gagal (web):", r.error);
    await addLog({ uid: `web:${vid}`, name: who, q: text, a: r.error, st: "error", ms: Date.now() - t0 });
    return err(s.fallbackText, 502);
  } catch (e) {
    console.error("Gagal memproses chat web:", e?.message);
    return err("Terjadi masalah di server. Coba lagi sebentar lagi ya.", 500);
  }
}
