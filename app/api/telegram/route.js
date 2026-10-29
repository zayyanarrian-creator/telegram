import { redis, decrypt, tg } from "@/lib/server";
import { generateReply, settingsFrom, getHistory, saveTurn, clearHistory, splitText } from "@/lib/gemini";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req) {
  const cfg = await redis.hgetall("cfg:bot");
  if (!cfg?.token || !cfg.secret) return new Response("not configured", { status: 503 });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== cfg.secret) {
    return new Response("forbidden", { status: 403 });
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message;

  // Selalu balas 200 agar Telegram tidak mengulang-ulang pengiriman.
  try {
    if (update?.update_id != null) {
      const first = await redis.set(`upd:${update.update_id}`, 1, { nx: true, ex: 600 });
      if (!first) return Response.json({ ok: true }); // update ganda
    }

    if (msg?.text && msg.chat?.id) {
      const s = settingsFrom(cfg);
      const botToken = await decrypt(cfg.token);
      const chatId = msg.chat.id;
      const send = async (text) => {
        for (const part of splitText(text)) await tg(botToken, "sendMessage", { chat_id: chatId, text: part });
      };
      const text = msg.text.trim().slice(0, 4000);
      const cmd = text.split(/[\s@]/)[0].toLowerCase();

      if (cmd === "/start") {
        await send(s.greeting.replaceAll("{nama}", msg.from?.first_name || "teman"));
      } else if (cmd === "/reset") {
        await clearHistory(chatId);
        await send("Riwayat percakapan dihapus. Kita mulai dari awal ya.");
      } else {
        tg(botToken, "sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
        const history = await getHistory(chatId, s.historyLimit);
        const r = await generateReply({ text, history, settings: s });
        if (r.ok) {
          await send(r.text);
          await saveTurn(chatId, text, r.text, s.historyLimit);
        } else {
          console.error("Gemini gagal:", r.error);
          await send(s.fallbackText);
        }
      }
    }
  } catch (e) {
    console.error("Gagal memproses pesan:", e?.message);
  }
  return Response.json({ ok: true });
}
