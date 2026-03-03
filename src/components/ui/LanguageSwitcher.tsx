"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

function setLocaleCookie(locale: string) {
  document.cookie = `locale=${locale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
}

export default function LanguageSwitcher() {
  const router = useRouter();
  const t = useTranslations("LanguageSwitcher");

  const current =
    typeof document !== "undefined"
      ? (document.cookie.match(/(?:^|; )locale=(\w+)/)?.[1] || "ja")
      : "ja";

  const handleSwitch = (locale: string) => {
    setLocaleCookie(locale);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1" role="group" aria-label={t("label")}>
      <button
        onClick={() => handleSwitch("ja")}
        className={`px-2 py-1 text-xs rounded-l-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
          current === "ja"
            ? "bg-[#6EC6FF] text-white border-[#6EC6FF]"
            : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
        }`}
        aria-pressed={current === "ja"}
      >
        日本語
      </button>
      <button
        onClick={() => handleSwitch("en")}
        className={`px-2 py-1 text-xs rounded-r-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
          current === "en"
            ? "bg-[#6EC6FF] text-white border-[#6EC6FF]"
            : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
        }`}
        aria-pressed={current === "en"}
      >
        English
      </button>
    </div>
  );
}
