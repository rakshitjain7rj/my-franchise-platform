import type { Metadata } from "next";
import Link from "next/link";
import StaticPageShell from "../components/StaticPageShell";

export const metadata: Metadata = {
  title: "About Us | Cake Break",
  description:
    "Discover Cake Break — the UK’s artisan egg-free bakery franchise, crafting celebration cakes for every occasion.",
};

const VALUES = [
  {
    title: "100% Egg-Free",
    body: "Every sponge, frosting, and filling is prepared without eggs — so more families can celebrate together.",
    icon: "egg_alt",
  },
  {
    title: "Local Boutiques",
    body: "Cakes are baked fresh at your neighbourhood Cake Break, never frozen from a distant warehouse.",
    icon: "storefront",
  },
  {
    title: "Made to Order",
    body: "Choose size, sponge flavour, inscription, and even an edible photo — personalised for your day.",
    icon: "cake",
  },
];

export default function AboutPage() {
  return (
    <StaticPageShell
      eyebrow="Our Story"
      title="About Cake Break"
      subtitle="Artisan patisserie with a purpose — egg-free celebration cakes, baked locally by bakers who care."
    >
      <div className="space-y-14">
        <div className="prose prose-lg max-w-none">
          <p className="font-body-md text-on-surface-variant text-[16px] md:text-lg leading-relaxed">
            Cake Break began with a simple idea: celebration cakes should be
            delicious for everyone. Our egg-free recipes use carefully chosen
            plant-based binders so texture and taste never feel like a
            compromise — whether you avoid eggs by choice, allergy, or belief.
          </p>
          <p className="font-body-md text-on-surface-variant text-[16px] md:text-lg leading-relaxed mt-4">
            Today, independent franchise boutiques across the UK carry the Cake
            Break craft: rich chocolate gateaux, light fruit sponges, wedding
            tiers, and bespoke designs finished by hand. Order online for
            collection or delivery from your nearest store.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {VALUES.map((v) => (
            <div
              key={v.title}
              className="rounded-3xl border border-outline-variant/25 bg-white p-6 shadow-sm space-y-3"
            >
              <span className="material-symbols-outlined text-vibrant-magenta !text-[28px]">
                {v.icon}
              </span>
              <h2 className="font-headline-md text-xl text-deep-plum">
                {v.title}
              </h2>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                {v.body}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-3xl bg-lavender-bg/60 border border-outline-variant/20 p-8 md:p-10 flex flex-col md:flex-row md:items-center gap-6 justify-between">
          <div className="space-y-2">
            <h2 className="font-headline-md text-2xl text-deep-plum">
              Find your local bakery
            </h2>
            <p className="text-sm text-on-surface-variant max-w-md">
              Browse the full catalogue once you have selected a Cake Break
              boutique near you.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/map-routing"
              className="inline-flex h-12 items-center px-6 rounded-full bg-deep-plum text-white text-xs font-label-bold uppercase tracking-widest hover:bg-vibrant-magenta transition-colors"
            >
              Store locator
            </Link>
            <Link
              href="/cake-catalogue"
              className="inline-flex h-12 items-center px-6 rounded-full border border-deep-plum/20 text-deep-plum text-xs font-label-bold uppercase tracking-widest hover:bg-white transition-colors"
            >
              View cakes
            </Link>
          </div>
        </div>

        <div className="text-center space-y-3 pt-4">
          <p className="text-sm text-on-surface-variant">
            Interested in opening a Cake Break?
          </p>
          <Link
            href="/franchise"
            className="inline-flex text-sm font-semibold text-deep-plum underline underline-offset-4 hover:text-vibrant-magenta"
          >
            Apply for a franchise →
          </Link>
        </div>
      </div>
    </StaticPageShell>
  );
}
