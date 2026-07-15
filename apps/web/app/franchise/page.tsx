import type { Metadata } from "next";
import StaticPageShell from "../components/StaticPageShell";
import FranchiseForm from "./FranchiseForm";

export const metadata: Metadata = {
  title: "Apply for a Franchise | Cake Break",
  description:
    "Partner with Cake Break — apply to open an egg-free artisan bakery franchise in your area.",
};

const PERKS = [
  {
    title: "Proven egg-free brand",
    body: "A differentiated offer with growing demand from allergy-aware and lifestyle customers.",
  },
  {
    title: "Central support",
    body: "Recipes, packaging standards, digital ordering, and marketing playbooks from the franchisor team.",
  },
  {
    title: "Local fulfilment model",
    body: "Your boutique owns the bake queue — inventory and orders stay scoped to your store location.",
  },
];

export default function FranchisePage() {
  return (
    <StaticPageShell
      eyebrow="Partnerships"
      title="Apply for a Franchise"
      subtitle="Bring Cake Break to your high street. We’re looking for operators who share our craft standards and community focus."
    >
      <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-10 lg:gap-14">
        <div className="space-y-8">
          <div className="prose max-w-none">
            <p className="text-on-surface-variant leading-relaxed">
              Cake Break franchises combine a modern storefront experience with
              made-to-order patisserie. Ideal candidates have retail or F&amp;B
              experience, access to suitable premises, and the capital to fit
              out a boutique bakery to brand standards.
            </p>
          </div>
          <ul className="space-y-4">
            {PERKS.map((p) => (
              <li
                key={p.title}
                className="rounded-2xl border border-outline-variant/25 bg-white p-5 shadow-sm"
              >
                <h2 className="font-headline-md text-lg text-deep-plum">
                  {p.title}
                </h2>
                <p className="text-sm text-on-surface-variant mt-1.5 leading-relaxed">
                  {p.body}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-on-surface-variant">
            Submitting this form does not create a franchise agreement. Our
            partnerships team reviews every application and will contact you if
            there is a match in your area.
          </p>
        </div>

        <div className="rounded-3xl border border-outline-variant/25 bg-white p-6 md:p-8 shadow-sm">
          <h2 className="font-headline-md text-xl text-deep-plum mb-6">
            Application form
          </h2>
          <FranchiseForm />
        </div>
      </div>
    </StaticPageShell>
  );
}
