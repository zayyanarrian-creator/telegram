"use client";
import { useEffect, useState } from "react";

async function api(path, body) {
  const r = await fetch(path, body
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Terjadi kesalahan.");
  return j;
}

export default function Admin() {
  const [view, setView] = useState("loading");
  const [needsCode, setNeedsCode] = useState(false);
  const [err, setErr] = useState("");

  async function refresh() {
    try {
      const s = await api("/api/admin/state");
      setNeedsCode(s.needsCode);
      setView(!s.setup ? "setup" : s.loggedIn ? "dash" : "login");
    } catch (e) {
      setErr(e.message);
      setView("error");
    }
  }
  useEffect(() => { refresh(); }, []);

  return (
    <main className="wrap">
      {view === "loading" && <p className="muted">Memuat…</p>}
      {view === "error" && <div className="msg bad">{err}</div>}
      {(view === "setup" || view === "login") && (
        <Auth mode={view} needsCode={needsCode} onDone={refresh} />
      )}
      {view === "dash" && (
        <Dash onLogout={async () => { await api("/api/admin/auth", { action: "logout" }); refresh(); }} />
      )}
    </main>
  );
}

function Auth({ mode, needsCode, onDone }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const setup = mode === "setup";

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api("/api/admin/auth", { action: mode, password, code }); await onDone(); }
    catch (x) { setErr(x.message); }
    setBusy(false);
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: "10vh auto 0" }}>
      <h1 style={{ fontSize: "1.6rem" }}>{setup ? "Buat password admin" : "Masuk admin"}</h1>
      {setup && <p className="muted">Ini pertama kali halaman dibuka. Password disimpan dalam bentuk hash.</p>}
      {err && <div className="msg bad">{err}</div>}
      <form onSubmit={submit}>
        {setup && needsCode && (
          <div className="field">
            <label htmlFor="code">Kode setup</label>
            <input id="code" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          </div>
        )}
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={setup ? "new-password" : "current-password"} />
        </div>
        <button className="btn" disabled={busy}>{setup ? "Buat password" : "Masuk"}</button>
      </form>
    </div>
  );
}

const LOG_ST = { ok: "Dibalas", error: "Gagal", limited: "Kena batas" };

function fmtDur(sec) {
  if (sec < 90) return `${Math.max(1, Math.round(sec))} detik`;
  if (sec < 5400) return `${Math.round(sec / 60)} menit`;
  return `${Math.round(sec / 3600)} jam`;
}

function ago(ts) {
  if (!ts) return "belum pernah";
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "baru saja";
  return fmtDur(s) + " lalu";
}

function fmtTime(ts) {
  return new Date(ts).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function keyLabel(k) {
  if (k.state === "rate") return `Kena batas, siap lagi ±${fmtDur(k.coolSec || 60)}`;
  if (k.state === "bad") return `Ditolak Google, dicoba lagi ±${fmtDur(k.coolSec || 3600)}`;
  return "Siap";
}

function Dash({ onLogout }) {
  const [cfg, setCfg] = useState(null);
  const [keys, setKeys] = useState(null);
  const [wh, setWh] = useState(null);
  const [token, setToken] = useState("");
  const [reply, setReply] = useState("");
  const [ai, setAi] = useState({ model: "", systemPrompt: "", fallbackText: "", historyLimit: 10 });
  const [lim, setLim] = useState({ limitCount: 20, limitMinutes: 60, limitText: "" });
  const [logs, setLogs] = useState(null);
  const [newKey, setNewKey] = useState("");
  const [testMsg, setTestMsg] = useState("Halo, kamu siapa?");
  const [testOut, setTestOut] = useState(null);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState(null);
  const note = (text, bad) => setMsg({ text, bad });

  async function load() {
    const c = await api("/api/admin/settings");
    setCfg(c); setReply(c.replyText);
    setAi({ model: c.model, systemPrompt: c.systemPrompt, fallbackText: c.fallbackText, historyLimit: c.historyLimit });
    setLim({ limitCount: c.limitCount, limitMinutes: c.limitMinutes, limitText: c.limitText });
    setKeys(await api("/api/admin/keys"));
    setLogs((await api("/api/admin/logs").catch(() => ({ logs: [] }))).logs);
    if (c.hasToken) setWh(await api("/api/admin/webhook", { action: "status" }).catch(() => null));
    else setWh(null);
  }
  useEffect(() => { load().catch((e) => note(e.message, true)); }, []);

  async function run(fn, okText) {
    setMsg(null);
    try { await fn(); note(okText); await load(); } catch (e) { note(e.message, true); }
  }

  async function runTest() {
    setTesting(true); setTestOut(null);
    try {
      const r = await api("/api/admin/test", { message: testMsg });
      setTestOut({ text: r.text });
    } catch (e) {
      setTestOut({ text: e.message, bad: true });
    }
    setTesting(false);
    api("/api/admin/keys").then(setKeys).catch(() => {});
  }

  if (!cfg || !keys) return <p className="muted">Memuat…</p>;

  return (
    <>
      <div className="top">
        <h1 style={{ fontSize: "1.8rem", margin: 0 }}>Admin bot</h1>
        <button className="btn ghost" onClick={onLogout}>Keluar</button>
      </div>
      {msg && <div className={"msg " + (msg.bad ? "bad" : "ok")}>{msg.text}</div>}

      <section className="card">
        <h2>Token bot</h2>
        <p className="muted">
          {cfg.hasToken ? <>Tersimpan: <code>{cfg.tokenMasked}</code> (@{cfg.username})</> : "Belum ada token. Buat bot lewat @BotFather lalu tempel tokennya di sini."}
        </p>
        <div className="field">
          <label htmlFor="tk">{cfg.hasToken ? "Ganti token" : "Token baru"}</label>
          <input id="tk" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" placeholder="123456789:AA…" />
        </div>
        <button className="btn" disabled={!token.trim()}
          onClick={() => run(async () => { await api("/api/admin/settings", { token }); setToken(""); }, "Token disimpan.")}>
          Simpan token
        </button>
      </section>

      <section className="card">
        <h2>Webhook</h2>
        {!cfg.hasToken ? <p className="muted">Simpan token dulu.</p> : (
          <>
            <p>
              Status:{" "}
              {wh?.active ? <span className="badge ok">Aktif</span> : <span className="badge bad">Belum aktif</span>}
              {wh && <span className="muted"> · {wh.pending} pesan menunggu</span>}
            </p>
            {wh?.error && <p className="muted">Error terakhir dari Telegram: {wh.error}</p>}
            <p className="muted">Pasang webhook dari alamat domain utama kamu, bukan dari alamat preview.</p>
            <div className="row">
              <button className="btn" onClick={() => run(() => api("/api/admin/webhook", { action: "set" }), "Webhook terpasang.")}>Pasang webhook</button>
              <button className="btn ghost" onClick={() => run(() => api("/api/admin/webhook", { action: "delete" }), "Webhook dilepas.")}>Lepas webhook</button>
              <button className="btn ghost" onClick={() => load().catch((e) => note(e.message, true))}>Segarkan status</button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>Kunci API Gemini</h2>
        <p className="muted">
          Maksimal {keys.max} key. Bot memakai key bergantian, dan kalau satu key kena batas atau ditolak, otomatis pindah ke key berikutnya.
          Batas pemakaian dihitung per proyek Google, jadi buat tiap key di proyek yang berbeda di Google AI Studio supaya kuotanya terpisah.
        </p>
        {keys.keys.length === 0 ? (
          <p className="muted">Belum ada key.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px" }}>
            {keys.keys.map((k) => (
              <li key={k.slot} className="keyitem">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>
                    <code>#{k.slot} {k.mask}</code>{" "}
                    <span className={"badge " + (k.state ? "bad" : "ok")}>{keyLabel(k)}</span>
                  </span>
                  <button className="btn ghost" onClick={() => run(() => api("/api/admin/keys", { action: "remove", slot: k.slot }), "Key dihapus.")}>Hapus</button>
                </div>
                <p className="muted small">
                  Berhasil {k.ok} · Gagal {k.fail} · Hari ini {k.today} permintaan (WIB) · Terakhir dipakai {ago(k.last)}
                </p>
                {k.err && <p className="muted small">Error terakhir ({ago(k.errAt)}): {k.err}</p>}
              </li>
            ))}
          </ul>
        )}
        {keys.keys.length < keys.max && (
          <>
            <div className="field">
              <label htmlFor="gk">Tambah key</label>
              <input id="gk" type="password" value={newKey} onChange={(e) => setNewKey(e.target.value)} autoComplete="off" placeholder="AIza…" />
            </div>
            <div className="row">
              <button className="btn" disabled={!newKey.trim()}
                onClick={() => run(async () => { await api("/api/admin/keys", { action: "add", key: newKey }); setNewKey(""); }, "Key ditambahkan.")}>
                Tambah key
              </button>
              {keys.keys.some((k) => k.state) && (
                <button className="btn ghost" onClick={() => run(() => api("/api/admin/keys", { action: "reset" }), "Status key direset.")}>Reset status key</button>
              )}
            </div>
          </>
        )}
        {keys.keys.length >= keys.max && keys.keys.some((k) => k.state) && (
          <button className="btn ghost" onClick={() => run(() => api("/api/admin/keys", { action: "reset" }), "Status key direset.")}>Reset status key</button>
        )}
      </section>

      <section className="card">
        <h2>Perilaku AI</h2>
        <div className="field">
          <label htmlFor="md">Model Gemini</label>
          <input id="md" list="models" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} autoComplete="off" />
          <datalist id="models">
            <option value="gemini-3.1-flash-lite" />
            <option value="gemini-3.8-flash" />
          </datalist>
          <p className="muted" style={{ margin: "6px 0 0" }}>Kalau tes bilang model tidak ditemukan, cek nama model terbaru di ai.google.dev.</p>
        </div>
        <div className="field">
          <label htmlFor="sp">System prompt</label>
          <textarea id="sp" value={ai.systemPrompt} onChange={(e) => setAi({ ...ai, systemPrompt: e.target.value })} maxLength={4000} />
          <p className="muted" style={{ margin: "6px 0 0" }}>Instruksi tetap untuk AI: peran, gaya bahasa, batasan topik.</p>
        </div>
        <div className="field">
          <label htmlFor="hl">Riwayat chat (jumlah tanya-jawab yang diingat, 0 sampai 20)</label>
          <input id="hl" type="number" min={0} max={20} value={ai.historyLimit}
            onChange={(e) => setAi({ ...ai, historyLimit: e.target.value })} />
          <p className="muted" style={{ margin: "6px 0 0" }}>Pengguna bisa menghapus riwayatnya sendiri dengan mengetik /reset. Riwayat hilang otomatis setelah 7 hari tanpa percakapan.</p>
        </div>
        <div className="field">
          <label htmlFor="fb">Pesan cadangan</label>
          <textarea id="fb" style={{ minHeight: 70 }} value={ai.fallbackText} onChange={(e) => setAi({ ...ai, fallbackText: e.target.value })} maxLength={500} />
          <p className="muted" style={{ margin: "6px 0 0" }}>Dikirim ke pengguna kalau Gemini gagal menjawab (semua key kena batas, error, atau tidak ada key).</p>
        </div>
        <button className="btn"
          onClick={() => run(() => api("/api/admin/settings", {
            model: ai.model, systemPrompt: ai.systemPrompt, fallbackText: ai.fallbackText, historyLimit: Number(ai.historyLimit),
          }), "Pengaturan AI disimpan.")}>
          Simpan pengaturan AI
        </button>
      </section>

      <section className="card">
        <h2>Batas pesan per pengguna</h2>
        <p className="muted">
          Membatasi berapa pesan yang boleh dikirim satu pengguna dalam rentang waktu tertentu, supaya kuota key tidak habis oleh satu orang.
          Perintah /start dan /reset tidak dihitung. Isi 0 pada jumlah pesan untuk mematikan batas.
        </p>
        <div className="row">
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="lc">Jumlah pesan</label>
            <input id="lc" type="number" min={0} max={1000} value={lim.limitCount}
              onChange={(e) => setLim({ ...lim, limitCount: e.target.value })} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="lm">Per berapa menit</label>
            <input id="lm" type="number" min={1} max={1440} value={lim.limitMinutes}
              onChange={(e) => setLim({ ...lim, limitMinutes: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="lt">Pesan saat batas tercapai</label>
          <textarea id="lt" style={{ minHeight: 70 }} value={lim.limitText} maxLength={500}
            onChange={(e) => setLim({ ...lim, limitText: e.target.value })} />
          <p className="muted" style={{ margin: "6px 0 0" }}><code>{"{sisa}"}</code> diganti sisa waktu tunggu dalam menit. Pesan ini dikirim sekali per rentang waktu, pesan berikutnya dari orang yang sama diabaikan tanpa balasan.</p>
        </div>
        <button className="btn"
          onClick={() => run(() => api("/api/admin/settings", {
            limitCount: Number(lim.limitCount), limitMinutes: Number(lim.limitMinutes), limitText: lim.limitText,
          }), "Batas pesan disimpan.")}>
          Simpan batas pesan
        </button>
      </section>

      <section className="card">
        <h2>Log pesan</h2>
        <p className="muted">
          50 pesan terakhir (maksimal 200 tersimpan, tiap pesan dipotong 300 karakter, hilang otomatis 30 hari setelah pesan terakhir).
          Log berisi isi percakapan pengguna, jadi hapus kalau tidak diperlukan.
        </p>
        <div className="row" style={{ marginBottom: 14 }}>
          <button className="btn ghost" onClick={() => load().catch((e) => note(e.message, true))}>Segarkan</button>
          <button className="btn ghost" disabled={!logs?.length}
            onClick={() => { if (confirm("Hapus semua log pesan?")) run(() => api("/api/admin/logs", { action: "clear" }), "Log dihapus."); }}>
            Hapus semua log
          </button>
        </div>
        {!logs?.length ? <p className="muted">Belum ada pesan.</p> : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {logs.map((l, i) => (
              <li key={l.t + "-" + i} className="logitem">
                <div className="row small muted">
                  <span>{fmtTime(l.t)}</span>
                  <span>{l.name}</span>
                  <span className={"badge " + (l.st === "ok" ? "ok" : "bad")}>{LOG_ST[l.st] || l.st}</span>
                  {l.slot && <span>key #{l.slot}</span>}
                  {l.ms != null && <span>{(l.ms / 1000).toFixed(1)} dtk</span>}
                </div>
                <div className="logtext"><b>Tanya:</b> {l.q}</div>
                <div className="logtext muted"><b>{l.st === "ok" ? "Jawab" : "Keterangan"}:</b> {l.a}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Tes balasan</h2>
        <p className="muted">Mencoba Gemini langsung dari sini, tanpa lewat Telegram. Tes tidak memakai riwayat chat.</p>
        <div className="field">
          <label htmlFor="tm">Pesan uji coba</label>
          <input id="tm" value={testMsg} onChange={(e) => setTestMsg(e.target.value)} maxLength={2000} />
        </div>
        <button className="btn" disabled={testing || !testMsg.trim()} onClick={runTest}>{testing ? "Menunggu jawaban…" : "Kirim tes"}</button>
        {testOut && (
          <div className={"msg " + (testOut.bad ? "bad" : "ok")} style={{ marginTop: 14, whiteSpace: "pre-wrap" }}>{testOut.text}</div>
        )}
      </section>

      <section className="card">
        <h2>Pesan sambutan (/start)</h2>
        <p className="muted">Dikirim saat pengguna menekan Start. <code>{"{nama}"}</code> diganti nama depan pengirim.</p>
        <div className="field">
          <label htmlFor="rp">Teks sambutan</label>
          <textarea id="rp" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1000} />
        </div>
        <button className="btn" onClick={() => run(() => api("/api/admin/settings", { replyText: reply }), "Pesan sambutan disimpan.")}>Simpan sambutan</button>
      </section>
    </>
  );
}
