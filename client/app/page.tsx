import Link from "next/link";

const steps = [
  {
    title: "Создайте тип встречи",
    description:
      "Название, длительность и интервалы доступности — например, «Вводный звонок» на 30 минут.",
  },
  {
    title: "Поделитесь ссылкой",
    description:
      "Приложение генерирует публичную ссылку для записи — просто отправьте её гостям.",
  },
  {
    title: "Гость выберет слот",
    description:
      "Гость открывает ссылку, выбирает свободное время и оставляет имя, email и комментарий.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-100">
          Встречи по расписанию, а не по договорённостям
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          «Календарь звонков» превращает запись на встречу в три шага: создайте
          тип встречи, отправьте ссылку — гость сам выберет удобное время.
        </p>
        <Link
          href="/booking"
          className="rounded-full bg-zinc-900 px-8 py-3.5 text-base font-medium text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Записаться
        </Link>
      </section>

      <section className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto w-full max-w-3xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Как это работает
          </h2>
          <ol className="mt-8 flex flex-col gap-6 sm:flex-row">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-left dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
