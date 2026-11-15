import Link from "next/link";

// Stub of the booking page (issue #18): the real booking flow arrives at
// the next stage. The route may later move to the booking link shape
// /u/{owner}/{event} — then only the landing CTA changes.
export default function BookingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center font-sans">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Запись на встречу
      </h1>
      <p className="max-w-md text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
        Запись пока в разработке — откроется на следующем этапе…
      </p>
      <Link
        href="/"
        className="rounded-full border border-solid border-zinc-300 px-6 py-2.5 font-medium text-zinc-900 transition-colors hover:border-transparent hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        На главную
      </Link>
    </main>
  );
}
