"use client";

import React from "react";

export default function ConnoisseurClub() {
  return (
    <section className="rounded-3xl overflow-hidden bg-deep-plum text-white premium-shadow">
      <div className="flex flex-col lg:flex-row items-stretch min-h-[460px]">
        {/* Left column: Text & Info */}
        <div className="flex-1 p-8 md:p-16 flex flex-col justify-center space-y-8">
          <div className="space-y-4">
            <span className="inline-block px-4 py-1.5 rounded-full bg-vibrant-magenta/20 text-vibrant-magenta text-[10px] font-label-bold uppercase tracking-[0.2em]">
              Membership Benefits
            </span>
            <h2 className="font-headline text-4xl md:text-5xl font-extrabold leading-tight">
              The Connoisseur Club
            </h2>
            <p className="font-body text-sm md:text-base text-white/80 max-w-lg leading-relaxed">
              Elevate your patisserie experience. As a member of our exclusive
              loyalty program, you earn 10 points for every $1 spent on our
              handcrafted collections.
            </p>
          </div>

          {/* Point levels */}
          <div className="flex items-center gap-8 py-2">
            <div className="border-l-2 border-vibrant-magenta pl-4 space-y-1">
              <p className="text-2xl font-bold tracking-tight">1000 Points</p>
              <p className="text-[10px] uppercase tracking-widest opacity-60 font-label-bold">
                Signature Cake Reward
              </p>
            </div>
            <div className="h-10 w-px bg-white/10" />
            <div className="border-l-2 border-vibrant-magenta pl-4 space-y-1">
              <p className="text-2xl font-bold tracking-tight">Priority</p>
              <p className="text-[10px] uppercase tracking-widest opacity-60 font-label-bold">
                New Collection Access
              </p>
            </div>
          </div>

          {/* Call to actions */}
          <div className="flex items-center gap-6 pt-2">
            <a
              className="bg-white text-deep-plum px-10 py-3.5 rounded-full font-label-bold text-xs uppercase tracking-widest hover:bg-vibrant-magenta hover:text-white transition-all duration-300 active:scale-95 shadow-lg"
              href="#"
            >
              Join Now
            </a>
            <a
              className="text-white border-b-2 border-white/20 hover:border-white transition-all pb-0.5 text-xs uppercase tracking-widest font-label-bold"
              href="#"
            >
              Check Balance
            </a>
          </div>
        </div>

        {/* Right column: Image with visual depth */}
        <div className="flex-1 relative overflow-hidden hidden lg:block bg-gradient-to-l from-[#351036] to-transparent">
          <div className="absolute inset-0 flex items-center justify-center p-12">
            <div className="relative w-full h-full max-w-[420px] max-h-[340px] rounded-2xl overflow-hidden shadow-2xl border border-white/15 transition-transform duration-700 hover:scale-[1.03] hover:-rotate-1">
              <img
                alt="Luxury Slice of Chocolate Layer Cake"
                className="w-full h-full object-cover"
                src="/images/cakes/club-cake.png"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-deep-plum/30 via-transparent to-transparent pointer-events-none" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
