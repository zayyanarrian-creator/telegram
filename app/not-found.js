export const metadata = {
  title: "404 | Halaman tidak ditemukan",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <>
      <header className="topnav">
        <a href="/" aria-label="EMAHAIRSHOP">
          <div className="logo-nav-container">
            <div className="logo-top"><span className="line-top"></span><span className="text-ext">EXTENSION</span></div>
            <div className="logo-main">EMAHAIRSHOP</div>
            <div className="line-bottom"></div>
            <div className="logo-year">2019</div>
          </div>
        </a>
      </header>
      <main className="wrap nf">
        <p className="nf-code" aria-hidden="true">404</p>
        <h1>Halaman tidak ditemukan</h1>
        <p className="muted">Alamat yang kamu buka tidak ada atau sudah dipindahkan.</p>
        <div className="row">
          <a className="btn" href="/">Ke beranda</a>
          <a className="btn ghost" href="https://shop.emahairshop.com/">Buka toko</a>
        </div>
      </main>
    </>
  );
}
