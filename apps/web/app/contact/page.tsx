import type { Metadata } from "next";
import Link from "next/link";
import StaticPageShell from "../components/StaticPageShell";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact Us | Cake Break",
  description:
    "Get in touch with Cake Break — enquiry form, phone, and email support for orders and bakery questions.",
};

const ORDERS_EMAIL = "orders@eggfreecakebreak.com";

const STORES = [
  {
    name: "Oldbury",
    address: "352 Londonderry Road, Oldbury, Birmingham, B68 9NB",
    country: "United Kingdom",
    phones: [
      { label: "07305 750164", href: "tel:+447305750164" },
      { label: "0121 544 9280", href: "tel:+441215449280" },
    ],
  },
  {
    name: "Brierley Hill",
    address:
      "Cake Break in Premier at High Street Brierley Hill, 138-142 High Street, DY5 3BP",
    country: "United Kingdom",
    phones: [
      { label: "07552 011662", href: "tel:+447552011662" },
      { label: "0138 448 4926", href: "tel:+441384484926" },
    ],
  },
];

const HOURS = [
  { days: "Monday", hours: "10 AM – 5 PM" },
  { days: "Tuesday – Saturday", hours: "9 AM – 6 PM" },
  { days: "Sunday", hours: "10 AM – 5 PM" },
];

export default function ContactPage() {
  return (
    <StaticPageShell
      eyebrow="Support"
      title="Contact Us"
      subtitle="We at Cake Break Ltd understand and value customer service to the highest level. Questions about an order or custom cake? We’d love to hear from you."
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-10 lg:gap-14">
        <aside className="space-y-6">
          <div className="rounded-3xl border border-outline-variant/25 bg-white p-6 space-y-5 shadow-sm">
            <h2 className="font-headline-md text-xl text-deep-plum">
              Reach us directly
            </h2>

            {STORES.map((store) => (
              <div key={store.name} className="space-y-2 text-sm">
                <p className="font-semibold text-deep-plum flex items-center gap-2">
                  <span className="material-symbols-outlined text-vibrant-magenta !text-[20px]">
                    store
                  </span>
                  {store.name}
                </p>
                <p className="text-on-surface-variant pl-7 leading-relaxed">
                  {store.address}
                  <br />
                  {store.country}
                </p>
                <p className="pl-7 flex flex-wrap gap-x-2 gap-y-1">
                  {store.phones.map((p, i) => (
                    <span key={p.href}>
                      {i > 0 && (
                        <span className="text-on-surface-variant mx-1">|</span>
                      )}
                      <a
                        href={p.href}
                        className="text-on-surface-variant hover:text-vibrant-magenta underline-offset-2 hover:underline"
                      >
                        {p.label}
                      </a>
                    </span>
                  ))}
                </p>
              </div>
            ))}

            <div className="space-y-1 text-sm pt-1 border-t border-outline-variant/20">
              <p className="font-semibold text-deep-plum flex items-center gap-2 pt-3">
                <span className="material-symbols-outlined text-vibrant-magenta !text-[20px]">
                  mail
                </span>
                Email
              </p>
              <a
                href={`mailto:${ORDERS_EMAIL}`}
                className="pl-7 text-on-surface-variant hover:text-vibrant-magenta underline-offset-2 hover:underline break-all"
              >
                {ORDERS_EMAIL}
              </a>
            </div>

            <div className="space-y-2 text-sm pt-1 border-t border-outline-variant/20">
              <p className="font-semibold text-deep-plum flex items-center gap-2 pt-3">
                <span className="material-symbols-outlined text-vibrant-magenta !text-[20px]">
                  schedule
                </span>
                Opening hours
              </p>
              <ul className="pl-7 space-y-1 text-on-surface-variant">
                {HOURS.map((row) => (
                  <li key={row.days}>
                    <span className="font-medium text-deep-plum">{row.days}</span>
                    {": "}
                    {row.hours}
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed pt-1">
              Prefer the map?{" "}
              <Link
                href="/map-routing"
                className="text-deep-plum font-semibold underline underline-offset-2"
              >
                Find your nearest Cake Break
              </Link>
              .
            </p>
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed px-1">
            We are open 7 days a week. Order-specific questions are best
            answered with your order number if you have one.
          </p>
        </aside>

        <div className="rounded-3xl border border-outline-variant/25 bg-white p-6 md:p-8 shadow-sm">
          <h2 className="font-headline-md text-xl text-deep-plum mb-6">
            Get in touch with us
          </h2>
          <ContactForm />
        </div>
      </div>
    </StaticPageShell>
  );
}
