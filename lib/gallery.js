import { redis, tg } from "@/lib/server";
import { PRODUCTS } from "@/lib/products";

// Galeri foto/video yang bisa dikirim bot sebagai album. Disimpan di Redis (cfg:gallery), diatur lewat menu admin.
const KEY = "cfg:gallery";
export const MAX_GALLERIES = 20;
export const MAX_ITEMS = 10; // batas album Telegram

export async function getGalleries() {
  try {
    const v = await redis.get(KEY);
    const a = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export async function saveGalleries(list) {
  await redis.set(KEY, list);
}

const str = (v, max) => String(v ?? "").trim().slice(0, max);

function httpsUrl(v, max = 800) {
  const s = str(v, max);
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// Memeriksa dan merapikan data dari admin. Mengembalikan { ok: true, list } atau { ok: false, error }.
export function cleanGalleries(input) {
  if (!Array.isArray(input)) return { ok: false, error: "Data galeri tidak valid." };
  if (input.length > MAX_GALLERIES) return { ok: false, error: `Maksimal ${MAX_GALLERIES} galeri.` };
  const seen = new Set();
  const list = [];
  for (const [n, g] of input.entries()) {
    const label = `Galeri ${n + 1}`;
    const id = str(g?.id, 40).toLowerCase();
    const prod = PRODUCTS.find((x) => x.id === id);
    if (!prod) return { ok: false, error: `${label}: pilih produk dari daftar.` };
    const name = prod.name;
    if (seen.has(id)) return { ok: false, error: `${name}: kode "${id}" sudah dipakai galeri lain.` };
    seen.add(id);
    const pageUrl = httpsUrl(g?.pageUrl, 500);
    if (pageUrl === null) return { ok: false, error: `${name}: link halaman galeri harus diawali https://` };
    const items = [];
    for (const it of Array.isArray(g?.items) ? g.items : []) {
      const type = it?.type === "video" ? "video" : "photo";
      const url = httpsUrl(it?.url);
      if (url === null) return { ok: false, error: `${name}: link ${type === "video" ? "video" : "foto"} harus diawali https://` };
      if (url) {
        const size = Number(it?.size);
        items.push({ type, url, ...(it?.name ? { name: str(it.name, 120) } : {}), ...(Number.isFinite(size) && size > 0 ? { size: Math.round(size) } : {}) });
      }
    }
    if (items.length > MAX_ITEMS) return { ok: false, error: `${name}: maksimal ${MAX_ITEMS} foto/video per galeri.` };
    list.push({
      id,
      name,
      keywords: str(g?.keywords, 200),
      caption: str(g?.caption, 900),
      pageUrl,
      buttonLabel: str(g?.buttonLabel, 40),
      items,
    });
  }
  return { ok: true, list };
}

// Tambahan untuk prompt: daftar galeri yang boleh dikirim. Hanya galeri yang punya isi.
export function promptBlock(list) {
  const usable = (list || []).filter((g) => g.items?.length);
  if (!usable.length) return "";
  const rows = usable.map((g) => `- id=${g.id} | ${g.name}${g.keywords ? ` | also called: ${g.keywords}` : ""}`).join("\n");
  return (
    "\n\nGALLERY (photos and videos you can send in this chat). This section OVERRIDES the PRODUCT PHOTOS rule for the product groups listed below. " +
    "When the visitor asks for photos, pictures, samples, videos or \"ada fotonya\" for one of these product groups, write ONE short sentence (no links, no Order ID, no tracker) " +
    "and put the tag [[GALLERY:id]] alone on the last line; the system then sends the album and the buttons by itself. " +
    "Add the tag when the visitor asks for photos or videos of a listed product, even if you already sent that gallery earlier in this conversation. " +
    "EXCEPTION: if the visitor asks for MORE or DIFFERENT photos than the ones already sent (e.g. \"selain itu\", \"yang lain\", \"ada lagi\", \"other photos\", \"more\"), do NOT add the tag. Say in ONE short sentence that the gallery already sent is all that is available in this chat, and that other variations can be asked to the team via WhatsApp. " +
    "Never explain or mention the tag. " +
    "For a product that is not listed here, say in ONE short sentence that its photos are not available in this chat yet, and that for photos or samples they can ask the team via WhatsApp. " +
    "Example in Indonesian: \"Foto hair weft belum tersedia di sini. Untuk foto atau contohnya, silakan tanyakan ke tim lewat WhatsApp.\" Never say or imply that EMAHAIRSHOP has no such photos or product.\nGalleries:\n" +
    rows
  );
}

export function withGalleryPrompt(settings, list) {
  const b = promptBlock(list);
  return b ? { ...settings, systemPrompt: String(settings.systemPrompt || "") + b } : settings;
}

const TAG_RE = /\[\[\s*GALLERY\s*:\s*([a-z0-9_-]+)\s*\]\]/gi;

// Mengambil tag galeri dari balasan AI dan membersihkannya dari teks.
export function extractGallery(text, list) {
  const src = String(text || "");
  let id = null;
  src.replace(TAG_RE, (_, x) => { if (!id) id = x.toLowerCase(); return ""; });
  const clean = src.replace(TAG_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  const gallery = id ? (list || []).find((g) => g.id === id && g.items?.length) || null : null;
  return { text: clean, gallery };
}

// Kirim lewat link. Telegram membatasi foto lewat link maksimal 5 MB dan video 20 MB.
async function sendByUrl(botToken, chatId, items, caption) {
  if (items.length === 1) {
    const it = items[0];
    const video = it.type === "video";
    return tg(botToken, video ? "sendVideo" : "sendPhoto", {
      chat_id: chatId,
      [video ? "video" : "photo"]: it.url,
      ...(caption ? { caption } : {}),
      ...(video ? { supports_streaming: true } : {}),
    });
  }
  const media = items.map((it, i) => ({
    type: it.type,
    media: it.url,
    ...(i === 0 && caption ? { caption } : {}),
    ...(it.type === "video" ? { supports_streaming: true } : {}),
  }));
  return tg(botToken, "sendMediaGroup", { chat_id: chatId, media });
}

async function tgForm(botToken, method, form) {
  const r = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, { method: "POST", body: form, signal: AbortSignal.timeout(50000) });
  return r.json().catch(() => ({ ok: false, description: `HTTP ${r.status}` }));
}

async function download(it, i) {
  const r = await fetch(it.url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`unduh file ${i + 1} gagal (HTTP ${r.status})`);
  const type = r.headers.get("content-type") || (it.type === "video" ? "video/mp4" : "image/jpeg");
  const ext = it.type === "video" ? "mp4" : type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  return { blob: new Blob([await r.arrayBuffer()], { type }), name: `f${i}.${ext}` };
}

// Cadangan: server mengunduh file lalu mengunggahnya sendiri ke Telegram (foto sampai 10 MB, video sampai 50 MB).
async function sendByUpload(botToken, chatId, items, caption) {
  const files = await Promise.all(items.map(download));
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (items.length === 1) {
    const video = items[0].type === "video";
    form.append(video ? "video" : "photo", files[0].blob, files[0].name);
    if (caption) form.append("caption", caption);
    if (video) form.append("supports_streaming", "true");
    return tgForm(botToken, video ? "sendVideo" : "sendPhoto", form);
  }
  const media = items.map((it, i) => ({
    type: it.type,
    media: `attach://f${i}`,
    ...(i === 0 && caption ? { caption } : {}),
    ...(it.type === "video" ? { supports_streaming: true } : {}),
  }));
  form.append("media", JSON.stringify(media));
  files.forEach((f, i) => form.append(`f${i}`, f.blob, f.name));
  return tgForm(botToken, "sendMediaGroup", form);
}

// Mengirim album (atau satu foto/video kalau isinya satu). Mengembalikan respons Telegram.
export async function sendAlbum(botToken, chatId, g) {
  const items = (g.items || []).slice(0, MAX_ITEMS);
  if (!items.length) return { ok: false, description: "Galeri kosong." };
  const caption = String(g.caption || "").slice(0, 1000);
  const first = await sendByUrl(botToken, chatId, items, caption).catch((e) => ({ ok: false, description: e?.message }));
  if (first?.ok) return first;
  const second = await sendByUpload(botToken, chatId, items, caption).catch((e) => ({ ok: false, description: e?.message }));
  if (second?.ok) return second;
  return { ok: false, description: `lewat link: ${first?.description || "?"} | lewat unggah: ${second?.description || "?"}` };
}

// ---------- pendeteksi di sisi server ----------
// Supaya album tetap terkirim walau AI lupa menulis tag: kalau pesan pengunjung meminta foto/video
// dan menyebut produk yang punya galeri, galeri itu dikirim.
const MEDIA_RE = /\b(foto|fotonya|gambar|gambarnya|video|videonya|contoh|contohnya|sampel|sample|samples|photo|photos|pic|pics|picture|pictures|image|images|katalog|catalog|catalogue)\b/i;
export const wantsMedia = (text) => MEDIA_RE.test(String(text || ""));

const norm = (t) => " " + String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";

// Mengembalikan galeri yang produknya disebut di pesan (yang paling spesifik menang), atau null.
export function matchGallery(text, list) {
  const t = norm(text);
  let best = null;
  let bestLen = 0;
  for (const g of list || []) {
    if (!g.items?.length) continue;
    const keys = [g.name, ...String(g.keywords || "").split(",")].map((k) => norm(k).trim()).filter((k) => k.length >= 3);
    for (const k of keys) {
      if (t.includes(" " + k + " ") && k.length > bestLen) { best = g; bestLen = k.length; }
    }
  }
  return best;
}

// Pengunjung minta foto LAIN / TAMBAHAN di luar yang sudah dikirim: album tidak dikirim ulang.
const MORE_RE = /\b(selain|lainnya|lain|tambahan|other|others|more|another|else|different|besides)\b|\b(ada|masih|punya)\s+(\w+\s+){0,3}lagi\b/i;
export const wantsMore = (text) => MORE_RE.test(String(text || ""));
