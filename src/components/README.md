# Components & design system

Three layers. Build down the stack; never reach past a layer.

## 1. Tokens — `src/constants/theme.ts`
The single source of truth. Never hardcode a color or font size in a screen.
- `COLORS` — incl. `brand` (ocean blue `#0E7C9D`) + `brandLight` for standout elements.
- `SPACING`, `RADIUS`, `FONT` (weights), `FONT_SIZE` (the type scale).

## 2. Primitives — `src/components/ui/`
Consume **only** tokens. No domain knowledge.
- `AppText` — typographic text. Use `<AppText variant="title|headline|body|subhead|caption|footnote|display">` instead of raw `fontSize`/`fontWeight`. Override with `color` / `weight` props (still pass tokens).
- `Avatar` — image + neutral placeholder, `size` prop.
- `Chip` — selectable pill (brand tint when selected).
- `Card` — bordered surface container.
- `SegmentedControl` — brand-accented segmented toggle.

## 3. Domain components — `src/components/`
Composed from primitives; know about app entities.
- `ExperienceCard` — feed card.
- `ExperienceRow` — compact ranked/list row (My List / Profile / Trip detail).
- `TripCard` — trips-strip card.
- `UserRow` — user list row with optional follow toggle (Find People / follow lists).

## Brand color
`COLORS.brand` is used **selectively** — primary CTAs, active toggles, follow buttons,
bookmarks, key highlights. Keep warm neutrals everywhere else. `COLORS.brandLight`
tints selected chips / badges / active backgrounds.

## Adding a component
1. If it's text, use `AppText` — don't add `fontSize`.
2. Reach for an existing primitive before writing new style.
3. Colors come from `COLORS`. `npm run lint` enforces this (`react-native/no-color-literals`).
4. Keep `npm run typecheck` and `npm run lint` clean.
