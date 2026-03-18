import { APP_NAME, COMPANY, CONTACT_EMAIL } from "./legal-shared";

export const metadata = {
  title: "Nomady — Track your journey",
  description:
    "Nomady is the travel companion for digital nomads. Track trips, stay visa-compliant, and plan smarter with AI.",
};

const FONT =
  "-apple-system, 'SF Pro Display', 'SF Pro Text', 'Inter', sans-serif";

const FEATURES = [
  {
    icon: "🗺️",
    title: "Travel Map",
    desc: "See every country and city you've visited on an interactive map.",
  },
  {
    icon: "⏱️",
    title: "Trip Timeline",
    desc: "A chronological log of everywhere you've been, automatically organized.",
  },
  {
    icon: "🤖",
    title: "AI Trip Planning",
    desc: "Get smart next-stop suggestions tailored to your travel history.",
  },
  {
    icon: "🛂",
    title: "Visa Tracker",
    desc: "Know exactly how many days you have left in each country.",
  },
  {
    icon: "💼",
    title: "Tax Residence",
    desc: "Track your days per country to stay on the right side of tax rules.",
  },
  {
    icon: "☁️",
    title: "Cloud Sync",
    desc: "Your data, on all your devices. Or keep it local — your choice.",
  },
];

export default function Home() {
  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: FONT,
        background: "linear-gradient(170deg, #FFF4CC 0%, #FFF9F0 40%, #FFFDF8 100%)",
        color: "#1A1A1A",
      }}
    >
      {/* Nav */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          padding: "16px 32px",
          background: "rgba(255,255,255,0.65)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <img
          src="/app-icon.png"
          alt="Nomady"
          style={{ width: 36, height: 36, borderRadius: 8, marginRight: 10 }}
        />
        <span style={{ fontWeight: 700, fontSize: 18 }}>Nomady</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 28, fontSize: 14, fontWeight: 500 }}>
          {[
            { label: "Privacy Policy", href: "/privacy" },
            { label: "Terms of Service", href: "/terms" },
            { label: "Support", href: "/support" },
          ].map((l) => (
            <a key={l.href} href={l.href} style={{ color: "#555", textDecoration: "none" }}>
              {l.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Hero */}
      <div
        style={{
          maxWidth: 860,
          margin: "0 auto",
          padding: "80px 24px 64px",
          textAlign: "center",
        }}
      >
        <img
          src="/app-icon.png"
          alt="Nomady"
          style={{
            width: 96,
            height: 96,
            borderRadius: 22,
            boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
            marginBottom: 28,
            display: "block",
            margin: "0 auto 28px",
          }}
        />
        <h1
          style={{
            fontSize: "clamp(36px, 6vw, 64px)",
            fontWeight: 800,
            lineHeight: 1.05,
            margin: "0 0 20px",
            letterSpacing: -1,
          }}
        >
          Your journey,
          <br />
          <span style={{ color: "#B8860B" }}>mapped.</span>
        </h1>
        <p
          style={{
            fontSize: "clamp(16px, 2.5vw, 20px)",
            color: "#555",
            maxWidth: 520,
            margin: "0 auto 36px",
            lineHeight: 1.6,
          }}
        >
          The travel companion for digital nomads. Track trips, stay visa-compliant,
          and plan smarter with AI.
        </p>
        <a
          href="https://apps.apple.com/app/nomady/id000000000"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "#1A1A1A",
            color: "#fff",
            padding: "14px 28px",
            borderRadius: 14,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 16,
            boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          Download on the App Store
        </a>
      </div>

      {/* Features */}
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "0 24px 80px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 20,
        }}
      >
        {FEATURES.map((f) => (
          <div
            key={f.title}
            style={{
              background: "rgba(255,255,255,0.7)",
              borderRadius: 16,
              padding: "24px 22px",
              border: "1px solid rgba(0,0,0,0.06)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>{f.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{f.title}</div>
            <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: "1px solid rgba(0,0,0,0.06)",
          padding: "24px 32px",
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 13,
          color: "#999",
          background: "rgba(255,255,255,0.4)",
        }}
      >
        <span>© {new Date().getFullYear()} {COMPANY} · All rights reserved</span>
        <div style={{ display: "flex", gap: 20 }}>
          {[
            { label: "Privacy Policy", href: "/privacy" },
            { label: "Terms of Service", href: "/terms" },
            { label: "Support", href: "/support" },
            { label: `Contact: ${CONTACT_EMAIL}`, href: `mailto:${CONTACT_EMAIL}` },
          ].map((l) => (
            <a key={l.href} href={l.href} style={{ color: "#999", textDecoration: "none" }}>
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
