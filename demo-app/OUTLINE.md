# Payloom: demo landing page

A realistic test and demo page for Edit Mode: a marketing landing page for a fictional product, **Payloom** (global payroll for remote teams). Agreed with the user on 2026-11-19.

It's a normal Vite + React app, written the way a typical team would: one component per section with a CSS file beside it, and shared colors, spacing and radii as CSS variables (`src/styles/tokens.css`). `sample-app/` stays as it is for the older test suites.

- Your copy: `npm run dev` here, on port **5290**.
- Tests: a copy in the scratchpad on port **5391** (never the user's server).

## Look

Stripe's feel, not its brand: white page, deep navy text, one indigo-violet accent, a soft gradient in the hero and the final call to action, a clean sans-serif (Inter, bundled), small all-caps section labels, a tight grid, layered soft shadows, a frosted-glass nav. No Stripe logo, name or copy.

Product shots (hero window, payslip, feature cards) follow the Stageshow skill's craft rules, built as plain HTML and CSS so they're editable in Edit Mode.

## Sections

1. **Nav**: sticky, frosted glass. Payloom wordmark, Product / Pricing / Customers / Docs, "Sign in", "Start now".
2. **Hero**: "New" pill, headline "Payroll for teams everywhere", one sentence, Start now / Talk to sales, trust line. Right: a browser window with a payroll run and a payslip card overlapping its corner. A slowly moving gradient behind.
3. **Customer logos**: six made-up text wordmarks in gray.
4. **How it works**: three steps (Add your team → Approve the run → Everyone's paid), each with a small illustration card.
5. **Features grid**: world map tile ("Pay people in 90 countries"), currency conversion, compliance checklist, benefits, one big stat ("$2.4B paid out").
6. **For developers**: dark navy band; copy left, code block (Node / Python / curl tabs) and an API status card right.
7. **Testimonials**: three cards with photo, quote, name, role, company.
8. **Pricing**: Monthly / Yearly switch; Starter $29, Growth $49 ("Most popular"), Enterprise custom, each per person, with a feature checklist.
9. **FAQ**: five questions that open and close.
10. **Final call to action**: the gradient again, headline, two buttons.
11. **Footer**: four link columns, email sign-up, legal row.

## Decisions

- **Photos:** Unsplash stock photos if they look good and realistic; otherwise illustrated avatars for a fun style.
- **Hero gradient:** moves slowly; calmer while Edit Mode is on.
- **Developer section:** kept, can be tweaked.

## What it exercises

| Roadmap item | Where |
|---|---|
| 4. Padding and gap handles | Nav, buttons, pricing cards, feature tiles, footer columns |
| 5. Absolute position in auto layout | "Most popular" badge, payslip card over the hero window, "New" pill |
| 6. Text | Two-line headline, all-caps labels, paragraphs, quotes, underlined links |
| 7. Min/max and clip content | Capped content width, the hero window cropped by its frame, the code block |
| 8. Effects, fills, strokes | Gradients, frosted glass, layered shadows, photo fills, dashed borders, tilted cards |
| 9. Shortcuts | Hide, lock, reorder and ungroup across all of it |

## Build order

1. Setup, shared tokens, sections 1–3. Screenshot, agree on the look.
2. Sections 4–11.
3. Product shots to Stageshow's standards.
4. Desktop, tablet and phone widths; a basic test file; commit and push.
