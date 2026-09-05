"use client";

import { useState } from "react";

// Newsletter block: local confirmation only — no backend endpoint exists.
export function NewsletterForm({ title }: { title?: string }) {
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");

  if (done) {
    return (
      <div className="rounded-card bg-flame-50 p-6 text-center text-lg font-semibold text-flame-800">
        ثبت شد. از همراهی شما سپاسگزاریم.
      </div>
    );
  }

  return (
    <form
      className="mx-auto flex max-w-xl flex-col gap-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) setDone(true);
      }}
    >
      <label className="sr-only" htmlFor="newsletter-email">{title ?? "خبرنامه"}</label>
      <input
        id="newsletter-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="ایمیل خود را وارد کنید"
        className="flex-1 rounded-card border border-fog bg-canvas px-5 py-3 text-sm outline-none focus:border-flame-700 focus:ring-2 focus:ring-flame-200"
      />
      <button
        type="submit"
        className="rounded-card bg-flame-700 px-8 py-3 text-sm font-bold text-white transition hover:bg-flame-600"
      >
        عضویت در خبرنامه
      </button>
    </form>
  );
}
