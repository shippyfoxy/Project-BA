import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon: the Pulse mark on the site's dark background.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0d10" }}>
        <svg width="140" height="140" viewBox="0 0 28 28">
          <rect x="1" y="1" width="26" height="26" rx="7" fill="#4a8be8" transform="rotate(-6 14 14)" />
          <polyline points="5,15 9,15 11.5,8 15,20 17.5,12 23,12" fill="none" stroke="#0b0d10" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
