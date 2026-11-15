import Link from "next/link";

// The single guest-path call to action: «Записаться» leading to the booking
// page (the booking stub today, the real booking flow later). Lives in
// shared/ui because both the header widget and the home hero render it.
export function BookingCta({ size = "lg" }: { size?: "sm" | "lg" }) {
  const sizing = size === "sm" ? "px-4 py-2 text-sm" : "px-8 py-3.5 text-base";

  return (
    <Link
      href="/booking"
      className={`rounded-full bg-zinc-900 font-medium text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 ${sizing}`}
    >
      Записаться
    </Link>
  );
}
