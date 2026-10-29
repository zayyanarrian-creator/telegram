import { redis, isLoggedIn, encrypt, decrypt, tg, maskToken, json, fail } from "@/lib/server";
import { settingsFrom } from "@/lib/gemini";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const c = (await redis.hgetall("cfg:bot")) || {};
  let masked = "";
  if (c.token) {
    try { masked = maskToken(await decrypt(c.token)); } catch { masked = "(tidak bisa dibaca)"; }
  }
  const s = settingsFrom(c);
  return json({
    hasToken: !!c.token,
    tokenMasked: masked,
    username: c.username || "",
    replyText: s.greeting,
    model: s.model,
    systemPrompt: s.systemPrompt,
    fallbackText: s.fallbackText,
    historyLimit: s.historyLimit,
  });
}

export async function POST(req) {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const { token, replyText, model, systemPrompt, fallbackText, historyLimit } = await req.json().catch(() => ({}));
  const update = {};

  if (typeof token === "string" && token.trim()) {
    const t = token.trim();
    const me = await tg(t, "getMe").catch(() => null);
    if (!me?.ok) return fail("Token tidak valid. Salin ulang dari @BotFather.");
    update.token = await encrypt(t);
    update.username = me.result.username;
  }

  if (typeof replyText === "string") {
    const r = replyText.trim();
    if (!r) return fail("Pesan sambutan tidak boleh kosong.");
    if (r.length > 1000) return fail("Pesan sambutan maksimal 1000 karakter.");
    update.replyText = r;
  }

  if (typeof model === "string") {
    const m = model.trim();
    if (!/^[A-Za-z0-9._-]{3,60}$/.test(m)) return fail("Nama model tidak valid. Contoh: gemini-3.1-flash-lite");
    update.model = m;
  }

  if (typeof systemPrompt === "string") {
    if (systemPrompt.length > 4000) return fail("System prompt maksimal 4000 karakter.");
    update.systemPrompt = systemPrompt.trim();
  }

  if (typeof fallbackText === "string") {
    const f = fallbackText.trim();
    if (!f) return fail("Pesan cadangan tidak boleh kosong.");
    if (f.length > 500) return fail("Pesan cadangan maksimal 500 karakter.");
    update.fallbackText = f;
  }

  if (historyLimit !== undefined) {
    const n = Number(historyLimit);
    if (!Number.isInteger(n) || n < 0 || n > 20) return fail("Riwayat chat harus angka bulat 0 sampai 20.");
    update.historyLimit = n;
  }

  if (!Object.keys(update).length) return fail("Tidak ada yang disimpan.");
  await redis.hset("cfg:bot", update);
  return json({ ok: true });
}
