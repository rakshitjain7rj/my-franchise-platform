import type { Metadata } from "next";
import Link from "next/link";
import StaticPageShell from "../components/StaticPageShell";

export const metadata: Metadata = {
  title: "Returns / Cancellations | Cake Break",
  description:
    "Cake Break returns and cancellations policy for made-to-order egg-free cakes.",
};

const POLICY_POINTS = [
  "The cake you order should be consumed within 24 hours of completion and handing over to the customer.",
  "There are certain structures like toothpicks and dowels that need to be removed from tiered cakes before consumption. We shall not be responsible for any damage caused to the cake while removing those.",
  "If you have finalised the design of the cake and paid a certain amount as advance, we will accept your order. If you later decide to change the design, we will arrange for the alteration after deducting additional charges.",
  "If you find a portion of the cake perished or about to perish, we will replace it. You need to produce the cake physically as proof of your claim. Solid complaints regarding the ingredients used will be accepted.",
  "We do not give any guarantee on the colour and milk allergens and other ingredients we use in our eggless cakes, but we will provide full information on the things used to make the cake.",
  "Any product-related complaints will be accepted within 24 hours from when you receive your cake. All our products should be best consumed within 24 hours from completion.",
  "If you want to return any of our products with a valid reason, you are expected to come to our shop and personally return it. We do not drop or pick products to or from your residence.",
];

export default function ReturnsPage() {
  return (
    <StaticPageShell
      eyebrow="Policy"
      title="Returns / Cancellations"
      subtitle="How cancellations, replacements, and returns work for Cake Break made-to-order cakes."
    >
      <div className="space-y-8 text-sm text-on-surface-variant leading-relaxed max-w-3xl">
        <p>
          We at Cake Break accept orders from customers and are committed to
          delivering them within the stipulated date. Although we always accept
          full payment, if you want to cancel a particular order you can do so,
          but we deduct a certain amount as cancellation charges.
        </p>

        <section className="space-y-3">
          <h2 className="font-headline-md text-lg text-deep-plum">
            Essential elements of our policy
          </h2>
          <ul className="space-y-3 list-disc pl-5">
            {POLICY_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-headline-md text-lg text-deep-plum">
            Related terms
          </h2>
          <p>
            For further detail on orders, notice periods, and non-refundable
            situations, see our{" "}
            <Link
              href="/terms"
              className="text-deep-plum font-semibold underline underline-offset-2"
            >
              Terms &amp; Conditions
            </Link>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-headline-md text-lg text-deep-plum">Contact</h2>
          <p>
            Questions about a specific order: email{" "}
            <a
              href="mailto:orders@eggfreecakebreak.com"
              className="text-deep-plum font-semibold underline underline-offset-2"
            >
              orders@eggfreecakebreak.com
            </a>{" "}
            or use our{" "}
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
