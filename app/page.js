import { redis } from "@/lib/server";
export const dynamic = "force-dynamic";

async function getUsername() {
  try { return await redis.hget("cfg:bot", "username"); } catch { return null; }
}

export default async function Home() {
  const username = await getUsername();
  const link = username ? `https://t.me/${username}` : null;

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
      </header>

      <main className="wrap">
        <section className="hero">
          <h1>Tanya produk hair extension kami, dijawab saat itu juga.</h1>
          <p>Supplier &amp; manufaktur human hair Remy 100% asal Indonesia sejak 2019. Chat bot EMAHAIRSHOP di Telegram untuk tanya katalog, harga grosir, dan stok weft, tape-in, nano ring, genius weft, keratin, bulk hair, hingga wig &mdash; tanpa perlu menunggu admin online.</p>
          <div className="row">
            {link ? (
              <a className="btn" href={link} target="_blank" rel="noopener noreferrer">Chat di Telegram</a>
            ) : (
              <span className="btn off">Bot belum aktif</span>
            )}
            <a className="btn ghost" href="https://shop.emahairshop.com/" target="_blank" rel="noopener noreferrer">Shop Wholesale</a>
          </div>
        </section>

        <section className="feat">
          <div className="card"><h2>Tanya produk kapan saja</h2><p className="muted">Tanya jenis hair extension, warna, panjang, hingga harga grosir, langsung dijawab tanpa antre.</p></div>
          <div className="card"><h2>Aktif 24 jam</h2><p className="muted">Berjalan di server cloud, siap menjawab calon reseller dan salon dari mana pun dan kapan pun.</p></div>
          <div className="card"><h2>Terhubung ke katalog resmi</h2><p className="muted">Jawaban bot mengacu pada info produk dan kebijakan EMAHAIRSHOP, diatur dari halaman admin.</p></div>
        </section>

        <section>
          <h2>Cara memakai</h2>
          <ol className="steps">
            <li>Pilih Chat di Telegram.</li>
            <li>Tekan Start di percakapan bot EMAHAIRSHOP.</li>
            <li>Kirim pertanyaan seputar produk, harga grosir, atau stok hair extension.</li>
          </ol>
        </section>
      </main>
    </>
  );
}
