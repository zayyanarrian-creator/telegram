import { redis } from "@/lib/server";
export const dynamic = "force-dynamic";

async function getUsername() {
  try { return await redis.hget("cfg:bot", "username"); } catch { return null; }
}

export default async function Home() {
  const username = await getUsername();
  const link = username ? `https://t.me/${username}` : null;

  return (
    <main className="wrap">
      <section className="hero">
        <h1>Tanya apa saja, bot menjawab saat itu juga.</h1>
        <p>Kirim pesan lewat Telegram. Tidak perlu menunggu admin online.</p>
        <div className="row">
          {link ? (
            <a className="btn" href={link} target="_blank" rel="noopener noreferrer">Chat di Telegram</a>
          ) : (
            <span className="btn off">Bot belum aktif</span>
          )}
        </div>
      </section>

      <section className="feat">
        <div className="card"><h2>Balas otomatis</h2><p className="muted">Setiap pesan yang masuk langsung dijawab tanpa antre.</p></div>
        <div className="card"><h2>Aktif 24 jam</h2><p className="muted">Berjalan di server cloud, tidak bergantung pada komputer yang menyala.</p></div>
        <div className="card"><h2>Mudah diatur</h2><p className="muted">Isi balasan diubah dari halaman admin, tanpa menyentuh kode.</p></div>
      </section>

      <section>
        <h2>Cara memakai</h2>
        <ol className="steps">
          <li>Pilih Chat di Telegram.</li>
          <li>Tekan Start di percakapan bot.</li>
          <li>Kirim pertanyaanmu.</li>
        </ol>
      </section>
    </main>
  );
}
