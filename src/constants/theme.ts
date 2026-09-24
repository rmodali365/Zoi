// Beli-inspired: cream backgrounds, warm minimal aesthetic, ocean-blue brand accent.
export const COLORS = {
  background: '#FAF8F5',
  surface: '#FFFFFF',
  border: '#EEEBE6',
  text: '#1A1814',
  textSecondary: '#6B6560',
  textMuted: '#B0ABA5',
  accent: '#2D2926',
  accentLight: '#EDE8E2',
  // Brand: deep ocean blue. Used selectively for standout elements (primary CTAs,
  // active toggles, follow, bookmarks). brandLight tints chips/badges/active bg.
  brand: '#0E7C9D',
  brandLight: '#E3F1F6',
  error: '#C0392B',
  // Scrim behind modal bottom-sheets.
  overlay: 'rgba(0,0,0,0.35)',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
};

export const FONT = {
  regular: { fontWeight: '400' as const },
  medium: { fontWeight: '500' as const },
  semibold: { fontWeight: '600' as const },
  bold: { fontWeight: '700' as const },
};

// Type scale — the single source of font sizes. Prefer the <AppText> component
// (which maps variants to these) over raw fontSize in screens.
export const FONT_SIZE = {
  footnote: 12,
  caption: 13,
  subhead: 14,
  body: 15,
  headline: 17,
  title: 20,
  display: 28,
  // Brand wordmark ("Zoi") — splash + Welcome hero only, not part of the UI scale.
  wordmark: 64,
};
