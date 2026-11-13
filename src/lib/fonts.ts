/** Fonts offered for subtitles. `family` is the CSS stack; Vazirmatn backs every font for missing glyphs. */
export const SUBTITLE_FONTS = [
  { id: 'vazirmatn', name: 'وزیرمتن', family: "'Vazirmatn Variable', 'Vazirmatn', sans-serif" },
  { id: 'iranyekanx', name: 'ایران‌یکان X', family: "'IRANYekanX', 'Vazirmatn Variable', sans-serif" },
  { id: 'yekanbakh', name: 'یکان بخ', family: "'Yekan Bakh', 'Vazirmatn Variable', sans-serif" },
  { id: 'estedad', name: 'استعداد', family: "'Estedad', 'Vazirmatn Variable', sans-serif" },
  { id: 'meem', name: 'میم', family: "'Meem', 'Vazirmatn Variable', sans-serif" },
  { id: 'peyda', name: 'پیدا', family: "'Peyda', 'Vazirmatn Variable', sans-serif", boldOnly: true },
] as const;

/** Fonts whose @font-face is actually present in this build (the optional private ones may be missing). */
export function availableFonts() {
  const declared = new Set([...document.fonts].map((f) => f.family.replace(/["']/g, '')));
  return SUBTITLE_FONTS.filter((f) => f.id === 'vazirmatn' || declared.has(f.family.split(',')[0].replace(/["']/g, '').trim()));
}

export type SubtitleFontId = (typeof SUBTITLE_FONTS)[number]['id'];

export function fontFamily(id: string | undefined) {
  return (SUBTITLE_FONTS.find((f) => f.id === id) ?? SUBTITLE_FONTS[0]).family;
}
