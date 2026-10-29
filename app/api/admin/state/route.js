import { redis, isLoggedIn, json, fail } from "@/lib/server";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const hash = await redis.get("cfg:passhash");
    return json({
      setup: !!hash,
      loggedIn: await isLoggedIn(),
      needsCode: !!process.env.SETUP_CODE,
    });
  } catch {
    return fail("Database belum terhubung. Pasang Upstash Redis dari Vercel Marketplace, lalu deploy ulang.", 500);
  }
}
