import crypto from "crypto";
import { redis, isLoggedIn, encrypt, json, fail } from "@/lib/server";
import { MAX_KEYS, loadKeys, coolStates } from "@/lib/gemini";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const keys = await loadKeys();
  const states = await coolStates(keys.map((k) => k.slot));
  return json({
    max: MAX_KEYS,
    keys: keys.map((k, i) => ({ slot: k.slot, mask: k.mask, state: states[i] })),
  });
}

export async function POST(req) {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const { action, key, slot } = await req.json().catch(() => ({}));

  if (action === "add") {
    const k = typeof key === "string" ? key.trim() : "";
    if (k.length < 20 || /\s/.test(k)) return fail("Format API key tidak valid.");

    const existing = await loadKeys();
    const h = crypto.createHash("sha256").update(k).digest("hex").slice(0, 16);
    if (existing.some((e) => e.h === h)) return fail("Key ini sudah ada.");
    const free = Array.from({ length: MAX_KEYS }, (_, i) => i + 1).filter((n) => !existing.some((e) => e.slot === n));
    if (!free.length) return fail(`Sudah ada ${MAX_KEYS} key. Hapus salah satu dulu.`);

    // Cek ke Google bahwa key-nya benar-benar diterima.
    let ok = false;
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
        headers: { "x-goog-api-key": k },
        signal: AbortSignal.timeout(15000),
      });
      ok = r.ok;
    } catch {
      return fail("Tidak bisa menghubungi Google untuk memeriksa key. Coba lagi.");
    }
    if (!ok) return fail("Google menolak key ini. Salin ulang dari Google AI Studio.");

    const value = { enc: await encrypt(k), mask: `${k.slice(0, 4)}…${k.slice(-4)}`, h };
    for (const n of free) {
      if (await redis.hsetnx("cfg:keys", String(n), value)) return json({ ok: true, slot: n });
    }
    return fail("Slot key penuh. Muat ulang halaman lalu coba lagi.", 409);
  }

  if (action === "remove") {
    const n = Number(slot);
    if (!Number.isInteger(n) || n < 1 || n > MAX_KEYS) return fail("Slot tidak valid.");
    await redis.hdel("cfg:keys", String(n));
    await redis.del(`kcool:${n}`);
    return json({ ok: true });
  }

  if (action === "reset") {
    await redis.del(...Array.from({ length: MAX_KEYS }, (_, i) => `kcool:${i + 1}`));
    return json({ ok: true });
  }

  return fail("Aksi tidak dikenal.");
}
