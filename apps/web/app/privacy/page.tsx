import type { Metadata } from "next";
import StaticPageShell from "../components/StaticPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy | Cake Break",
  description: "How Cake Break collects, uses, and protects your personal data.",
};

export default function PrivacyPage() {
  return (
    <StaticPageShell
      eyebrow="Legal"
      title="Privacy Policy"
      subtitle="A plain-language summary of how we handle your data when you shop with Cake Break."
    >
      <div className="space-y-8 text-sm text-on-surface-variant leading-relaxed max-w-3xl">
        <section className="space-y-2">
          <h2 className="font-headline-md text-lg text-deep-plum">
            What we collect
          </h2>
          <p>
            Account details (name, email), delivery/collection addresses, order
            history, and messages you send via contact or franchise forms. We
            also use essential cookies for store selection, cart, and session
            authentication.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-headline-md text-lg text-deep-plum">
            How we use it
          </h2>
          <p>
            To fulfil orders, contact you about your cakes, improve the
            storefront, and respond to franchise applications. We do not sell
            your personal data.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-headline-md text-lg text-deep-plum">Cookies</h2>
          <p>
            Essential cookies keep your franchise and bakery branch selection
            and shopping cart working. You can choose “Essential only” or
            “Accept all” via the consent banner. Preferences are stored for one
            year.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-headline-md text-lg text-deep-plum">Contact</h2>
          <p>
            For privacy requests, email{" "}
            <a
              href="mailto:hello@cakebreak.co.uk"
              className="text-deep-plum font-semibold underline underline-offset-2"
            >
              hello@cakebreak.co.uk
            </a>{" "}
            or use the{" "}
            <a
              href="/contact"
              className="text-deep-plum font-semibold underline underline-offset-2"
            >
              contact form
            </a>
            .
          </p>
        </section>
      </div>
    </StaticPageShell>
  );
}
