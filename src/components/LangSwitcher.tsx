// File: src/components/LangSwitcher.tsx
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, changeLanguage } from "../i18n";

export default function LangSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div className="lang-switcher">
      <select
        value={i18n.language}
        onChange={(e) => changeLanguage(e.target.value)}
      >
        {SUPPORTED_LANGS.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}