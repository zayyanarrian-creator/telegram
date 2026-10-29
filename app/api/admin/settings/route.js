import { redis, isLoggedIn, encrypt, decrypt, tg, maskToken, DEFAULT_REPLY, json, fail } from "@/lib/server";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const c = (await redis.hgetall("cfg:bot")) || {};
  let masked = "";
  if (c.token) {
    try { masked = maskToken(await decrypt(c.token)); } catch { masked = "(tidak bisa dibaca)"; }
  }
  return json({
    hasToken: !!c.token,
    tokenMasked: masked,
    username: c.username || "",
    replyText: c.replyText || DEFAULT_REPLY,
  });
}

export async function POST(req) {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const { token, replyText } = await req.json().catch(() => ({}));
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
    if (!r) return fail("Teks balasan tidak boleh kosong.");
    if (r.length > 1000) return fail("Teks balasan maksimal 1000 karakter.");
    update.replyText = r;
  }

  if (!Object.keys(update).length) return fail("Tidak ada yang disimpan.");
  await redis.hset("cfg:bot", update);
  return json({ ok: true });
}
