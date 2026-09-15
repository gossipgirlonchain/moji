import "server-only";
import { isAdmin } from "@/lib/admin";

/**
 * Drops are in testing: every drops surface (manage page, public card, APIs) is gated behind the admin
 * cookie. Flip this to `true` (or to a per-creator whitelist) to open it up.
 */
export async function dropsEnabled(): Promise<boolean> {
  return isAdmin();
}
