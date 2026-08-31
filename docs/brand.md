# Pond Brand Guide

This guide explains how Pond should look, read, and feel. The aim is simple: ship clear, useful, and credible information that helps people build.

## Brand Philosophy

Pond should feel like a well-organized, engineer-friendly catalog: dense with detail, quick to scan, and pleasant to use.

- Practical over flashy; form follows function.
- Confident but human; plain language, no hype.
- Precise and consistent; fewer styles, used well.
- Built for builders; code and specs are first‑class citizens.

We borrow from a few familiar places: the clarity of a technical manual, the structure of a paper, the precision of a blueprint, and the ergonomics of an IDE.

## Typography System

### Primary Fonts

- Monospace: Berkeley Mono (fallbacks: SF Mono, Consolas, Monaco)
- Serif: Times New Roman (fallback: Georgia, serif)

### Typography Scale

```
Heading 1: 2.5rem (40px) – Monospace, Bold
Heading 2: 2rem (32px) – Monospace, Bold
Heading 3: 1.5rem (24px) – Monospace, Medium
Heading 4: 1.25rem (20px) – Monospace, Medium
Body: 1rem (16px) – Serif, Regular
Small: 0.875rem (14px) – Monospace, Regular
Caption: 0.75rem (12px) – Monospace, Regular
```

### Usage

- Monospace: headings, navigation, metadata, code.
- Serif: body copy and explanations.
- Line height: 1.6 (serif), 1.4 (mono).
- Letter spacing: −0.01em for headings; default elsewhere.

## Color Palette

### Primary

- Black: #000000 — text and headings
- White: #FFFFFF — background
- Pond Blue: #0000FF — links, accents, and the circle in the mark

### Mark

Four filled primitives, always in this order. These are the logo, not decoration.

- Green: #2AA13F — triangle, pointing up
- Pond Blue: #0000FF — circle (the pond)
- Red: #E13A26 — square
- Yellow: #F0AD00 — triangle, pointing down

On dark surfaces, lift them to #3FD465, #3D5FFF, #FF4F38, and #FFC61A.

### Secondary

- Technical Gray: #6B7280 — secondary text
- Annotation Gray: #9CA3AF — notes and metadata
- Border Gray: #E5E7EB — dividers and outlines

### Usage Notes

- Prefer black on white for core content.
- Use Pond Blue for interactive elements and active states.
- Keep grays for hierarchy, not decoration.

## Layout System

### Grid & Spacing

- Base unit: 8px (0.5rem)
- Grid: 12 columns, responsive
- Gutters: 1.5rem (24px)
- Margins: 2rem desktop, 1rem mobile

### Content Width

- Body content: ~65ch
- Code blocks: up to ~80ch

## Component Design

### Navigation

- Monospace, compact, easy to scan.
- Clear active states. Keyboard friendly.
- TOC mirrors document structure.

### Content Blocks

- Code: monospace, readable contrast, minimal framing.
- Specs: grid-based tables with clear labels.
- Diagrams: simple and legible; prefer SVG.
- Citations: consistent, unobtrusive.

### Interactions

- Buttons and links: minimal, purposeful, with subtle hover states.
- Forms: grid-aligned, labeled, predictable.
- Tables: consistent column rhythm and alignment.

## Information Architecture

### Site Structure (example)

```
POND
├── Abstract (landing)
├── System Architecture
│   ├── Mechanical
│   ├── Electrical
│   └── Software
├── Methodology
├── Build Guides
├── API Reference
├── Lab Notes
└── Components
```

### Content Types

- Technical Specs — structured, comparable, documented
- Research Docs — assumptions, method, evidence
- Build Guides — steps, materials, pitfalls
- API Reference — types, examples, edge cases
- Lab Updates — short, dated, honest

## Visual Language

### Icons

- Technical, minimal, consistent sizing and spacing.
- Prefer Lucide; keep stroke weights consistent.

### Imagery

- Clean, well-lit, and functional. Show the thing, not a vibe.
- Diagrams should read like schematics: labels over decoration.

### Motion

- Subtle and purposeful. 150–300ms. Ease-out.
- Never block reading or interaction.

## Voice & Tone

### Writing Style

- Direct, precise, and respectful of the reader’s time.
- Plain language. Define terms. Cite when needed.
- Encourage, don’t hype. Share tradeoffs.

### Content Principles

- Accuracy first. If unsure, say so.
- Clarity over cleverness.
- Completeness where it matters; brevity everywhere else.
- Invite contribution.

## Implementation Guidelines

### CSS Variables

```css
:root {
  --font-mono: "Berkeley Mono", "SF Mono", Consolas, Monaco, monospace;
  --font-serif: "Times New Roman", Georgia, serif;
  --color-black: #000000;
  --color-white: #ffffff;
  --color-pond-blue: #0000ff;
  --color-mark-green: #2aa13f;
  --color-mark-red: #e13a26;
  --color-mark-yellow: #f0ad00;
  --color-tech-gray: #6b7280;
  --color-annotation: #9ca3af;
  --color-border: #e5e7eb;
  --spacing-xs: 0.5rem;
  --spacing-sm: 1rem;
  --spacing-md: 1.5rem;
  --spacing-lg: 2rem;
  --spacing-xl: 3rem;
  --spacing-2xl: 4rem;
}
```

### Responsive Breakpoints

- Mobile: 320–768px
- Tablet: 768–1024px
- Desktop: 1024–1440px
- Large Desktop: 1440px+

### Accessibility

- Contrast: at least 4.5:1 for text.
- Focus: visible focus rings.
- Keyboard: full navigation support.
- Semantics: proper HTML and ARIA where needed.

## Brand Assets

### Logo

The Pond logo is four unit primitives on a 20-unit grid: a green triangle, a blue circle, a red square, and a yellow triangle pointing down. The circle is the pond. The other three are the kit of parts around it.

Do not rearrange, recolor, or rotate the shapes. The last triangle points down on purpose: four different forms, not a repeated pair.

Assets live in `docs/brand/logo/`:

| File | Use |
| --- | --- |
| `mark.svg` | Primary. Nav, masthead, slides. |
| `icon.svg` | App icon, avatar, favicon. The same four forms in a 2×2. |
| `profile-light.png` / `profile-dark.png` | 1024px profile pictures. Padded so a circular crop does not clip the shapes. SVG sources sit next to them. |
| `header-light.png` / `header-dark.png` | 1500×500 Twitter/X headers. Booster K1, Unitree H2, YAM arm, and Unitree Go2 at true scale on a checkerboard floor, working a cube. No mark. |
| `wordmark.svg` | The word *pond* in Pond Sans Bold, lowercase, ink. |
| `wordmark-color.svg` | Same, with the *o* in Pond Blue. Use when the mark is not beside it. |
| `lockup.svg` | Mark + ink wordmark. Headers, print, GitHub social. |
| `*-dark.svg` / `*-mono.svg` | Dark-surface and single-color versions. Mono uses `currentColor`. |
| `construction.svg` | The 20-unit grid the mark is built on. |

`docs/logo.svg` and `docs/favicon.svg` are copies of the mark and icon for the docs site.

**Clear space:** ≥1× the module (the 20-unit square). **Minimum size:** mark 24px tall, icon 16px, wordmark 20px x-height.

**Lockup:** mark on the left, wordmark on the right. Gap is half the mark height. The word's x-height matches the 20-unit module.

**Don't:** outline the shapes, add shadows, swap the yellow triangle back to pointing up, or set the wordmark in any face other than Pond Sans Bold.

### File Formats

- Vector: SVG for web, AI/EPS for print.
- Raster: PNG for web, TIFF for print.
- Web fonts: include sensible fallbacks.

## Quality Standards

### Design Review

- Typography follows scale; spacing follows 8px grid.
- Color meets contrast requirements.
- Layout aligns to grid with clear hierarchy.

### Content Review

- Technical accuracy verified by a subject-matter expert.
- Voice consistent with this guide.
- Accessible and performant.

---

## Personality & Whimsy

Pond is serious about craft, not solemn. Let small touches make the experience friendlier without getting in the way.

- Micro-interactions: subtle, helpful feedback.
- Easter eggs: lightweight and opt‑in; never block tasks.
- Tone: a dry joke is fine; clarity comes first.
- Space: generous breathing room; comfort over ornament.
