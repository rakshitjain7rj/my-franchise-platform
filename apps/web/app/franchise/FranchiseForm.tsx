"use client";

import { useState } from "react";
import { submitLead } from "@/lib/data/leads";

const INVESTMENT_OPTIONS = [
  "Under £50k",
  "£50k – £100k",
  "£100k – £150k",
  "£150k+",
  "Prefer not to say",
];

export default function FranchiseForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [preferredArea, setPreferredArea] = useState("");
  const [company, setCompany] = useState("");
  const [investment, setInvestment] = useState(INVESTMENT_OPTIONS[1]);
  const [experience, setExperience] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);
    try {
      const result = await submitLead({
        type: "franchise",
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        message: message.trim() || undefined,
        city: city.trim() || undefined,
        company: company.trim() || undefined,
        investment_range: investment,
        preferred_area: preferredArea.trim() || undefined,
        experience: experience.trim() || undefined,
      });
      setSuccess(result.message);
      setName("");
      setEmail("");
      setPhone("");
      setCity("");
      setPreferredArea("");
      setCompany("");
      setExperience("");
      setMessage("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not submit application."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full name *" htmlFor="fran-name">
          <input
            id="fran-name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting || Boolean(success)}
            className={inputClass}
          />
        </Field>
        <Field label="Email *" htmlFor="fran-email">
          <input
            id="fran-email"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting || Boolean(success)}
            className={inputClass}
          />
        </Field>
        <Field label="Phone" htmlFor="fran-phone">
          <input
            id="fran-phone"
            type="tel"
            maxLength={40}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isSubmitting || Boolean(success)}
            className={inputClass}
          />
        </Field>
        <Field label="Company (optional)" htmlFor="fran-company">
          <input
            id="fran-company"
            maxLength={120}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={isSubmitting || Boolean(success)}
            className={inputClass}
          />
        </Field>
        <Field label="City / region *" htmlFor="fran-city">
          <input
            id="fran-city"
            required
            maxLength={120}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={isSubmitting || Boolean(success)}
            className={inputClass}
            placeholder="e.g. Birmingham"
          />
        </Field>
        <Field label="Preferred area" htmlFor="fran-area">
          <input
            id="fran-area"
            maxLength={120}
            value={preferredArea}
            onChange={(e) => setPreferredArea(e.target.value)}
            disabled={isSubmitting || Boolean(success)}
            className={inputClass}
            placeholder="High street / retail park"
          />
        </Field>
      </div>

      <Field label="Indicative investment" htmlFor="fran-invest">
        <select
          id="fran-invest"
          value={investment}
          onChange={(e) => setInvestment(e.target.value)}
          disabled={isSubmitting || Boolean(success)}
          className={inputClass}
        >
          {INVESTMENT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Relevant experience" htmlFor="fran-exp">
        <input
          id="fran-exp"
          maxLength={200}
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
          disabled={isSubmitting || Boolean(success)}
          className={inputClass}
          placeholder="Hospitality, retail, bakery…"
        />
      </Field>

      <Field label="Tell us about your interest" htmlFor="fran-msg">
        <textarea
          id="fran-msg"
          rows={4}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isSubmitting || Boolean(success)}
          className={`${inputClass} resize-none`}
          placeholder="Why Cake Break? Timeline? Any sites in mind?"
        />
      </Field>

      {error && (
        <p className="text-sm text-red-600 font-medium" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-700 font-medium" role="status">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || Boolean(success)}
        className="h-12 px-8 rounded-full bg-deep-plum text-white text-xs font-label-bold uppercase tracking-widest hover:bg-vibrant-magenta transition-colors disabled:opacity-60"
      >
        {isSubmitting
          ? "Submitting…"
          : success
            ? "Application sent"
            : "Submit application"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full rounded-xl border border-outline-variant/40 bg-white px-3.5 py-2.5 text-sm text-deep-plum focus:outline-none focus:border-vibrant-magenta transition-colors disabled:opacity-60";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-bold uppercase tracking-wider text-on-surface-variant"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
