import React from "react";

export const APP_NAME = "Nomady";
export const COMPANY = "Nomady LLC";
export const CONTACT_EMAIL = "legal@nomady.app";
export const SUPPORT_EMAIL = "support@nomady.app";
export const WEBSITE = "https://nomady.app";
export const EFFECTIVE_DATE = "March 18, 2025";

const FONT =
  "-apple-system, 'SF Pro Display', 'SF Pro Text', 'Inter', sans-serif";

export function LegalLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(170deg, #FFF4CC 0%, #FFF9F0 40%, #FFFDF8 100%)",
        fontFamily: FONT,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "rgba(255,255,255,0.7)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <img
          src="/app-icon.png"
          alt="Nomady"
          style={{ width: 36, height: 36, borderRadius: 8 }}
        />
        <span style={{ fontWeight: 700, fontSize: 18, color: "#1A1A1A" }}>
          {APP_NAME}
        </span>
        <nav style={{ marginLeft: "auto", display: "flex", gap: 24 }}>
          {[
            { label: "Privacy Policy", href: "/privacy" },
            { label: "Terms of Service", href: "/terms" },
            { label: "Support", href: "/support" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              style={{
                fontSize: 14,
                color: "#555",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>

      {/* Hero */}
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "64px 24px 32px",
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 600, color: "#B8860B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
          Legal
        </p>
        <h1 style={{ fontSize: 40, fontWeight: 800, color: "#1A1A1A", margin: "0 0 12px", lineHeight: 1.1 }}>
          {title}
        </h1>
        <p style={{ fontSize: 16, color: "#666", margin: 0 }}>
          {subtitle}
        </p>
        <div style={{ height: 1, background: "rgba(0,0,0,0.08)", margin: "32px 0" }} />
      </div>

      {/* Content */}
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "0 24px 80px",
        }}
      >
        {children}
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: "1px solid rgba(0,0,0,0.06)",
          padding: "24px",
          textAlign: "center",
          fontSize: 13,
          color: "#999",
          background: "rgba(255,255,255,0.4)",
        }}
      >
        © {new Date().getFullYear()} {COMPANY} · All rights reserved ·{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#B8860B", textDecoration: "none" }}>
          {CONTACT_EMAIL}
        </a>
      </div>
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "#1A1A1A",
          margin: "0 0 12px",
          paddingBottom: 8,
          borderBottom: "2px solid #FFE8A3",
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 15, color: "#444", lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 12px" }}>{children}</p>;
}

export function UL({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ margin: "0 0 12px", paddingLeft: 20 }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 6 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}
