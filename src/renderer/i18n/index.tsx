// 轻量 i18n：语言包 + React Context。零依赖，类型安全（en 与 zh 同构由编译期强制校验）。
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { AppLanguage } from '../../shared/types';
import { zh } from './zh';
import { en } from './en';

export type { AppLanguage };
export type Dict = typeof zh;
type Params = Record<string, string | number | null | undefined>;

const DICTS: Record<AppLanguage, Dict> = { zh, en };

/** 将模板中的 {name} 占位符替换为参数值（null/undefined 渲染为空串） */
function format(tpl: string, params?: Params): string {
  if (!params) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k] ?? '') : m));
}

interface I18nCtx {
  lang: AppLanguage;
  t: (key: keyof Dict, params?: Params) => string;
}

const Ctx = createContext<I18nCtx>({
  lang: 'zh',
  t: (key) => String(key),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useAppStore((s) => s.config.language) as AppLanguage;
  const dict = DICTS[lang] ?? DICTS.zh;
  const value = useMemo<I18nCtx>(
    () => ({
      lang,
      t: (key, params) => format(dict[key] ?? String(key), params),
    }),
    [lang, dict],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}
