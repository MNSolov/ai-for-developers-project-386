import Link from "next/link";

export default function BookingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 py-24 text-center font-sans dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Запись на встречу
      </h1>
      <p className="max-w-md text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
        Бронирование в разработке — откроется на следующем этапе. На главной
        странице видно, как всё будет работать.
      </p>
      <Link
        href="/"
        className="rounded-full border border-zinc-300 px-8 py-3.5 text-base font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        На главную
      </Link>
    </main>
  );
}
