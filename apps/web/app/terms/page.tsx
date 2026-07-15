import type { Metadata } from "next";
import StaticPageShell from "../components/StaticPageShell";

export const metadata: Metadata = {
  title: "Terms of Service | Cake Break",
  description: "Terms governing use of the Cake Break online storefront.",
};

export default function TermsPage() {
  return (
    <StaticPageShell
      eyebrow="Legal"
      title="Terms of Service"
      subtitle="The basics of ordering celebration cakes through Cake Break."
    >
      <div className="space-y-8 text-sm text-on-surface-variant leading-relaxed max-w-3xl">
        <section className="space-y-2">
          <h2 className="font-headline-md text-lg text-deep-plum">Orders</h2>
          <p>
            Placing an order constitutes an offer to purchase from the
            fulfilling Cake Break boutique. Made-to-order cakes may require
            advance notice; lead times are shown at checkout and on product
            pages where available.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-headline-md text-lg text-deep-plum">
            Collection & delivery
          </h2>
          <p>
            You are responsible for selecting the correct store location and
            collection window. Delivery fees, where offered, are calculated at
            checkout for the address you provide.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-headline-md text-lg text-deep-plum">Allergens</h2>
          <p>
            Product pages list dietary claims and known allergens where
            provided. If you have a severe allergy, please contact your local
            boutique before ordering — kitchens handle multiple ingredients.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-headline-md text-lg text-deep-plum">Contact</h2>
          <p>
            Questions about these terms:{" "}
            <a
              href="/contact"
              className="text-deep-plum font-semibold underline underline-offset-2"
            >
              Contact us
            </a>
            .
          </p>
        </section>
      </div>
    </StaticPageShell>
  );
}
