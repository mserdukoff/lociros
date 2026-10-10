"use client";

import { useCallback, useEffect, useState } from "react";
import { Segmented } from "@/components/segmented";
import { fetchMe } from "@/lib/api";
import { saveLanguage, useStoredLanguage } from "@/lib/device";
import { enabledLanguages, type LangCode, type MeResponse } from "@/lib/types";

/** `/me`, fetched once per screen. `loaded` stays false until it answers or fails. */
export function useMe() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(() => {
    void fetchMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { me, loaded, refresh, setMe };
}

/**
 * The reading language every section shares. It is the one saved on this
 * browser, unless the server hides that language, in which case Japanese.
 */
export function useAppLanguage(me: MeResponse | null) {
  const stored = useStoredLanguage();
  const [picked, setPicked] = useState<LangCode | null>(null);
  const languages = enabledLanguages(me);
  const wanted = picked ?? stored;
  const language: LangCode = languages.some((l) => l.id === wanted) ? wanted : "ja";
  const choose = useCallback((next: LangCode) => {
    setPicked(next);
    saveLanguage(next);
  }, []);
  return { language, languages, choose };
}

export function LanguageSwitch({
  value,
  languages,
  onChange,
}: {
  value: LangCode;
  languages: ReturnType<typeof enabledLanguages>;
  onChange: (next: LangCode) => void;
}) {
  if (languages.length < 2) return null;
  return (
    <Segmented
      ariaLabel="Language"
      size="sm"
      options={languages.map((l) => ({ id: l.id, label: l.label, hint: l.native }))}
      value={value}
      onChange={onChange}
    />
  );
}
