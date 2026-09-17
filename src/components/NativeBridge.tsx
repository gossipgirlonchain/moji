"use client";

import { useEffect } from "react";
import { nativePlatform } from "@/lib/native";

/** Sets `<html data-native="ios">` inside the Capacitor shell so CSS and components can adapt (see globals.css). */
export function NativeBridge() {
  useEffect(() => {
    const platform = nativePlatform();
    if (platform) document.documentElement.dataset.native = platform;
  }, []);
  return null;
}
