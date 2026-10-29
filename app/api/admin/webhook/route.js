import crypto from "crypto";
import { redis, isLoggedIn, decrypt, tg, json, fail } from "@/lib/server";
export const dynamic = "force-dynamic";

function hookUrl(req) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return `https://${host}/api/telegram`;
}

export async function POST(req) {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const { action } = await req.json().catch(() => ({}));
  const cfg = (await redis.hgetall("cfg:bot")) || {};
  if (!cfg.token) return fail("Simpan token bot terlebih dahulu.");
  const token = await decrypt(cfg.token);
  const url = hookUrl(req);

  if (action === "set") {
    let secret = cfg.secret;
    if (!secret) {
      secret = "wh" + crypto.randomBytes(24).toString("hex");
      await redis.hset("cfg:bot", { secret });
    }
    const r = await tg(token, "setWebhook", {
      url,
      secret_token: secret,
      allowed_updates: ["message"],
    });
    if (!r.ok) return fail(`Telegram menolak: ${r.description || "alasan tidak diketahui"}`);
    return json({ ok: true });
  }

  if (action === "delete") {
    const r = await tg(token, "deleteWebhook");
    if (!r.ok) return fail(`Telegram menolak: ${r.description || "alasan tidak diketahui"}`);
    return json({ ok: true });
  }

  if (action === "status") {
    const r = await tg(token, "getWebhookInfo");
    if (!r.ok) return fail(`Telegram menolak: ${r.description || "alasan tidak diketahui"}`);
    const i = r.result;
    return json({
      active: i.url === url,
      url: i.url || "",
      pending: i.pending_update_count || 0,
      error: i.last_error_message || "",
    });
  }

  return fail("Aksi tidak dikenal.");
}
