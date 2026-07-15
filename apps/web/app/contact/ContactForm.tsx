"use client";

import { useState } from "react";
import { submitLead } from "@/lib/data/leads";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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
        type: "contact",
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        message: message.trim(),
      });
      setSuccess(result.message);
      setName("");
      setEmail("");
      setPhone("");
      setMessage("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send your message."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Your name *" htmlFor="contact-name">
          <input
            id="contact-name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting || Boolean(success)}
            className={inputClass}
            placeholder="Jane Smith"
          />
        </Field>
        <Field label="Email *" htmlFor="contact-email">
          <input
            id="contact-email"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting || Boolean(success)}
            className={inputClass}
            placeholder="you@example.com"
          />
        </Field>
      </div>
      <Field label="Phone (optional)" htmlFor="contact-phone">
        <input
          id="contact-phone"
          type="tel"
          maxLength={40}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={isSubmitting || Boolean(success)}
          className={inputClass}
          placeholder="+44 …"
        />
      </Field>
      <Field label="Message *" htmlFor="contact-message">
        <textarea
          id="contact-message"
          required
          rows={5}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isSubmitting || Boolean(success)}
          className={`${inputClass} resize-none`}
          placeholder="How can we help?"
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
        {isSubmitting ? "Sending…" : success ? "Sent" : "Send message"}
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
