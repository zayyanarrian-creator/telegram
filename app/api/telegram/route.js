import { redis, decrypt, tg, DEFAULT_REPLY } from "@/lib/server";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const cfg = await redis.hgetall("cfg:bot");
  if (!cfg?.token || !cfg.secret) return new Response("not configured", { status: 503 });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== cfg.secret) {
    return new Response("forbidden", { status: 403 });
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message;

  // Selalu balas 200 agar Telegram tidak mengulang-ulang pengiriman.
  if (msg?.text && msg.chat?.id) {
    try {
      const text = (cfg.replyText || DEFAULT_REPLY).replaceAll("{nama}", msg.from?.first_name || "teman");
      await tg(await decrypt(cfg.token), "sendMessage", { chat_id: msg.chat.id, text });
    } catch (e) {
      console.error("Gagal membalas:", e?.message);
    }
  }
  return Response.json({ ok: true });
}
