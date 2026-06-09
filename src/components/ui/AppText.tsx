import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { COLORS, FONT, FONT_SIZE } from '@/constants/theme';

export type TextVariant =
  | 'display' | 'title' | 'headline' | 'body' | 'subhead' | 'caption' | 'footnote';

type Props = TextProps & {
  variant?: TextVariant;
  // Override the default color (still pass a token, e.g. COLORS.brand).
  color?: string;
  weight?: keyof typeof FONT;
};

// Variant → size + weight + default color. Screens should use <AppText variant=...>
// instead of hardcoding fontSize/fontWeight so typography stays centralized.
const VARIANTS: Record<TextVariant, TextStyle> = {
  display: { fontSize: FONT_SIZE.display, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
  title: { fontSize: FONT_SIZE.title, ...FONT.bold, color: COLORS.text },
  headline: { fontSize: FONT_SIZE.headline, ...FONT.semibold, color: COLORS.text },
  body: { fontSize: FONT_SIZE.body, ...FONT.regular, color: COLORS.text },
  subhead: { fontSize: FONT_SIZE.subhead, ...FONT.medium, color: COLORS.textSecondary },
  caption: { fontSize: FONT_SIZE.caption, ...FONT.regular, color: COLORS.textMuted },
  footnote: { fontSize: FONT_SIZE.footnote, ...FONT.regular, color: COLORS.textMuted },
};

export function AppText({ variant = 'body', color, weight, style, ...rest }: Props) {
  return (
    <Text
      style={[
        VARIANTS[variant],
        weight ? FONT[weight] : null,
        color ? { color } : null,
        style,
      ]}
      {...rest}
    />
  );
}
