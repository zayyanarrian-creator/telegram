import { redis, decrypt, tg } from "@/lib/server";
import { generateReply, settingsFrom, getHistory, saveTurn, clearHistory, splitText } from "@/lib/gemini";
import { addLog, addConv, checkLimit } from "@/lib/activity";
import { decorate } from "@/lib/buttons";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ---------- foto dari pengguna ---------- */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // batas aman agar permintaan ke Gemini tidak terlalu besar
const MIME_BY_EXT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };

// Mengembalikan { ok, image: { mime, data } } atau { ok: false, reason }.
// Foto biasa: Telegram menyediakan beberapa ukuran, kita ambil yang terbesar yang masih muat.
async function fetchImage(botToken, msg) {
  let fileId = null;
  let mime = "image/jpeg";
  if (Array.isArray(msg.photo) && msg.photo.length) {
    const sizes = [...msg.photo].sort((a, b) => (a.file_size || 0) - (b.file_size || 0));
    const fit = sizes.filter((x) => !x.file_size || x.file_size <= MAX_IMAGE_BYTES);
    fileId = (fit.length ? fit[fit.length - 1] : sizes[0])?.file_id;
  } else if (msg.document?.mime_type?.startsWith("image/")) {
    if ((msg.document.file_size || 0) > MAX_IMAGE_BYTES) return { ok: false, reason: "big" };
    fileId = msg.document.file_id;
    mime = msg.document.mime_type;
  }
  if (!fileId) return { ok: false, reason: "none" };

  const info = await tg(botToken, "getFile", { file_id: fileId });
  const path = info?.result?.file_path;
  if (!info?.ok || !path) return { ok: false, reason: "fail" };
  if ((info.result.file_size || 0) > MAX_IMAGE_BYTES) return { ok: false, reason: "big" };

  const ext = path.split(".").pop().toLowerCase();
  if (MIME_BY_EXT[ext]) mime = MIME_BY_EXT[ext];
  const res = await fetch(`https://api.telegram.org/file/bot${botToken}/${path}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) return { ok: false, reason: "fail" };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) return { ok: false, reason: "big" };
  return { ok: true, image: { mime, data: buf.toString("base64") } };
}

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

    const isImage = !!(msg?.photo?.length || msg?.document?.mime_type?.startsWith("image/"));
    if ((msg?.text || isImage) && msg.chat?.id) {
      const s = settingsFrom(cfg);
      const botToken = await decrypt(cfg.token);
      const chatId = msg.chat.id;
      const uid = msg.from?.id ?? chatId;
      const who =
        [msg.from?.first_name, msg.from?.username ? `@${msg.from.username}` : ""].filter(Boolean).join(" ") ||
        String(uid);
      // Nama percakapan: judul grup, atau nama pengirim untuk chat pribadi.
      const title = msg.chat.title || who;
      // buttons = [{ text, url }] ditampilkan di bawah pesan terakhir; logText = teks asli untuk riwayat/admin.
      const send = async (text, buttons = [], logText = text) => {
        const parts = splitText(text);
        for (let i = 0; i < parts.length; i++) {
          const body = { chat_id: chatId, text: parts[i], link_preview_options: { is_disabled: true } };
          if (buttons.length && i === parts.length - 1) body.reply_markup = { inline_keyboard: buttons.map((b) => [b]) };
          await tg(botToken, "sendMessage", body);
        }
        await addConv({ chatId, title, role: "bot", name: "Bot", text: logText });
      };
      // Untuk foto, teksnya adalah caption (boleh kosong).
      const caption = (msg.text || msg.caption || "").trim().slice(0, 4000);
      const text = isImage ? `[Foto]${caption ? " " + caption : ""}` : caption;
      await addConv({ chatId, title, role: "user", name: who, text });
      const cmd = text.split(/[\s@]/)[0].toLowerCase();

      if (cmd === "/start") {
        await send(s.greeting.replaceAll("{nama}", msg.from?.first_name || "teman"));
      } else if (cmd === "/reset") {
        await clearHistory(chatId);
        await send("Riwayat percakapan dihapus. Kita mulai dari awal ya.");
      } else {
        const t0 = Date.now();

        const lim = await checkLimit(uid, s);
        if (!lim.ok) {
          // Pemberitahuan dikirim sekali saja per jendela, supaya pengguna yang spam tidak dibalas terus.
          if (lim.first) {
            await send(s.limitText.replaceAll("{sisa}", String(Math.max(1, Math.ceil(lim.retrySec / 60)))));
          }
          await addLog({
            uid, name: who, q: text, st: "limited", ms: Date.now() - t0,
            a: lim.first ? "Batas tercapai, pemberitahuan dikirim." : "Batas tercapai, tidak dibalas.",
          });
        } else {
          tg(botToken, "sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
          const history = await getHistory(chatId, s.historyLimit);
          let images = [];
          let askText = text;
          if (isImage) {
            const got = await fetchImage(botToken, msg).catch(() => ({ ok: false, reason: "fail" }));
            if (!got.ok) {
              const note =
                got.reason === "big"
                  ? "Maaf, ukuran fotonya terlalu besar. Coba kirim foto yang lebih kecil ya."
                  : "Maaf, fotonya belum bisa saya buka. Coba kirim ulang ya.";
              await send(note);
              await addLog({ uid, name: who, q: text, a: note, st: "error", ms: Date.now() - t0 });
              return Response.json({ ok: true });
            }
            images = [got.image];
            askText = caption || "(Pengunjung mengirim foto tanpa teks. Jelaskan singkat apa yang terlihat dan tanyakan apa yang ingin dibantu.)";
          }
          const r = await generateReply({ text: askText, history, settings: s, images });
          if (r.ok) {
            const d = await decorate(r.text, s);
            await send(d.text, d.buttons, r.text);
            await saveTurn(chatId, text, r.text, s.historyLimit);
            await addLog({ uid, name: who, q: text, a: r.text, st: "ok", slot: r.slot, ms: Date.now() - t0 });
          } else {
            console.error("Gemini gagal:", r.error);
            await send(s.fallbackText);
            await addLog({ uid, name: who, q: text, a: r.error, st: "error", ms: Date.now() - t0 });
          }
        }
      }
    }
  } catch (e) {
    console.error("Gagal memproses pesan:", e?.message);
  }
  return Response.json({ ok: true });
}
