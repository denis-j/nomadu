"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const IPHONE_W = 1320;
const IPHONE_H = 2868;

const IPHONE_SIZES = [
  { label: '6.9"', w: 1320, h: 2868 },
  { label: '6.5"', w: 1284, h: 2778 },
  { label: '6.3"', w: 1206, h: 2622 },
  { label: '6.1"', w: 1125, h: 2436 },
] as const;

/* Mockup measurements */
const MK_W = 1022;
const MK_H = 2082;
const SC_L = (52 / MK_W) * 100;
const SC_T = (46 / MK_H) * 100;
const SC_W = (918 / MK_W) * 100;
const SC_H = (1990 / MK_H) * 100;
const SC_RX = (126 / 918) * 100;
const SC_RY = (126 / 1990) * 100;

/* Design tokens */
const T = {
  bg: "#FFF7E8",
  bgWarm: "#FFF4CC",
  bgDark: "#1A1A1A",
  fg: "#000000",
  fgLight: "#FFFFFF",
  accent: "#E8976E",
  muted: "#6B7280",
  mutedLight: "#9CA3AF",
  yellow: "#FFD97A",
  yellowLight: "#FFF4CC",
  yellowMid: "#FFE8A3",
};

const FONT =
  "-apple-system, 'SF Pro Display', 'SF Pro Text', 'Inter', sans-serif";

/* ------------------------------------------------------------------ */
/*  Phone Mockup                                                       */
/* ------------------------------------------------------------------ */

function Phone({
  src,
  alt,
  style,
  className = "",
}: {
  src: string;
  alt: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`relative ${className}`}
      style={{ aspectRatio: `${MK_W}/${MK_H}`, ...style }}
    >
      <img
        src="/mockup.png"
        alt=""
        className="block w-full h-full"
        draggable={false}
      />
      <div
        className="absolute z-10 overflow-hidden"
        style={{
          left: `${SC_L}%`,
          top: `${SC_T}%`,
          width: `${SC_W}%`,
          height: `${SC_H}%`,
          borderRadius: `${SC_RX}% / ${SC_RY}%`,
        }}
      >
        <img
          src={src}
          alt={alt}
          className="block w-full h-full object-cover object-top"
          draggable={false}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Caption                                                            */
/* ------------------------------------------------------------------ */

function Caption({
  label,
  headline,
  light = false,
}: {
  label: string;
  headline: React.ReactNode;
  light?: boolean;
}) {
  return (
    <div style={{ textAlign: "center", fontFamily: FONT }}>
      <div
        style={{
          fontSize: IPHONE_W * 0.028,
          fontWeight: 600,
          color: light ? "rgba(255,255,255,0.6)" : T.muted,
          textTransform: "uppercase",
          letterSpacing: IPHONE_W * 0.003,
          marginBottom: IPHONE_W * 0.015,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: IPHONE_W * 0.09,
          fontWeight: 700,
          lineHeight: 1.0,
          color: light ? T.fgLight : T.fg,
        }}
      >
        {headline}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Decorative Blobs                                                   */
/* ------------------------------------------------------------------ */

function WarmBlob({
  top,
  left,
  size,
  color,
  opacity = 0.4,
}: {
  top: string;
  left: string;
  size: string;
  color: string;
  opacity?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top,
        left,
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        opacity,
        filter: "blur(80px)",
        pointerEvents: "none",
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Slide 1 — Hero                                                     */
/* ------------------------------------------------------------------ */

function Slide1() {
  return (
    <div
      style={{
        width: IPHONE_W,
        height: IPHONE_H,
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(170deg, ${T.bgWarm} 0%, ${T.bg} 40%, #FFF9F0 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: FONT,
      }}
    >
      <WarmBlob
        top="-10%"
        left="-15%"
        size="50%"
        color={T.yellowMid}
        opacity={0.5}
      />
      <WarmBlob
        top="15%"
        left="65%"
        size="35%"
        color={T.yellow}
        opacity={0.3}
      />

      {/* App icon + name */}
      <div
        style={{
          marginTop: IPHONE_H * 0.06,
          display: "flex",
          alignItems: "center",
          gap: 18,
          marginBottom: IPHONE_H * 0.025,
        }}
      >
        <img
          src="/app-icon.png"
          alt="Nomady"
          style={{ width: 72, height: 72, borderRadius: 16 }}
          draggable={false}
        />
        <span style={{ fontSize: 36, fontWeight: 700, color: T.fg }}>
          Nomady
        </span>
      </div>

      <Caption
        label="Travel Tracker"
        headline={
          <>
            Your journey,
            <br />
            mapped.
          </>
        }
      />

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%) translateY(13%)",
          width: "84%",
        }}
      >
        <Phone src="/screenshots/map.png" alt="Map view" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide 2 — Auto-tracking                                            */
/* ------------------------------------------------------------------ */

function Slide2() {
  return (
    <div
      style={{
        width: IPHONE_W,
        height: IPHONE_H,
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(180deg, #FFFDF5 0%, ${T.bg} 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: FONT,
      }}
    >
      <WarmBlob
        top="5%"
        left="60%"
        size="40%"
        color={T.yellowLight}
        opacity={0.6}
      />
      <WarmBlob
        top="50%"
        left="-10%"
        size="30%"
        color={T.yellowMid}
        opacity={0.3}
      />

      <div style={{ marginTop: IPHONE_H * 0.08 }}>
        <Caption
          label="Automatic"
          headline={
            <>
              Travels track
              <br />
              themselves.
            </>
          }
        />
      </div>

      {/* Two phones layered */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "68%",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "-6%",
            bottom: "-8%",
            width: "65%",
            transform: "rotate(-5deg)",
            opacity: 0.5,
          }}
        >
          <Phone src="/screenshots/map.png" alt="Map view" />
        </div>
        <div
          style={{
            position: "absolute",
            right: "-3%",
            bottom: "-10%",
            width: "82%",
          }}
        >
          <Phone src="/screenshots/timeline.png" alt="Timeline" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide 3 — Stats                                                    */
/* ------------------------------------------------------------------ */

function Slide3() {
  return (
    <div
      style={{
        width: IPHONE_W,
        height: IPHONE_H,
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(165deg, ${T.bg} 0%, #FFF9F0 50%, ${T.bgWarm} 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: FONT,
      }}
    >
      <WarmBlob
        top="-5%"
        left="50%"
        size="45%"
        color={T.yellow}
        opacity={0.35}
      />
      <WarmBlob
        top="60%"
        left="-15%"
        size="40%"
        color={T.yellowMid}
        opacity={0.4}
      />

      <div style={{ marginTop: IPHONE_H * 0.08 }}>
        <Caption
          label="Statistics"
          headline={
            <>
              Every city.
              <br />
              Every country.
            </>
          }
        />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%) translateY(12%)",
          width: "84%",
        }}
      >
        <Phone src="/screenshots/stats.png" alt="Stats" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide 4 — City Detail                                              */
/* ------------------------------------------------------------------ */

function Slide4() {
  return (
    <div
      style={{
        width: IPHONE_W,
        height: IPHONE_H,
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(180deg, #FFFCF2 0%, #FFF5DC 60%, ${T.yellowLight} 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: FONT,
      }}
    >
      <WarmBlob
        top="10%"
        left="-10%"
        size="35%"
        color={T.yellow}
        opacity={0.4}
      />
      <WarmBlob
        top="40%"
        left="70%"
        size="30%"
        color={T.accent}
        opacity={0.15}
      />

      <div style={{ marginTop: IPHONE_H * 0.08 }}>
        <Caption
          label="Trip Details"
          headline={
            <>
              Relive every
              <br />
              trip.
            </>
          }
        />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-42%) translateY(14%)",
          width: "86%",
        }}
      >
        <Phone src="/screenshots/details.png" alt="City detail" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide 5 — Privacy (dark contrast slide)                            */
/* ------------------------------------------------------------------ */

function Slide5() {
  return (
    <div
      style={{
        width: IPHONE_W,
        height: IPHONE_H,
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(175deg, ${T.bgDark} 0%, #111111 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "80%",
          height: "40%",
          borderRadius: "50%",
          background: T.accent,
          opacity: 0.06,
          filter: "blur(120px)",
        }}
      />

      <div style={{ marginTop: IPHONE_H * 0.08 }}>
        <Caption
          label="Your data"
          headline={
            <>
              Private by
              <br />
              design.
            </>
          }
          light
        />
      </div>

      <p
        style={{
          fontSize: IPHONE_W * 0.032,
          color: "rgba(255,255,255,0.5)",
          textAlign: "center",
          maxWidth: "75%",
          lineHeight: 1.5,
          marginTop: IPHONE_H * 0.025,
          fontFamily: FONT,
        }}
      >
        All your travel data stays on your device.
        <br />
        No tracking. No cloud. Just yours.
      </p>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%) translateY(13%)",
          width: "82%",
        }}
      >
        <Phone src="/screenshots/timeline.png" alt="Timeline" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide 6 — More Features                                            */
/* ------------------------------------------------------------------ */

function FeaturePill({ icon, text }: { icon: string; text: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "16px 24px",
        borderRadius: 100,
        background: "rgba(0,0,0,0.06)",
        fontSize: IPHONE_W * 0.03,
        fontWeight: 500,
        color: T.fg,
        fontFamily: FONT,
      }}
    >
      <span style={{ fontSize: IPHONE_W * 0.035 }}>{icon}</span>
      {text}
    </div>
  );
}

function Slide6() {
  const features = [
    { icon: "📍", text: "Auto city detection" },
    { icon: "🗺️", text: "Interactive travel map" },
    { icon: "📊", text: "Country statistics" },
    { icon: "🏳️", text: "Flag collection" },
    { icon: "⏱️", text: "Trip timeline" },
    { icon: "🔒", text: "On-device storage" },
  ];

  const comingSoon = [
    { icon: "✈️", text: "Flight tracking" },
    { icon: "🌍", text: "Visa calculator" },
  ];

  return (
    <div
      style={{
        width: IPHONE_W,
        height: IPHONE_H,
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(170deg, ${T.bgWarm} 0%, ${T.bg} 50%, #FFFDF5 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: FONT,
      }}
    >
      <WarmBlob
        top="20%"
        left="-10%"
        size="40%"
        color={T.yellow}
        opacity={0.35}
      />
      <WarmBlob
        top="55%"
        left="60%"
        size="35%"
        color={T.yellowMid}
        opacity={0.3}
      />

      <img
        src="/app-icon.png"
        alt="Nomady"
        style={{
          width: 100,
          height: 100,
          borderRadius: 24,
          marginTop: IPHONE_H * 0.08,
          marginBottom: IPHONE_H * 0.02,
          boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
        }}
        draggable={false}
      />

      <Caption
        label="Nomady"
        headline={
          <>
            And so much
            <br />
            more.
          </>
        }
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 14,
          maxWidth: "85%",
          marginTop: IPHONE_H * 0.045,
        }}
      >
        {features.map((f) => (
          <FeaturePill key={f.text} icon={f.icon} text={f.text} />
        ))}
      </div>

      <div style={{ marginTop: IPHONE_H * 0.04, textAlign: "center" }}>
        <p
          style={{
            fontSize: IPHONE_W * 0.025,
            fontWeight: 600,
            color: T.mutedLight,
            textTransform: "uppercase",
            letterSpacing: IPHONE_W * 0.003,
            marginBottom: 16,
            fontFamily: FONT,
          }}
        >
          Coming Soon
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 14,
          }}
        >
          {comingSoon.map((f) => (
            <FeaturePill key={f.text} icon={f.icon} text={f.text} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide Registry                                                     */
/* ------------------------------------------------------------------ */

const IPHONE_SCREENSHOTS = [
  { id: "hero", label: "Hero", Component: Slide1 },
  { id: "auto-track", label: "Auto-tracking", Component: Slide2 },
  { id: "stats", label: "Stats", Component: Slide3 },
  { id: "detail", label: "Trip Detail", Component: Slide4 },
  { id: "privacy", label: "Privacy", Component: Slide5 },
  { id: "more", label: "More Features", Component: Slide6 },
];

/* ------------------------------------------------------------------ */
/*  Preview with ResizeObserver                                        */
/* ------------------------------------------------------------------ */

function ScreenshotPreview({
  id,
  label,
  Component,
  onExport,
  exportRef,
}: {
  id: string;
  label: string;
  Component: React.FC;
  onExport: (id: string) => void;
  exportRef: (id: string, el: HTMLDivElement | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.15);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const containerW = entry.contentRect.width;
        setScale(containerW / IPHONE_W);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="group flex flex-col gap-2">
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50 cursor-pointer"
        style={{ aspectRatio: `${IPHONE_W}/${IPHONE_H}` }}
        onClick={() => onExport(id)}
      >
        <div
          style={{
            width: IPHONE_W,
            height: IPHONE_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <Component />
        </div>

        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="bg-white text-black px-4 py-2 rounded-full text-sm font-medium shadow-lg">
            Export PNG
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-500 text-center">{label}</p>

      {/* Offscreen export element */}
      <div
        ref={(el) => exportRef(id, el)}
        style={{
          position: "absolute",
          left: -9999,
          top: 0,
          width: IPHONE_W,
          height: IPHONE_H,
          fontFamily: FONT,
        }}
      >
        <Component />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function ScreenshotsPage() {
  const [sizeIdx, setSizeIdx] = useState(0);
  const [exporting, setExporting] = useState(false);
  const exportRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const setExportRef = useCallback(
    (id: string, el: HTMLDivElement | null) => {
      exportRefs.current[id] = el;
    },
    []
  );

  const selectedSize = IPHONE_SIZES[sizeIdx];

  const exportSingle = useCallback(
    async (id: string) => {
      const el = exportRefs.current[id];
      if (!el || exporting) return;

      setExporting(true);
      try {
        el.style.left = "0px";
        el.style.opacity = "1";
        el.style.zIndex = "-1";

        const opts = {
          width: IPHONE_W,
          height: IPHONE_H,
          pixelRatio: 1,
          cacheBust: true,
        };

        await toPng(el, opts);
        const dataUrl = await toPng(el, opts);

        el.style.left = "-9999px";
        el.style.opacity = "";
        el.style.zIndex = "";

        const img = new Image();
        img.src = dataUrl;
        await new Promise((r) => (img.onload = r));

        const canvas = document.createElement("canvas");
        canvas.width = selectedSize.w;
        canvas.height = selectedSize.h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, selectedSize.w, selectedSize.h);

        const link = document.createElement("a");
        const idx = IPHONE_SCREENSHOTS.findIndex((s) => s.id === id);
        link.download = `${String(idx + 1).padStart(2, "0")}-${id}-${selectedSize.w}x${selectedSize.h}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } finally {
        setExporting(false);
      }
    },
    [exporting, selectedSize]
  );

  const exportAll = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      for (const screenshot of IPHONE_SCREENSHOTS) {
        const el = exportRefs.current[screenshot.id];
        if (!el) continue;

        el.style.left = "0px";
        el.style.opacity = "1";
        el.style.zIndex = "-1";

        const opts = {
          width: IPHONE_W,
          height: IPHONE_H,
          pixelRatio: 1,
          cacheBust: true,
        };

        await toPng(el, opts);
        const dataUrl = await toPng(el, opts);

        el.style.left = "-9999px";
        el.style.opacity = "";
        el.style.zIndex = "";

        const img = new Image();
        img.src = dataUrl;
        await new Promise((r) => (img.onload = r));

        const canvas = document.createElement("canvas");
        canvas.width = selectedSize.w;
        canvas.height = selectedSize.h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, selectedSize.w, selectedSize.h);

        const link = document.createElement("a");
        const idx = IPHONE_SCREENSHOTS.findIndex(
          (s) => s.id === screenshot.id
        );
        link.download = `${String(idx + 1).padStart(2, "0")}-${screenshot.id}-${selectedSize.w}x${selectedSize.h}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();

        await new Promise((r) => setTimeout(r, 300));
      }
    } finally {
      setExporting(false);
    }
  }, [exporting, selectedSize]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Toolbar */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <h1 className="text-lg font-bold">Nomady Screenshots</h1>

        <div className="flex items-center gap-2 ml-auto">
          <select
            value={sizeIdx}
            onChange={(e) => setSizeIdx(Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white"
          >
            {IPHONE_SIZES.map((s, i) => (
              <option key={i} value={i}>
                {s.label} ({s.w}x{s.h})
              </option>
            ))}
          </select>

          <button
            onClick={exportAll}
            disabled={exporting}
            className="px-4 py-1.5 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? "Exporting..." : "Export All"}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {IPHONE_SCREENSHOTS.map((s) => (
            <ScreenshotPreview
              key={s.id}
              id={s.id}
              label={s.label}
              Component={s.Component}
              onExport={exportSingle}
              exportRef={setExportRef}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
