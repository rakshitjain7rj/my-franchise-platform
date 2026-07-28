import type { Metadata } from "next";
import Link from "next/link";
import StaticPageShell from "../components/StaticPageShell";

export const metadata: Metadata = {
  title: "Terms & Conditions | Cake Break",
  description:
    "Terms and conditions governing orders and use of the Cake Break storefront.",
};

export default function TermsPage() {
  return (
    <StaticPageShell
      eyebrow="Legal"
      title="Terms & Conditions"
      subtitle="The terms on which CAKE BREAK Ltd accepts orders and operates this website."
    >
      <div className="space-y-8 text-sm text-on-surface-variant leading-relaxed max-w-3xl">
        <p>
          We reserve the right to change these Terms and Conditions upon which
          CAKE BREAK Ltd makes this website available at any time. It is your
          responsibility to read the Terms and Conditions on each occasion you
          use the website.
        </p>

        <section className="space-y-3">
          <h2 className="font-headline-md text-lg text-deep-plum">Booking</h2>
          <ul className="space-y-2 list-disc pl-5">
            <li>We accept booking up to 12 months in advance.</li>
            <li>
              For wedding cakes, we invite you into store for a sample tasting —
              please call the store and book an appointment.
            </li>
            <li>
              We require a minimum of 2 days&apos; notice for cakes other than
              wedding cakes, including cupcakes.
            </li>
            <li>
              We will not accept an order without a partial or full advance
              payment. We accept various forms of payment including cash, credit
              card, debit card and PayPal.
            </li>
            <li>
              Upon placing your order we will take a brief from you and try to
              match the cake very closely to your request. However we cannot
              guarantee it will be exactly as perceived, as variations in colour
              and theme may exist.
            </li>
            <li>
              Cakes made to order must be collected as arranged. Preparation for
              personalised order cakes starts as early as 24 hours before
              collection. Therefore, if you try to cancel your order within 24
              hours of the collection time, it is highly unlikely that the shop
              will be able to cancel your order.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline-md text-lg text-deep-plum">
            Risk &amp; delivery
          </h2>
          <p>
            Risk of damage or loss to the goods supplied passes to you from the
            time you collect the cake or it is delivered to the assigned venue.
            We cannot accept any claim for damage, loss or deterioration after
            the delivery has been made. This does not affect your statutory
            rights.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline-md text-lg text-deep-plum">
            No refunds will be given for
          </h2>
          <ul className="space-y-2 list-disc pl-5">
            <li>Cancellations within 24 hours of collection time.</li>
            <li>Uncollected cakes — for whatever reason.</li>
            <li>
              Cakes damaged by the customer either during transportation or at
              delivery venues.
            </li>
          </ul>
          <p>
            For hygiene reasons, uncollected cakes will be destroyed after 24
            hours of collection time.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline-md text-lg text-deep-plum">
            Amendments &amp; allergens
          </h2>
          <ul className="space-y-2 list-disc pl-5">
            <li>
              We will endeavour to accept any amendments to your design; this
              should be requested 3–4 days before the order is due to be
              collected.
            </li>
            <li>
              Whilst we try to ensure the best quality ingredients, we do not
              have control of ingredients used in colouring or fabricating
              agents. Please check all ingredients used before placing your
              order, especially in the incidence of a food allergy.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-headline-md text-lg text-deep-plum">
            Brand &amp; outlets
          </h2>
          <ul className="space-y-2 list-disc pl-5">
            <li>
              All our product names are copyright protected. Any unauthorised
              use of our brand name, product names and/or designs for any
              commercial purpose can attract legal attention.
            </li>
            <li>
              You should always buy or order our cakes from our registered shop
              or our authorised franchises only. We do not guarantee the quality
              of our products if sold from any other outlets.
            </li>
            <li>
              Our product pricing is fixed. Any requests for discounts will not
              be entertained.
            </li>
            <li>
              For franchise enquiries, complete the{" "}
              <Link
                href="/franchise"
                className="text-deep-plum font-semibold underline underline-offset-2"
              >
                online form
              </Link>{" "}
              or contact us at our registered address.
            </li>
            <li>
              We do accept online orders but please make sure that the form is
              complete with your correct name and contact details.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-headline-md text-lg text-deep-plum">
            Related policies
          </h2>
          <p>
            See also{" "}
            <Link
              href="/returns"
              className="text-deep-plum font-semibold underline underline-offset-2"
            >
              Returns / Cancellations
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="text-deep-plum font-semibold underline underline-offset-2"
            >
              Privacy Policy
            </Link>
            . Questions:{" "}
            <Link
              href="/contact"
              className="text-deep-plum font-semibold underline underline-offset-2"
            >
              Contact us
            </Link>{" "}
            or email{" "}
            <a
              href="mailto:orders@eggfreecakebreak.com"
              className="text-deep-plum font-semibold underline underline-offset-2"
            >
              orders@eggfreecakebreak.com
            </a>
            .
          </p>
        </section>
      </div>
    </StaticPageShell>
  );
}
