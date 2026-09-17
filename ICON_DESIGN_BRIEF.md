# Icon Design Brief — Job/Internship Tracker

A brief for designing the browser-extension icon. Hand this to Claude Design
(or any designer) as-is — it has the brand tokens, concept direction, and
technical constraints needed to produce the final asset without back-and-forth.

## 1. What this product is

A Chrome/Edge extension that lets students and job-seekers log job and
internship applications straight into their own Google Sheet — no account,
no hosted backend, no paid AI. The tone is calm, trustworthy, and a little
academic/editorial (like a well-kept notebook), not flashy startup-SaaS.
Primary audience: students and early-career job seekers tracking a pipeline
of applications through stages like Saved → Applied → OA → Phone Screen →
Technical → Final/Onsite → Offer.

The icon is the extension's face in the browser toolbar (tiny, 16–32px most
of the time) and in the Chrome Web Store listing (128px, seen large). It
needs to read instantly as "tracking applications," not as a generic
briefcase or generic checklist app.

## 2. Brand tokens (pull these exact values)

**Typeface:** Archivo (weights 400–800) — a geometric, slightly warm
grotesque. If the icon includes any letterform/monogram, it should feel like
it belongs next to Archivo: even stroke widths, minimal quirk, rounded
terminals rather than sharp ones.

**Color — light mode (primary palette to design against):**

| Token | Hex | Role |
|---|---|---|
| `--teal` | `#0e7c72` | Primary brand accent |
| `--teal-dark` | `#0a5f57` | Accent, pressed/deep variant |
| `--teal-tint` | `#e3f5f2` | Soft accent background |
| `--ink` | `#0b0b0b` | Primary text/near-black |
| `--page-bg` | `#f9f9f7` | Warm off-white / paper background |
| `--card-bg` | `#ffffff` | Card surface |
| `--border` | `#e1e0d9` | Warm neutral border |

**Color — dark mode (the icon must also hold up on dark toolbars/taskbars):**

| Token | Hex | Role |
|---|---|---|
| `--teal` | `#2bb3a3` | Primary brand accent (brighter for dark bg) |
| `--teal-dark` | `#4fc9ba` | Accent, brighter variant |
| `--page-bg` | `#201f1a` | Warm near-black background |
| `--ink` | `#f2f1ed` | Primary text/near-white |

The app's accent is a single, confident **teal** (`#0e7c72` family) against
warm cream/near-black neutrals — not a multi-color gradient, not blue, not
purple. The status pipeline inside the app *does* use a wider color set
(blue for Active, green for Offer, amber for Ghosted, purple for
Technical/Interview, etc.) but **the icon itself should stay in the teal +
neutral family** — it represents the product, not a specific status.

**Shape language:** soft-rounded rectangles (~12–16% corner radius on cards)
and full pill shapes (`border-radius: 999px`) for badges/chips throughout
the UI. Nothing sharp-cornered; nothing overly rounded/blobby either — think
"rounded square app icon," the same family as most modern MV3 extension
icons.

## 3. Concept direction

**Primary concept — "Checked Card":** a single simplified document/index
card silhouette (rounded-rectangle, portrait orientation, suggesting an
application or resume) with a bold checkmark on it, indicating "logged /
tracked." Two shapes total, nothing more:

1. A rounded-rectangle card, filled with `--teal` (light mode) — this **is**
   the icon's dominant mass, not a small decorative element.
2. A checkmark cut out of (or overlaid in) the card, in `--page-bg`/white,
   thick and confident, centered in the lower two-thirds of the card the way
   a checkmark sits on a real checklist item.

Optionally a thin second "card" peeking out from behind the front card
(offset up-left by a small margin) to suggest "a stack of applications,"
using `--teal-tint` or a lighter teal so it reads as a subtle layer, not a
second focal shape. Include this only if it still reads clearly at 16px —
drop it if it muddies the silhouette.

**Why this concept:** it's specific to *tracking applications* (not a
generic briefcase/magnifying-glass job-search icon), it silhouettes cleanly
in one color at tiny sizes, and it reuses the checkmark motif the product
itself is built around (logging a status = checking something off).

**Acceptable alternate to explore if the primary doesn't pan out:** a
simple briefcase silhouette with the same checkmark treatment cut into the
front pocket. Same color/shape rules apply. Do not mix the two concepts
(no briefcase *and* card in one mark).

**Do not use:** a magnifying glass (overused "search for jobs" cliché), a
generic clipboard-with-lines (too generic/stock-icon), multiple status
colors combined in one mark (reads as noise at small size), a literal
Google Sheets/spreadsheet grid (ties the brand too tightly to a
third-party product), any text or lettering in the icon.

## 4. Technical constraints (hard requirements)

- **Deliverable sizes:** 16×16, 32×32, 48×48, 96×96, 128×128 px PNG, each
  matching the existing files at `public/icon/16.png`, `32.png`, `48.png`,
  `96.png`, `128.png` (same filenames, replacing the current placeholder
  puzzle-piece icon). Design at a large master size (at least 512×512, SVG
  preferred) and export down — don't design at 128px and upscale.
- **Full-bleed square canvas, no background chip.** Chrome/Edge already
  place the icon on their own toolbar button and Web Store card chrome —
  the PNG itself should be the mark on a transparent background (or a
  filled rounded-square background *of the mark's own design*, not a
  generic white/gray square). If you do give the mark a filled background
  shape, use `--page-bg` or `--teal` — not white, not a drop shadow.
- **Legibility at 16px is the hard constraint.** Everything else is
  secondary to this. Two shapes maximum in the primary silhouette (per
  concept above). Stroke/gap widths must not fall below ~1.5px at the
  16×16 export or they'll disappear/alias into mush. Test by shrinking the
  master art to 16px and squinting — if the checkmark is unreadable, make
  it bigger and simplify the card, don't add detail.
- **Must hold up on both light and dark toolbars/OS taskbars.** Chrome/Edge
  render the same icon PNG on both; don't rely on a background color to
  provide contrast unless that background is part of the icon's own art
  and holds contrast against both a light and dark toolbar.
- **Flat, no gradients, no drop shadows, no bevels.** Matches the flat,
  editorial feel of the rest of the UI (see `entrypoints/popup/style.css`,
  `entrypoints/dashboard/style.css`, `entrypoints/onboarding/style.css` —
  no shadows/gradients used anywhere in the product chrome).
- **sRGB color space, transparent PNG background** (except for the
  optional filled background shape described above, which should also be
  transparent *around* that shape, not a square canvas fill).
- Source file should be an editable SVG (or equivalent vector master) so
  future re-exports (e.g. a monochrome favicon variant) don't require
  redrawing from scratch.

## 5. What "done" looks like

- One master vector mark, teal-on-neutral, matching the "Checked Card"
  concept (or the approved alternate).
- Five PNG exports at the sizes above, named to drop directly into
  `public/icon/`, replacing the current default WXT starter icon (a green
  puzzle piece — purely a placeholder, carries no brand meaning today).
- A quick self-check at 16px and on a dark background before calling it
  final — this is the single most common way extension icons fail in
  practice.
