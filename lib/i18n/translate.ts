import { activeLanguage } from './locale';
import { translations } from './translations';

/**
 * `t` for code outside React: a toast from lib/, the crash screen, which
 * sits above the LanguageProvider. Same keys and the same English fallback
 * as `useTranslation().t`.
 */
export function translate(key: string, params?: Record<string, string | number>): string {
  const pick = (tree: unknown) =>
    key.split('.').reduce<unknown>((node, k) => (node == null ? undefined : (node as Record<string, unknown>)[k]), tree);
  const found = pick(translations[activeLanguage()]);
  const text = typeof found === 'string' ? found : (pick(translations.en) as string | undefined) ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : text;
}
