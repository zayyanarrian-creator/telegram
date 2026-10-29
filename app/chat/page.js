"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import s from "./chat.module.css";

const SID_KEY = "chat_sid";
const MSG_KEY = "chat_msgs";
const KEEP = 40;
const MAX = 2000;

const newSid = () =>
  globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36) + "xx";

function load() {
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid) { sid = newSid(); localStorage.setItem(SID_KEY, sid); }
    const raw = JSON.parse(localStorage.getItem(MSG_KEY) || "[]");
    const msgs = (Array.isArray(raw) ? raw : []).filter(
      (m) => m && (m.role === "user" || m.role === "bot") && typeof m.text === "string"
    );
    return { sid, msgs };
  } catch {
    return { sid: newSid(), msgs: [] };
  }
}

const post = (body, signal) =>
  fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });

export default function Chat() {
  const [ready, setReady] = useState(false);
  const [sid, setSid] = useState("");
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const d = load();
    setSid(d.sid);
    setMsgs(d.msgs);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(MSG_KEY, JSON.stringify(msgs.filter((m) => m.role !== "err").slice(-KEEP)));
    } catch {}
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy, ready]);

  const fit = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  async function send() {
    const q = text.trim();
    if (!q || busy || !sid) return;
    setText("");
    requestAnimationFrame(fit);
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await post({ sid, text: q }, AbortSignal.timeout(62000));
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.reply) {
        setMsgs((m) => [...m, { role: "bot", text: j.reply }]);
      } else {
        setMsgs((m) => [...m, { role: "err", text: j.error || "Pesanmu belum terkirim. Coba lagi sebentar lagi ya." }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "err", text: "Tidak bisa terhubung ke server. Periksa koneksi internetmu lalu coba lagi." }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  // Sesi baru selalu berhasil walau permintaan hapus riwayat lama gagal.
  function reset() {
    if (busy) return;
    const old = sid;
    const fresh = newSid();
    setSid(fresh);
    setMsgs([]);
    try { localStorage.setItem(SID_KEY, fresh); } catch {}
    post({ sid: old, action: "reset" }).catch(() => {});
    inputRef.current?.focus();
  }

  return (
    <main className={s.page}>
      <header className={s.head}>
        <div>
          <h1>Chat</h1>
          <p className={`muted ${s.sub}`}>Ngobrol langsung dengan asisten AI. Tidak perlu akun dan tidak perlu Telegram.</p>
        </div>
        <div className="row">
          <Link className="btn ghost" href="/">Beranda</Link>
          <button type="button" className="btn ghost" onClick={reset} disabled={busy || !msgs.length}>
            Percakapan baru
          </button>
        </div>
      </header>

      <div className={s.log} role="log" aria-live="polite" aria-label="Percakapan">
        {ready && !msgs.length && !busy && (
          <div className={s.empty}>
            <b>Mau tanya apa hari ini?</b>
            Tulis pesanmu di kolom bawah lalu tekan Kirim.
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`${s.bubble} ${s[m.role]}`}>{m.text}</div>
        ))}
        {busy && (
          <div className={s.typing}><span className="spin" aria-hidden="true" />Sedang mengetik…</div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className={s.form}
        onSubmit={(e) => { e.preventDefault(); send(); }}
      >
        <label htmlFor="chat-input" className={s.sr}>Pesan</label>
        <textarea
          id="chat-input"
          ref={inputRef}
          rows={1}
          maxLength={MAX}
          value={text}
          placeholder="Tulis pesan…"
          onChange={(e) => { setText(e.target.value); fit(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="submit" className={`btn ${s.send}`} disabled={busy || !text.trim() || !ready}>
          Kirim
        </button>
      </form>
      <p className={s.note}>Jawaban dibuat oleh AI dan bisa keliru. Jangan kirim data pribadi atau rahasia.</p>
    </main>
  );
}
