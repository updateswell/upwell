# Upwell design system

Minimal and monochrome: black, white and greys, with one typeface. Color never carries meaning on
its own. Hierarchy comes from weight, size, borders and texture (grid lines, hatching, dither).

## Logo

A pixel-art arrow rising out of a stack of layers: updates rising up from the binary.

| File | Use |
| --- | --- |
| `logo.svg` | Master. `fill="currentColor"`, so it takes the surrounding text color |
| `logo-black.svg` / `logo-black.png` | On light backgrounds (transparent) |
| `logo-white.svg` / `logo-white.png` | On dark backgrounds (transparent) |
| `logo-on-white.png` / `logo-on-black.png` | 1024×1024 squares with a background: avatars, app icons, social cards |
| `favicon.svg` | Square favicon that switches between black and white with the OS color scheme |
| `banner-light.png` / `banner-dark.png` | README banner (1280×400 @2x), for GitHub's light and dark themes |
| `og.png` | Link preview for upwell.run (1200×630) |
| `social-preview.png` | GitHub repository social preview (1280×640) |

The banners and social images are rendered from `website/app/card/[format]` with
`npm run social` in `website/`, so edit the template and re-render rather than editing the PNGs.

- The mark is pixel art: always scale it, never redraw or smooth it. Below 16 px, use the square
  variant instead of the bare mark.
- Leave clear space around the mark of at least the arrow head's width.
- Only black on light or white on dark. No colors, gradients, outlines or shadows.
- The wordmark is "Upwell" set in Geist Mono, medium weight, next to the mark.

The SVGs are traced from the original artwork (`upwell-logo.png`) with sharp corners, so they stay
crisp at any size.

## Color

One neutral scale. Light and dark themes mirror each other.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#FAFAFA` | `#0A0A0A` | Page |
| `surface` | `#FFFFFF` | `#111111` | Cards, code blocks, popovers |
| `foreground` | `#0A0A0A` | `#FAFAFA` | Text, primary buttons, the logo |
| `muted-foreground` | `#737373` | `#A3A3A3` | Secondary text |
| `border` | `#E5E5E5` | `#262626` | Hairlines, grid lines |
| `accent` | `#F2F2F2` | `#1A1A1A` | Hover, subtle fills |
| `primary` | `#0A0A0A` | `#FAFAFA` | Same as foreground: buttons are solid black (light) or white (dark) |

Neutral scale for anything else: `50 #FAFAFA` · `100 #F5F5F5` · `200 #E5E5E5` · `300 #D4D4D4` ·
`400 #A3A3A3` · `500 #737373` · `600 #525252` · `700 #404040` · `800 #262626` · `900 #171717` ·
`950 #0A0A0A`.

## Type

**[Geist Mono](https://fonts.google.com/specimen/Geist+Mono)** for everything: headings, body, code, UI.

| Role | Size / weight | Tracking |
| --- | --- | --- |
| Display | 48–64 px / 500 | −0.04 em |
| Heading | 24–32 px / 500 | −0.02 em |
| Body | 14–16 px / 400, line height 1.6 | 0 |
| Small / labels | 12–13 px / 400, often uppercase | +0.04 em |

## Texture and shape

- **Grid frame:** content sits in a centered column bounded by 1 px vertical lines, sections are
  separated by horizontal lines, and small `+` marks sit where they cross.
- **Hatching:** 45° hairline stripes fill bands between dark sections.
- **Dither:** imagery is ordered-dithered pixels (Bayer), echoing the pixel-art logo. Shadows on
  cards are dotted, not blurred.
- **Buttons:** pills (fully rounded). Primary is solid foreground; secondary is outlined.
- **Corners:** cards and panels are square or nearly square (0–4 px). Only buttons and chips are round.
- **Motion:** slow and sparse (pixels drifting upward). Always respect `prefers-reduced-motion`.

## Where it's used

- upwell.run and docs.upwell.run (`website/`): tokens in `app/global.css`, font in `app/layout.tsx`, logo in `public/`
- README banner, link previews, GitHub social preview
- Example app icon and splash (`example/assets/`)
- UI kit defaults (`src/ui/theme.tsx`): monochrome light and dark themes
