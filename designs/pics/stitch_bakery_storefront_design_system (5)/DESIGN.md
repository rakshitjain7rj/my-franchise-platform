---
name: Confectionery Core
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f4'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#4f434c'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#80737d'
  outline-variant: '#d2c2cd'
  surface-tint: '#69596b'
  primary: '#1f1322'
  on-primary: '#ffffff'
  primary-container: '#352737'
  on-primary-container: '#a08da0'
  inverse-primary: '#d5c0d5'
  secondary: '#ac2471'
  on-secondary: '#ffffff'
  secondary-container: '#fd68b3'
  on-secondary-container: '#6c0042'
  tertiary: '#1c1427'
  on-tertiary: '#ffffff'
  tertiary-container: '#31283d'
  on-tertiary-container: '#9a8ea8'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#f2dcf1'
  primary-fixed-dim: '#d5c0d5'
  on-primary-fixed: '#241726'
  on-primary-fixed-variant: '#514252'
  secondary-fixed: '#ffd8e6'
  secondary-fixed-dim: '#ffb0d0'
  on-secondary-fixed: '#3d0024'
  on-secondary-fixed-variant: '#8c0058'
  tertiary-fixed: '#ebddf9'
  tertiary-fixed-dim: '#cfc1dd'
  on-tertiary-fixed: '#20182c'
  on-tertiary-fixed-variant: '#4c4359'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  card-padding: 20px
---

## Brand & Style

The design system for this bakery storefront dashboard is built on a "Modern Confectionery" aesthetic—a blend of playful indulgence and streamlined utility. The brand personality is optimistic, warm, and rewarding, aiming to evoke the delight of a treat-filled break. 

The system utilizes a multi-modal approach to style, allowing for the dashboard to pivot between five distinct visual expressions:
- **Pastel Pop:** A 3D-inspired, playful interface with thick strokes and "sticker" depth.
- **Neon Glow:** A high-contrast dark mode with vibrant luminescence for a high-energy, late-night cafe feel.
- **Glassmorphism:** A sophisticated, airy aesthetic using frosted layers and soft gradients.
- **Bento Box:** A modular, high-efficiency grid layout emphasizing information hierarchy.
- **Minimalist Sweet:** A clean, typography-first approach that uses whitespace to create a premium feel.

The target audience ranges from casual cake lovers to frequent loyalty-member shoppers, requiring a UI that is both accessible and highly engaging.

## Colors

The palette is anchored by a triad of high-character hues, now adjusted for a more sophisticated, muted primary foundation:
- **Muted Plum (#C6B2C6):** The new primary color, offering a softer take on the brand's purple heritage. It is used for primary UI elements where a gentler touch is required.
- **Vibrant Pink (#FF69B4):** The secondary action color, reserved for CTAs, loyalty milestones, and critical status indicators to provide high-energy contrast.
- **Soft Lavender (#E2D4F0):** The tertiary foundational color, providing a soft, non-clinical environment for backgrounds and large surfaces.
- **Deep Purple (#4A154B):** Retained as the structural grounding color to ensure high legibility for headings and deep accents.

### Thematic Color Variations
- **Light Mode:** Uses Lavender backgrounds with Crisp White cards.
- **Dark Mode (Neon Glow):** Shifts to a Deep Violet-Black canvas (#1A0A1A) with magenta neon glow effects.
- **Glassmorphism:** Utilizes a diagonal gradient from Lavender to Pink as the base layer for frosted containers.

## Typography

The typography strategy balances friendly roundedness with professional clarity. **Plus Jakarta Sans** is used for headlines and labels to provide a welcoming, geometric feel. **Be Vietnam Pro** is used for body copy to ensure excellent readability in data-heavy dashboard sections.

For the **Minimalist Sweet** theme, headlines should be scaled up significantly (using `headline-xl`) to serve as the primary navigational anchors, replacing heavy borders or background containers. In the **Neon Glow** theme, white or magenta text is used exclusively to maintain contrast against dark backgrounds.

## Layout & Spacing

This design system utilizes a **Bento Box** inspired modular grid. Content is organized into discrete rectangular units that adapt to screen size.

- **Desktop:** A 12-column grid with wide 48px margins to allow the "Lavender" background to frame the content.
- **Tablet:** An 8-column grid with 24px margins.
- **Mobile:** A single-column fluid stack with 16px side margins.

For the **Bento Box** pattern specifically, cards should have varying aspect ratios (e.g., a 2x2 loyalty card next to a 1x1 quick-order card) to create a dynamic, organized collage. In the **Minimalist Sweet** pattern, spacing between sections should increase by 1.5x to emphasize whitespace.

## Elevation & Depth

Elevation is the primary differentiator between the system's five themes:

- **Pastel Pop:** Uses "Sticker Depth"—offset, non-blurred shadows in Deep Purple (`8px 8px 0px #4A154B`) to create a 3D, tactile feel.
- **Neon Glow:** Uses "Luminous Depth"—box shadows are replaced with outer glows in Vibrant Pink (`0px 0px 15px #FF69B4`) for active states.
- **Glassmorphism:** Uses "Layered Depth"—white containers at 60% opacity with a `20px` backdrop blur and a `1px` white border.
- **Minimalist Sweet:** Uses "Flat Depth"—no shadows are permitted; depth is created solely through tonal separation using Lavender dividers.
- **Bento Box:** Uses "Inset Depth"—subtle, soft-inner shadows or thin borders to define the modular grid cells.

## Shapes

The shape language is primarily rounded to reinforce the "sweet" brand identity.
- **Standard Roundedness:** 16px (`rounded-lg`) for cards and primary containers.
- **Pastel Pop Variation:** Increase corner radius to 24px (`rounded-xl`) for a more exaggerated, friendly look.
- **Interactive Elements:** Buttons and chips should use a pill-shape (full radius) to contrast against the rectangular cards.
- **Bento Box:** Maintain a consistent 16px radius for all modules to ensure the grid "locks" together visually.

## Components

### Buttons & Actions
- **Primary:** Solid Muted Plum with White text. In the Neon theme, add a glow effect.
- **Secondary/Outline:** Muted Plum border with Pink text, specifically for the Pastel Pop theme.
- **Floating Action (Order Now):** Large, pill-shaped magenta button with high elevation.

### Cards
- **Loyalty/Rewards:** High-priority. In Bento Box style, use a solid Pink background. In Glassmorphism, use the highest blur intensity.
- **Order Tracking:** Features a progress bar in Vibrant Pink.
- **History List:** Clean rows with thin Lavender dividers in the Minimalist theme.

### Feedback & Inputs
- **Checkboxes/Radios:** Circular (pill) shapes only, using Pink for active states.
- **Input Fields:** Soft Lavender fills with Deep Purple labels. Under Neon Glow, use dark backgrounds with Pink borders.
- **Chips:** Small, rounded-pill indicators for order status (e.g., "Baking", "Ready", "Delivered"). Use Soft Lavender for backgrounds with Deep Purple text.

### Dashboard Specifics
- **Points Counter:** Large, high-weight Jakarta Sans typography to celebrate user achievements.
- **Featured Item Cards:** Large imagery with rounded-top corners, blending into the card body.