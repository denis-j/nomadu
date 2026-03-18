import { LegalLayout, Section, P, UL, SUPPORT_EMAIL, APP_NAME } from "../legal-shared";

export const metadata = {
  title: "Support – Nomady",
  description: "Get help with Nomady.",
};

export default function Support() {
  return (
    <LegalLayout
      title="Support"
      subtitle="We're here to help. Most issues can be resolved in minutes."
    >
      <Section title="Contact Us">
        <P>
          Email us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "#B8860B" }}>
            {SUPPORT_EMAIL}
          </a>{" "}
          and we'll get back to you within 1–2 business days.
        </P>
        <P>
          Please include your iOS version, {APP_NAME} version (Settings → About), and a
          description of the issue.
        </P>
      </Section>

      <Section title="Frequently Asked Questions">
        <P><strong>How do I cancel my subscription?</strong></P>
        <P>
          Go to iOS Settings → tap your name → Subscriptions → Nomady → Cancel Subscription.
          You'll keep Pro access until the end of the current billing period.
        </P>

        <P><strong>Can I get a refund?</strong></P>
        <P>
          Refunds are handled by Apple. Visit{" "}
          <a href="https://reportaproblem.apple.com" style={{ color: "#B8860B" }}>
            reportaproblem.apple.com
          </a>{" "}
          and select your purchase.
        </P>

        <P><strong>My trip data is missing — what happened?</strong></P>
        <P>
          If you use local storage (Cloud Sync off), data is stored only on your device.
          Uninstalling the app deletes local data. Enable Cloud Sync in Settings to back up
          your data going forward.
        </P>

        <P><strong>Location isn't being detected correctly.</strong></P>
        <P>
          Make sure location permission is set to "While Using" or "Always" in iOS Settings →
          Nomady → Location. If detection is still off, try toggling the permission off and
          back on.
        </P>

        <P><strong>How accurate are the visa / tax calculations?</strong></P>
        <P>
          The calculations are estimates based on publicly known rules and your entered travel
          data. They are not legal or tax advice. Always verify with official sources or a
          qualified professional.
        </P>

        <P><strong>How do I delete my account and all my data?</strong></P>
        <P>
          Go to Settings → Account → Delete Account. This permanently deletes your account and
          all cloud-stored data. Local data is removed when you uninstall the app.
        </P>
      </Section>

      <Section title="App Version & Device Info">
        <P>
          To find your app version: open {APP_NAME} → Settings → scroll to the bottom. Include
          this when contacting support.
        </P>
      </Section>
    </LegalLayout>
  );
}
