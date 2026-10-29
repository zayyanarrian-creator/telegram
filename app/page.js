import { redis } from "@/lib/server";
import HomeView from "./HomeView";
export const dynamic = "force-dynamic";

async function getUsername() {
  try { return await redis.hget("cfg:bot", "username"); } catch { return null; }
}

export default async function Home() {
  const username = await getUsername();
  const link = username ? `https://t.me/${username}` : null;
  return <HomeView link={link} />;
}
