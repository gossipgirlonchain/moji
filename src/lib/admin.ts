import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "moji_admin";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "";

export const ADMIN_ENABLED = Boolean(PASSWORD);

function token(): string {
  return createHmac("sha256", PASSWORD).update("moji-admin-v1").digest("hex");
}

export function checkPassword(input: string): boolean {
  if (!PASSWORD || !input) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminToken(): string {
  return token();
}

export async function isAdmin(): Promise<boolean> {
  if (!PASSWORD) return false;
  const c = (await cookies()).get(ADMIN_COOKIE)?.value ?? "";
  const t = token();
  return c.length === t.length && timingSafeEqual(Buffer.from(c), Buffer.from(t));
}
