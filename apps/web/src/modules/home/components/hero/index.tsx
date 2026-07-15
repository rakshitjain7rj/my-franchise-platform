import React from "react";

type HeroCta = {
  label: string;
  href: string;
};

type HeroContent = {
  tag: string;
  title: string;
  titleEmphasis: string;
  description: string;
  primaryCta: HeroCta;
  secondaryCta: HeroCta;
  imageSrc: string;
  imageAlt: string;
};

type MembershipContent = {
  tag: string;
  title: string;
  description: string;
  pointsLabel: string;
  pointsCaption: string;
  priorityLabel: string;
  priorityCaption: string;
  primaryCta: HeroCta;
  secondaryCta: HeroCta;
  imageSrc: string;
  imageAlt: string;
};

type LoyaltyCardContent = {
  tag: string;
  title: string;
  description: React.ReactNode;
  pointsValue: string;
  pointsCaption: string;
};

type ExpressCardContent = {
  tag: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
};

export type BentoHeroProps = {
  hero?: Partial<HeroContent>;
  membership?: Partial<MembershipContent>;
  loyaltyCard?: Partial<LoyaltyCardContent>;
  expressCard?: Partial<ExpressCardContent>;
};

const defaultHero: HeroContent = {
  tag: "Best Seller",
  title: "Midnight Indulgence:",
  titleEmphasis: "Dark Cocoa Truffle",
  description:
    "A symphony of 70% dark cocoa and velvety ganache for the ultimate chocolate connoisseur.",
  primaryCta: { label: "Order Now", href: "#" },
  secondaryCta: { label: "Discover Flavors", href: "#" },
  imageSrc: "/images/cakes/chocolate-truffle.png",
  imageAlt: "Dark Truffle"
};

const defaultMembership: MembershipContent = {
  tag: "Membership Benefits",
  title: "The Connoisseur Club",
  description:
    "Elevate your patisserie experience. As a member of our exclusive loyalty program, you earn 10 points for every $1 spent on our handcrafted collections.",
  pointsLabel: "1000 Points",
  pointsCaption: "Signature Cake Reward",
  priorityLabel: "Priority",
  priorityCaption: "New Collection Access",
  primaryCta: { label: "Join Now", href: "#" },
  secondaryCta: { label: "Check Balance", href: "#" },
  imageSrc: "/images/cakes/artisan-cheesecake.png",
  imageAlt: "Luxury multi-tiered wedding cake"
};

const defaultLoyaltyCard: LoyaltyCardContent = {
  tag: "The Connoisseur Club",
  title: "Sweet Rewards",
  description: (
    <>
      Exclusive benefits for our patrons. You&apos;re 200 points away from a{" "}
      <span className="font-bold border-b border-vibrant-magenta">Free Signature Cupcake.</span>
    </>
  ),
  pointsValue: "1,250",
  pointsCaption: "Loyalty Points"
};

const defaultExpressCard: ExpressCardContent = {
  tag: "Lightning Service",
  title: "Need it now?",
  description:
    "Our white-glove courier service ensures your patisserie arrives in pristine condition within 120 minutes across the metropolitan area.",
  ctaLabel: "Track Your Order",
  ctaHref: "#"
};

export default function BentoHero({
  hero,
  membership,
  loyaltyCard,
  expressCard
}: BentoHeroProps) {
  const heroData = { ...defaultHero, ...hero };
  const membershipData = { ...defaultMembership, ...membership };
  const loyaltyCardData = { ...defaultLoyaltyCard, ...loyaltyCard };
  const expressCardData = { ...defaultExpressCard, ...expressCard };

  return (
    <section className="space-y-12">
      <section
        className="relative h-[600px] md:h-[680px] rounded-2xl overflow-hidden premium-shadow bg-lavender-bg"
        id="hero-carousel"
      >
        <div className="hero-slide active h-full flex flex-col md:flex-row items-center">
          <div className="relative z-20 w-full md:w-[45%] h-full flex items-center justify-center p-8 md:p-16">
            <div className="hero-slide-content bg-white/80 backdrop-blur-xl p-10 md:p-14 rounded-2xl border border-white/40 shadow-2xl space-y-6 max-w-lg -mr-0 md:-mr-24 relative z-30">
              <span className="inline-block px-3 py-1 rounded bg-deep-plum text-white text-[10px] font-bold uppercase tracking-widest">
                {heroData.tag}
              </span>
              <h1 className="font-headline-xl text-4xl md:text-5xl text-deep-plum leading-tight">
                {heroData.title} <br />
                <span className="text-vibrant-magenta font-light italic">
                  {heroData.titleEmphasis}
                </span>
              </h1>
              <p className="font-body-lg text-on-surface-variant text-base leading-relaxed">
                {heroData.description}
              </p>
              <div className="flex gap-4">
                <a
                  className="bg-deep-plum text-white px-8 py-4 rounded-full font-label-bold text-sm hover:bg-black transition-all"
                  href={heroData.primaryCta.href}
                >
                  {heroData.primaryCta.label}
                </a>
                <a
                  className="text-deep-plum font-label-bold border-b border-deep-plum/20 hover:border-deep-plum transition-all px-2"
                  href={heroData.secondaryCta.href}
                >
                  {heroData.secondaryCta.label}
                </a>
              </div>
            </div>
          </div>
          <div className="w-full md:w-[60%] h-full overflow-hidden absolute md:relative right-0 top-0">
            <img
              alt={heroData.imageAlt}
              className="hero-slide-image w-full h-full object-cover"
              src={heroData.imageSrc}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl overflow-hidden bg-deep-plum text-white premium-shadow">
        <div className="flex flex-col md:flex-row items-stretch min-h-[400px]">
          <div className="flex-1 p-10 md:p-16 flex flex-col justify-center space-y-8">
            <div className="space-y-4">
              <span className="inline-block px-3 py-1 rounded bg-vibrant-magenta/20 text-vibrant-magenta text-[11px] font-bold uppercase tracking-[0.2em]">
                {membershipData.tag}
              </span>
              <h2 className="font-headline-xl text-4xl md:text-5xl leading-tight">
                {membershipData.title}
              </h2>
              <p className="font-body-lg text-white/80 max-w-lg">
                {membershipData.description}
              </p>
              <div className="flex items-center gap-4 py-4">
                <div className="border-l-2 border-vibrant-magenta pl-4">
                  <p className="text-2xl font-bold">{membershipData.pointsLabel}</p>
                  <p className="text-xs uppercase tracking-widest opacity-60 font-semibold">
                    {membershipData.pointsCaption}
                  </p>
                </div>
                <div className="h-12 w-px bg-white/10"></div>
                <div className="border-l-2 border-vibrant-magenta pl-4">
                  <p className="text-2xl font-bold">{membershipData.priorityLabel}</p>
                  <p className="text-xs uppercase tracking-widest opacity-60 font-semibold">
                    {membershipData.priorityCaption}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <a
                className="bg-white text-deep-plum px-10 py-4 rounded-full font-label-bold text-sm uppercase tracking-widest hover:bg-vibrant-magenta hover:text-white transition-all active:scale-95"
                href={membershipData.primaryCta.href}
              >
                {membershipData.primaryCta.label}
              </a>
              <a
                className="text-white border-b border-white/30 hover:border-white transition-colors py-1 text-sm font-label-bold uppercase tracking-widest"
                href={membershipData.secondaryCta.href}
              >
                {membershipData.secondaryCta.label}
              </a>
            </div>
          </div>

          <div className="flex-1 relative overflow-hidden hidden md:block">
            <img
              alt={membershipData.imageAlt}
              className="w-full h-full object-cover"
              src={membershipData.imageSrc}
            />
            <div className="absolute inset-0 bg-gradient-to-l from-transparent via-deep-plum/10 to-deep-plum/30"></div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        <div className="md:col-span-1 bg-deep-plum p-10 rounded-2xl premium-shadow flex flex-col justify-between text-white relative overflow-hidden group">
          <div className="relative z-10 space-y-6">
            <div className="space-y-2">
              <span className="bg-vibrant-magenta/20 text-vibrant-magenta px-3 py-1 rounded text-[10px] font-bold tracking-widest uppercase">
                {loyaltyCardData.tag}
              </span>
              <h3 className="font-headline-md text-headline-md leading-tight">
                {loyaltyCardData.title}
              </h3>
            </div>
            <p className="opacity-80 font-body-md text-sm leading-relaxed">
              {loyaltyCardData.description}
            </p>
          </div>
          <div className="mt-12 relative z-10 flex items-baseline gap-2">
            <span className="text-5xl font-headline-lg">
              {loyaltyCardData.pointsValue}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-60">
              {loyaltyCardData.pointsCaption}
            </span>
          </div>
          <div className="absolute -bottom-16 -right-16 w-64 h-64 bg-vibrant-magenta/10 rounded-full group-hover:scale-110 transition-transform duration-1000"></div>
        </div>

        <div className="md:col-span-2 bg-white p-10 rounded-2xl border border-outline-variant/20 premium-shadow flex flex-col md:flex-row gap-12 items-center">
          <div className="flex-1 space-y-6">
            <div className="inline-flex items-center gap-2 bg-lavender-bg px-4 py-2 rounded text-deep-plum font-label-bold text-[11px] uppercase tracking-widest">
              <span className="material-symbols-outlined !text-[16px]">bolt</span>
              {expressCardData.tag}
            </div>
            <div className="space-y-2">
              <h3 className="font-headline-lg text-headline-lg text-deep-plum leading-tight">
                {expressCardData.title}
              </h3>
              <p className="text-on-surface-variant font-body-md text-base leading-relaxed">
                {expressCardData.description}
              </p>
            </div>
            <a
              className="text-vibrant-magenta font-label-bold border-b-2 border-vibrant-magenta/20 hover:border-vibrant-magenta transition-all pb-1 flex items-center gap-2 group"
              href={expressCardData.ctaHref}
            >
              {expressCardData.ctaLabel}
              <span className="material-symbols-outlined !text-[18px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </a>
          </div>
          <div className="w-56 h-56 bg-lavender-bg/40 rounded-3xl flex items-center justify-center p-10 border border-outline-variant/10 relative">
            <span className="material-symbols-outlined text-deep-plum !text-[96px] opacity-20">
              local_shipping
            </span>
            <div className="absolute inset-0 flex items-center justify-center translate-x-1 -translate-y-1">
              <span className="material-symbols-outlined text-vibrant-magenta !text-[84px]">
                local_shipping
              </span>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
