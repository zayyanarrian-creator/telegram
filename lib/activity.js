import { redis } from "@/lib/server";

/* ---------- log pesan ---------- */
// Disimpan di list `log:msgs` (terbaru di depan), maksimal 200 entri.
// Isi pesan dipotong 300 karakter, dan hilang otomatis 30 hari setelah pesan terakhir.
const LOG_KEY = "log:msgs";
const LOG_MAX = 200;
const LOG_TTL = 30 * 86400;

// Buang apa pun yang mirip API key Google atau token bot sebelum disimpan.
function clean(s, n) {
  return String(s ?? "")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]")
    .replace(/\d{6,}:[A-Za-z0-9_-]{30,}/g, "[token]")
    .slice(0, n);
}

// st: "ok" | "error" | "limited"
export async function addLog({ uid, name, q, a, st, slot = null, ms = null }) {
  try {
    const row = { t: Date.now(), uid, name: clean(name, 80), q: clean(q, 300), a: clean(a, 300), st, slot, ms };
    const p = redis.pipeline();
    p.lpush(LOG_KEY, row);
    p.ltrim(LOG_KEY, 0, LOG_MAX - 1);
    p.expire(LOG_KEY, LOG_TTL);
    await p.exec();
  } catch (e) {
    // Log gagal tidak boleh membuat balasan ke pengguna ikut gagal.
    console.error("Gagal menulis log:", e?.message);
  }
}

export async function getLogs(n = 50) {
  const rows = (await redis.lrange(LOG_KEY, 0, n - 1)) || [];
  return rows.filter((x) => x && typeof x === "object");
}

export async function clearLogs() {
  await redis.del(LOG_KEY);
}

/* ---------- batas pesan per pengguna ---------- */
// Jendela tetap: hitungan dimulai dari pesan pertama dan direset setelah `limitMinutes`.
// Kalau Redis bermasalah, pengguna tetap dilayani (fail-open).
export async function checkLimit(uid, { limitCount, limitMinutes }) {
  if (!limitCount) return { ok: true };
  const k = `rl:u:${uid}`;
  const sec = limitMinutes * 60;
  try {
    const [n, , ttl] = await redis.pipeline().incr(k).expire(k, sec, "NX").ttl(k).exec();
    let wait = Number(ttl);
    if (!(wait > 0)) { await redis.expire(k, sec); wait = sec; } // jaga-jaga kalau TTL hilang
    return { ok: n <= limitCount, first: n === limitCount + 1, retrySec: wait };
  } catch (e) {
    console.error("Gagal memeriksa batas pesan:", e?.message);
    return { ok: true };
  }
}
