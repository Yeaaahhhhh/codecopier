// File: src/i18n/index.ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zhCN from "./zh-CN.json";
import enUS from "./en-US.json";
import jaJP from "./ja-JP.json";
import frFR from "./fr-FR.json";
import itIT from "./it-IT.json";
import deDE from "./de-DE.json";
import esES from "./es-ES.json";
import ptBR from "./pt-BR.json";
import zhHK from "./zh-HK.json";
import koKR from "./ko-KR.json";
import ruRU from "./ru-RU.json";
import plPL from "./pl-PL.json";
import trTR from "./tr-TR.json";
import hiIN from "./hi-IN.json";

const STORAGE_KEY = "code-copier-lang";

function detectLanguage(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;

  const nav = navigator.language || "en-US";
  const lower = nav.toLowerCase();

  if (lower.startsWith("zh")) {
    if (lower.includes("hk") || lower.includes("tw") || lower.includes("hant")) return "zh-HK";
    return "zh-CN";
  }
  if (lower.startsWith("ja")) return "ja-JP";
  if (lower.startsWith("fr")) return "fr-FR";
  if (lower.startsWith("it")) return "it-IT";
  if (lower.startsWith("de")) return "de-DE";
  if (lower.startsWith("es")) return "es-ES";
  if (lower.startsWith("pt")) return "pt-BR";
  if (lower.startsWith("ko")) return "ko-KR";
  if (lower.startsWith("ru")) return "ru-RU";
  if (lower.startsWith("pl")) return "pl-PL";
  if (lower.startsWith("tr")) return "tr-TR";
  if (lower.startsWith("hi")) return "hi-IN";

  return "en-US";
}

i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    "en-US": { translation: enUS },
    "ja-JP": { translation: jaJP },
    "fr-FR": { translation: frFR },
    "it-IT": { translation: itIT },
    "de-DE": { translation: deDE },
    "es-ES": { translation: esES },
    "pt-BR": { translation: ptBR },
    "zh-HK": { translation: zhHK },
    "ko-KR": { translation: koKR },
    "ru-RU": { translation: ruRU },
    "pl-PL": { translation: plPL },
    "tr-TR": { translation: trTR },
    "hi-IN": { translation: hiIN }
  },
  lng: detectLanguage(),
  fallbackLng: "en-US",
  interpolation: {
    escapeValue: false
  }
});

export const SUPPORTED_LANGS = [
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-HK", label: "粵語" },
  { code: "en-US", label: "English" },
  { code: "ja-JP", label: "日本語" },
  { code: "ko-KR", label: "한국어" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "es-ES", label: "Español" },
  { code: "pt-BR", label: "Português" },
  { code: "it-IT", label: "Italiano" },
  { code: "ru-RU", label: "Русский" },
  { code: "pl-PL", label: "Polski" },
  { code: "tr-TR", label: "Türkçe" },
  { code: "hi-IN", label: "हिन्दी" }
] as const;

export function changeLanguage(code: string) {
  localStorage.setItem(STORAGE_KEY, code);
  i18n.changeLanguage(code);
}

export default i18n;