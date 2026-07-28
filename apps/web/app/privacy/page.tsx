import type { Metadata } from "next";
import Link from "next/link";
import StaticPageShell from "../components/StaticPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy | Cake Break",
  description: "How Cake Break collects, uses, and protects your personal data.",
};

const SECTIONS = [
  "We at Cake Break are fully committed to protecting your personal information like email id, address, date of birth, phone number, and other details furnished while booking orders.",
  "We collect personal information when you fill in website details online for business purposes, giving suggestions, or feedback.",
  "All personal information collected by us is strictly used for lawful purposes — future communication, managing promotional activities, and better customer services.",
  "Collecting information is not only restricted to marketing communication but also for the promotion of our products and services that may involve our strategic partners.",
  "Administrative purposes include internal record keeping.",
  "Information may also be used for marketing analytics and forecasting consumer behaviour.",
  "We may give your personal information to a third party, especially for the purpose of ongoing promotional contests or campaigns.",
  "Our website may relate to the services of third parties, but we are not responsible for how they use your data.",
  "Cookies are generally used to save user preferences. We may work with third-party service providers to better understand our visitors.",
  "While using our digital and marketing services on our website, you abide by our privacy policy. Please review this policy periodically.",
  "We are committed not to disclose personal data without your consent unless permitted by law to do so.",
  "The personal information used by us will be yours, and you may ask for clarification, modification, or deletion of the same.",
  "You might receive emails/newsletters regarding third-party promotions and/or ongoing marketing offers from time to time.",
  "You may get in touch with us for promotional queries or information regarding any of our third-party brands.",
  "Although you may receive promotional campaigns from time to time via SMS or email, you may choose to unsubscribe from such services at any time.",
  "We will by law protect personal information provided when you visit our website, but we do not guarantee that your data will be 100% secured, as no electronic media can ever guarantee so.",
];

export default function PrivacyPage() {
  return (
    <StaticPageShell
      eyebrow="Legal"
      title="Privacy Policy"
      subtitle="How Cake Break handles personal information when you shop with us."
    >
      <div className="space-y-8 text-sm text-on-surface-variant leading-relaxed max-w-3xl">
        <ol className="space-y-4 list-decimal pl-5">
          {SECTIONS.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ol>

        <section className="space-y-2">
          <h2 className="font-headline-md text-lg text-deep-plum">
            Essential cookies on this storefront
          </h2>
          <p>
            This storefront uses essential cookies for store selection, cart, and
            session authentication. Optional analytics cookies are only used if
            you accept them via the consent banner. Preferences are stored for
            one year.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-headline-md text-lg text-deep-plum">Contact</h2>
          <p>
            For privacy queries, call or email us, or contact us at our
            registered address. Email{" "}
            <a
              href="mailto:orders@eggfreecakebreak.com"
              className="text-deep-plum font-semibold underline underline-offset-2"
            >
              orders@eggfreecakebreak.com
            </a>{" "}
            or use the{" "}
            <Link
              href="/contact"
              className="text-deep-plum font-semibold underline underline-offset-2"
            >
              contact form
            </Link>
            .
          </p>
        </section>
      </div>
    </StaticPageShell>
  );
}
