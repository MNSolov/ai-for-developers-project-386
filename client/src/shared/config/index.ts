// Product-wide constants (the `shared/config` slice, docs/adr/0001).
// Consumed by the root layout (metadata, locale) and by the widgets
// that render the brand.
export const BRAND = {
  name: "Календарь звонков",
  description:
    "Сервис записи на встречи: создайте тип встречи, поделитесь ссылкой для записи — и гость сам выберет удобное время.",
  locale: "ru",
} as const;
