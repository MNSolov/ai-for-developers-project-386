import Link from "next/link";
import { BRAND } from "@/shared/config";
import { BookingCta } from "@/shared/ui";

export function Header() {
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 py-4">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
        >
          {BRAND.name}
        </Link>
        <BookingCta size="sm" />
      </div>
    </header>
  );
}
