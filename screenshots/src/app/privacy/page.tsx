import { LegalLayout, Section, P, UL, CONTACT_EMAIL, EFFECTIVE_DATE, APP_NAME, COMPANY } from "../legal-shared";

export const metadata = {
  title: "Privacy Policy – Nomadu",
  description: "How Nomadu collects, uses, and protects your personal data.",
};

export default function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle={`Effective date: ${EFFECTIVE_DATE}. Last updated: ${EFFECTIVE_DATE}.`}
    >
      <Section title="Overview">
        <P>
          {APP_NAME} ("we", "our", or "us") is operated by {COMPANY}, a US limited liability
          company. This Privacy Policy explains what information we collect when you use the
          Nomadu app, how we use it, and the choices you have.
        </P>
        <P>
          By using Nomadu, you agree to the collection and use of information described in this
          policy. If you do not agree, please stop using the app.
        </P>
      </Section>

      <Section title="Information We Collect">
        <P><strong>Information you provide directly:</strong></P>
        <UL
          items={[
            "Email address and password (if you register with email)",
            "Citizenship / passport country (used to calculate visa and tax rules)",
            "Trip data you enter manually: cities, countries, dates, transport, notes",
          ]}
        />
        <P><strong>Information collected automatically:</strong></P>
        <UL
          items={[
            "Precise GPS location — only when you grant permission and the app is active. Used to detect the city and country you are currently in and log it to your timeline.",
            "Background location — only if you explicitly grant 'Always' permission. Used to record arrivals and departures without opening the app.",
            "Device information: iOS version, device model (collected by third-party SDKs listed below).",
          ]}
        />
        <P><strong>Information we do NOT collect:</strong></P>
        <UL
          items={[
            "We do not collect payment card numbers. Payments are handled entirely by Apple's App Store.",
            "We do not build advertising profiles or sell your data to third parties.",
          ]}
        />
      </Section>

      <Section title="How We Use Your Information">
        <UL
          items={[
            "To provide the core app features: map, timeline, visa tracker, tax residence tracker, AI trip suggestions.",
            "To sync your data across your devices (only if you enable Cloud Sync in Settings).",
            "To calculate visa days remaining and tax residence thresholds based on your travel history and citizenship.",
            "To generate AI-powered destination suggestions via Google Gemini (your itinerary is sent to Google's API — no identifying information is included).",
            "To process your subscription via RevenueCat and Apple's In-App Purchase system.",
            "To send you important account notifications (e.g. password reset).",
          ]}
        />
      </Section>

      <Section title="Data Storage & Cloud Sync">
        <P>
          By default, all your trip data is stored <strong>locally on your device</strong> using
          SQLite. It never leaves your device unless you explicitly enable Cloud Sync.
        </P>
        <P>
          If you enable Cloud Sync, your data is stored in <strong>Google Cloud Firestore</strong>,
          encrypted in transit (TLS) and at rest. Your data is associated with your user account
          and is not accessible to other users.
        </P>
        <P>
          You can disable Cloud Sync and delete all cloud data at any time from Settings → Account.
        </P>
      </Section>

      <Section title="Third-Party Services">
        <P>Nomadu uses the following third-party services, each with its own privacy policy:</P>
        <UL
          items={[
            <><strong>Firebase (Google)</strong> — authentication, optional cloud storage. <a href="https://firebase.google.com/support/privacy" style={{ color: "#B8860B" }}>Privacy Policy</a></>,
            <><strong>RevenueCat</strong> — subscription management. <a href="https://www.revenuecat.com/privacy" style={{ color: "#B8860B" }}>Privacy Policy</a></>,
            <><strong>Google Gemini API</strong> — AI destination suggestions. Your trip itinerary (cities, dates) is sent to Google's API. No name, email, or device identifiers are included. <a href="https://policies.google.com/privacy" style={{ color: "#B8860B" }}>Privacy Policy</a></>,
            <><strong>Apple Sign In / Google Sign In</strong> — OAuth authentication. We receive only your email and a unique user identifier.</>,
          ]}
        />
      </Section>

      <Section title="Location Data">
        <P>
          Location is the most sensitive data Nomadu handles. Here is exactly how we use it:
        </P>
        <UL
          items={[
            "Location is used only to detect and log your current city and country.",
            "Raw GPS coordinates are processed on-device to reverse-geocode a city name. The city name — not the raw coordinates — is what gets stored.",
            "If Cloud Sync is disabled, location data never leaves your device.",
            "If Cloud Sync is enabled, the resolved city/country names are stored in Firestore. Raw GPS coordinates are not stored.",
            "You can revoke location permission at any time in iOS Settings → Nomadu → Location.",
          ]}
        />
      </Section>

      <Section title="Children's Privacy">
        <P>
          Nomadu is not directed to children under 13. We do not knowingly collect personal
          information from children under 13. If you believe a child has provided us with personal
          information, contact us at {CONTACT_EMAIL} and we will delete it.
        </P>
      </Section>

      <Section title="Your Rights">
        <P>You have the right to:</P>
        <UL
          items={[
            "Access — request a copy of your personal data.",
            "Correction — correct inaccurate data.",
            "Deletion — delete your account and all associated data from Settings → Account → Delete Account. Cloud data is deleted immediately. Local data is deleted when you uninstall the app.",
            "Portability — export your trip data (coming soon).",
            "Opt-out — disable Cloud Sync at any time in Settings.",
          ]}
        />
        <P>
          California residents (CCPA): you have the right to know what personal information is
          collected and to request deletion. We do not sell personal information.
        </P>
        <P>
          EU/UK residents (GDPR): our legal basis for processing is your consent (location) and
          contract performance (account, subscriptions). You may withdraw consent at any time.
        </P>
      </Section>

      <Section title="Data Retention">
        <P>
          We retain your account data for as long as your account is active. If you delete your
          account, all data is permanently deleted within 30 days. Anonymous analytics (if any)
          are retained for up to 2 years.
        </P>
      </Section>

      <Section title="Security">
        <P>
          We use industry-standard measures including TLS encryption in transit, Firebase
          Security Rules restricting access to your own data, and hashed passwords (via Firebase
          Auth). No system is 100% secure — please use a strong, unique password.
        </P>
      </Section>

      <Section title="Changes to This Policy">
        <P>
          We may update this policy from time to time. If we make material changes, we will notify
          you via the app or by email at least 7 days before they take effect. Continued use of
          the app after that date constitutes acceptance of the updated policy.
        </P>
      </Section>

      <Section title="Contact">
        <P>
          Questions? Email us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#B8860B" }}>
            {CONTACT_EMAIL}
          </a>
          .
        </P>
        <P>{COMPANY}</P>
      </Section>
    </LegalLayout>
  );
}
