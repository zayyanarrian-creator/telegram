import "./globals.css";

export const metadata = {
  title: "Bot Telegram",
  description: "Bot Telegram yang membalas pesan otomatis.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
