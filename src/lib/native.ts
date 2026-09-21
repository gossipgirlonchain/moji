/**
 * Detects the iOS shell (ios/, Capacitor). Capacitor injects `window.Capacitor` into every page the
 * shell loads, including the hosted site, so this needs no import from @capacitor/core and the web
 * bundle is untouched. Returns null in Safari, in a home-screen install and on the server.
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

export function nativePlatform(): "ios" | "android" | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  const p = cap.getPlatform?.();
  return p === "ios" || p === "android" ? p : null;
}

export const isNativeApp = () => nativePlatform() !== null;
