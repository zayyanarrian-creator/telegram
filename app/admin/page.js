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

function Dash({ onLogout }) {
  const [cfg, setCfg] = useState(null);
  const [wh, setWh] = useState(null);
  const [token, setToken] = useState("");
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState(null);
  const note = (text, bad) => setMsg({ text, bad });

  async function load() {
    const c = await api("/api/admin/settings");
    setCfg(c); setReply(c.replyText);
    if (c.hasToken) setWh(await api("/api/admin/webhook", { action: "status" }).catch(() => null));
    else setWh(null);
  }
  useEffect(() => { load().catch((e) => note(e.message, true)); }, []);

  async function run(fn, okText) {
    setMsg(null);
    try { await fn(); note(okText); await load(); } catch (e) { note(e.message, true); }
  }

  if (!cfg) return <p className="muted">Memuat…</p>;

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
        <h2>Balasan sementara</h2>
        <p className="muted">Dipakai sampai fitur Gemini ditambahkan. <code>{"{nama}"}</code> diganti nama depan pengirim.</p>
        <div className="field">
          <label htmlFor="rp">Teks balasan</label>
          <textarea id="rp" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1000} />
        </div>
        <button className="btn" onClick={() => run(() => api("/api/admin/settings", { replyText: reply }), "Balasan disimpan.")}>Simpan balasan</button>
      </section>
    </>
  );
}
