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
- Pond Blue: #0000FF — links and accents

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

- Wordmark: Pond in Berkeley Mono.
- Icon: minimal, robotics/automation reference.
- Clear space: ≥1× logo height. Minimum size: 24px height.

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
