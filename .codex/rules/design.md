---
trigger: always_on
---

# Hermes Chat - Design System

> Based on Stitch project "hermes-agent final" — Neo-brutalist Design System V1.0.

## 1. Overview
**Style:** Modern Neo-brutalism.
**Concept:** High contrast, thick black borders, hard shadows, and saturated colors. The design focuses on raw functionality with a "pop" aesthetic. No gradients, no opacity, no blur/glassmorphism.

## 2. Color Palette
- **Primary (AI):** `#5461EE` (Royal Blue) — AI message card backgrounds, header badges.
- **Secondary (Highlights/Buttons):** `#5EE79D` (Pastel Green) — "New Chat" buttons, send button, "Online" status.
- **Action/Warning:** `#FF8702` (Flush Orange) — "Settings" button, "New Chat" button on mobile, alerts.
- **Main Background:** `#1C1C1C` (Dark Charcoal) — Overall app background and sidebar.
- **Surface/Cards:** `#1A1B23` (Dark Navy Gray) — Input forms, dropdowns, secondary backgrounds, and elevated surfaces.
- **Text/User Cards:** `#FFFFFF` (Pure White) — User message cards, text on dark backgrounds.
- **Borders/Shadows:** `#000000` (Pure Black) — All borders and hard shadows.

## 3. Typography
- **Primary Font:** `Space Grotesk` for all levels (headlines, body, labels).
- **Headline Bold:** Space Grotesk Bold (700), 48px — Main titles, highlight sections.
- **Headline Large:** Space Grotesk Bold (700), 28px, line-height 1.2 — Subtitles.
- **Body Text:** Space Grotesk Regular/Medium (400-500), 16px, line-height 1.5 — Message body text.
- **Label Bold:** Space Grotesk Bold (700), 14px, letter-spacing 0.05em, uppercase — Labels and tags.
- **Stats Large:** Space Grotesk Bold (700), 32px — Important numerical data.
- **General Style:** Bold or Extra-Bold for titles, buttons and labels. Regular/Medium for body text.

## 4. Spacing
- **Base unit:** 4px
- **xs:** 4px
- **sm:** 8px
- **md:** 16px
- **lg:** 24px
- **xl:** 32px
- **Border weight:** 3px on all UI elements.
- **Shadow offset:** 4px (bottom-right).

## 5. Elevation & Depth
- Depth is created **exclusively** with Hard Shadows (rigid shadows).
- **No blur, no gradients, no soft glows**.
- Every card and interactive button must have a solid black shadow with 4px offset (bottom-right).
- When an element is "Pressed" or "Active", the shadow disappears and the element shifts in the offset direction.

## 6. Shapes
- **No border-radius**. All corners are sharp (0px).
- Geometric rigidity is essential to the Neo-brutalist visual.

## 7. Key Components

### Message Cards
- **AI:** Background `#5461EE` (Royal Blue), white text, 3px black border, 4px black shadow (bottom-right).
- **User:** Background `#FFFFFF` (Pure White), black text, 3px black border, 4px black shadow (bottom-right).

### Buttons
- Must have a physical "click" effect where the shadow disappears and the button shifts 4px down and right.
- **Primary Button:** Pastel Green background, black text, 3px black border, 4px black shadow. Uppercase, Bold.
- **Secondary Button:** White background, black text, 3px black border, 4px black shadow.
- **Action/Warning Button:** Flush Orange background, black text, 3px black border, 4px black shadow.
- **Send Button:** Pastel Green background, black arrow, 3px black border, 4px black shadow.

### Inputs
- White background with thick black outline (3px).
- Focus state: border changes to green and doubles shadow thickness.

### Status Badges
- Badges with colored background (green for "Online"), 3px black border, bold text.

## 8. Iconography
- Icons with thick strokes (2-3px), chunky SVG line icon style.
- Icons must not have thin lines or intricate details — they must match the typography weight.
- Set: chat, user, settings, search, bell, attachment, etc.
- Use custom SVG icons that match the Neo-brutalist aesthetic.

## 9. Layout

### Web Desktop
- **Sidebar:** 280px fixed width with `#1C1C1C` background.
- **Main Chat:** Fluid, with max reading width (approx. 800px) centered for messages.
- Sidebar and Chat side by side, separated by a 3px black border.

### Mobile
- Sidebar transforms into a slide drawer (slides from left).
- Header with title and "New Chat" button in Flush Orange.
- Input bar fixed at the bottom with white field and green Send button.
- Conversations in cards with chat icons, black border, black shadow.