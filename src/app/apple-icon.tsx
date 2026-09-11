import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const buf = await readFile(path.join(process.cwd(), "public", "moji.png"));
  const src = `data:image/png;base64,${buf.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg, #F2FAFF 0%, #C3E3F8 60%, #9BD2F4 100%)" }}>
        <img src={src} width={140} height={72} alt="" style={{ objectFit: "contain" }} />
      </div>
    ),
    size,
  );
}
