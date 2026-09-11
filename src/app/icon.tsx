import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Favicon: the moji wordmark on a sky clay circle. */
export default async function Icon() {
  const buf = await readFile(path.join(process.cwd(), "public", "moji.png"));
  const src = `data:image/png;base64,${buf.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
        <div style={{ width: 64, height: 64, borderRadius: 9999, background: "linear-gradient(145deg, #F2FAFF 0%, #C3E3F8 60%, #9BD2F4 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src={src} width={50} height={26} alt="" style={{ objectFit: "contain" }} />
        </div>
      </div>
    ),
    size,
  );
}
