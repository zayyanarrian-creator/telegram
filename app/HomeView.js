"use client";
import { useEffect, useRef, useState } from "react";
import { FL, LN, T } from "./lang";

const KEY = "lang";

export default function HomeView({ link }) {
  const [lg, setLg] = useState("id");
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const t = T[lg];

  // Bahasa awal: pilihan tersimpan (sama dengan portal), kalau belum ada ikut bahasa browser.
  useEffect(() => {
    let l = null;
    try { l = localStorage.getItem(KEY); } catch {}
    if (!l) l = (navigator.language || "id").slice(0, 2);
    if (T[l]) setLg(l);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lg;
    document.documentElement.dir = lg === "ar" ? "rtl" : "ltr";
    document.title = t.title;
  }, [lg, t]);

  useEffect(() => {
    const close = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, []);

  function pick(l) {
    setLg(l);
    setOpen(false);
    try { localStorage.setItem(KEY, l); } catch {}
  }

  return (
    <>
      <header className="topnav">
        <a href="https://emahairshop.com" target="_blank" rel="noopener noreferrer" aria-label="EMAHAIRSHOP">
          <div className="logo-nav-container">
            <div className="logo-top"><span className="line-top"></span><span className="text-ext">EXTENSION</span></div>
            <div className="logo-main">EMAHAIRSHOP</div>
            <div className="line-bottom"></div>
            <div className="logo-year">2019</div>
          </div>
        </a>

        <div className={`lw${open ? " o" : ""}`} ref={wrap}>
          <button
            className="lb" type="button" aria-label={t.lang} aria-haspopup="true" aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="fl" dangerouslySetInnerHTML={{ __html: FL[lg] }} />
            <span className="lc">{lg.toUpperCase()}</span>
            <svg className="c" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <div className="lm" role="menu">
            {Object.keys(LN).map((k) => (
              <button key={k} type="button" role="menuitem" className={k === lg ? "a" : ""} onClick={() => pick(k)} tabIndex={open ? 0 : -1}>
                <span className="fl" dangerouslySetInnerHTML={{ __html: FL[k] }} />
                {LN[k]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <h1>{t.h1}</h1>
          <p>{t.p}</p>
          <div className="row">
            {link ? (
              <a className="btn" href={link} target="_blank" rel="noopener noreferrer">{t.chat}</a>
            ) : (
              <span className="btn off">{t.off}</span>
            )}
            <a className="btn ghost" href="https://shop.emahairshop.com/" target="_blank" rel="noopener noreferrer">{t.shop}</a>
          </div>
        </section>

        <section>
          <h2>{t.how}</h2>
          <ol className="steps">
            <li>{t.s1}</li>
            <li>{t.s2}</li>
            <li>{t.s3}</li>
          </ol>
        </section>

        <section className="feat">
          <div className="card"><h2>{t.f1t}</h2><p className="muted">{t.f1d}</p></div>
          <div className="card"><h2>{t.f2t}</h2><p className="muted">{t.f2d}</p></div>
          <div className="card"><h2>{t.f3t}</h2><p className="muted">{t.f3d}</p></div>
        </section>

      </main>

      <footer className="foot">
        <div className="foot-in">
          <p className="foot-tag">{t.ft1}</p>
          <p className="foot-copy">{t.ft2}</p>
        </div>
      </footer>
    </>
  );
}
