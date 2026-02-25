# ClassPulse — Color Palette Reference

## Primary Brand Color

The entire ClassPulse UI is built around a **Blue** primary brand color.

| Name | Hex Code | HSL | Usage |
|------|----------|-----|-------|
| **Primary Blue** | `#3B82F6` | `hsl(217, 91%, 60%)` | Primary buttons, links, active states, brand identity |

---

## 1. Blue Palette (Primary Theme)

| Shade | Hex Code | CSS Variable | Usage |
|-------|----------|-------------|-------|
| Blue 50 | `#EFF6FF` | `--blue-50` | Light backgrounds, hover states, card highlights |
| Blue 100 | `#DBEAFE` | `--blue-100` | Badge backgrounds, info containers, subtle fills |
| Blue 200 | `#BFDBFE` | `--blue-200` | Border highlights, selected card borders |
| Blue 300 | `#93C5FD` | `--blue-300` | Footer subtitle text, link hover states |
| Blue 400 | `#60A5FA` | `--blue-400` | Secondary text accent, icon fills, hover borders |
| **Blue 500** | **`#3B82F6`** | `--blue-500` | **Primary brand color** — buttons, links, scrollbar, focus rings |
| Blue 600 | `#2563EB` | `--blue-600` | Button hover state, gradient mid-point, footer background |
| Blue 700 | `#1D4ED8` | `--blue-700` | Gradient end-point, dark hover state, text gradient |
| Blue 800 | `#1E40AF` | `--blue-800` | Dark mode gradient start, deep accent |
| Blue 900 | `#1E3A8A` | `--blue-900` | Dark mode deep backgrounds, dark badges |
| Blue 950 | `#172554` | — | Darkest blue accent |

### Primary Gradients Used

| Gradient | Colors | Where Used |
|----------|--------|------------|
| Navbar | `#3B82F6` → `#2563EB` → `#1D4ED8` | Top navigation bar |
| Footer | `#3B82F6` → `#2563EB` → `#1D4ED8` | Footer background |
| Footer (dark) | `#1E40AF` → `#1D4ED8` → `#1E3A8A` | Footer background (dark mode) |
| Buttons | `#3B82F6` → `#2563EB` → `#2563EB` | Login, Register, Submit buttons |
| Auth Background | `#93C5FD` → `#60A5FA` → `#3B82F6` | Login/Register page background |
| Text Gradient | `#1D4ED8` → `#3B82F6` → `#60A5FA` | Branded heading text |
| Modal Header | `#2563EB` → `#1D4ED8` | Privacy, Cookie, Feedback modals |

---

## 2. Gray Palette (Neutral / UI Structure)

| Shade | Hex Code | Usage |
|-------|----------|-------|
| Gray 50 | `#F9FAFB` | Table header backgrounds, subtle fills |
| Gray 100 | `#F3F4F6` | Social icon backgrounds, card backgrounds |
| Gray 200 | `#E5E7EB` | Input borders, divider lines |
| Gray 300 | `#D1D5DB` | Disabled borders, placeholder icons |
| Gray 400 | `#9CA3AF` | Placeholder text, muted icons |
| Gray 500 | `#6B7280` | Secondary text, descriptions |
| Gray 600 | `#4B5563` | Input labels, category text |
| Gray 700 | `#374151` | Dark mode input backgrounds, dark card borders |
| Gray 800 | `#1F2937` | Dark mode card backgrounds, dark mode panels |
| Gray 900 | `#111827` | Dark mode page backgrounds, glassmorphism dark |

---

## 3. Semantic Colors (Status & Feedback)

### Green — Success / Active Students

| Shade | Hex Code | Usage |
|-------|----------|-------|
| Green 100 | `#DCFCE7` | Success badge background |
| Green 300 | `#86EFAC` | Active student text (dark mode) |
| Green 400 | `#4ADE80` | Success indicator |
| Green 500 | `#22C55E` | Session create header, live indicator |
| Green 600 | `#16A34A` | Active cluster badge |
| Green 700 | `#15803D` | Active student feedback text (light mode) |
| Emerald 600 | `#059669` | Session creation gradient end |

### Red — Error / At-Risk Students

| Shade | Hex Code | Usage |
|-------|----------|-------|
| Red 100 | `#FEE2E2` | At-risk alert banner background |
| Red 300 | `#FCA5A5` | At-risk text (dark mode) |
| Red 400 | `#F87171` | Animated ping indicator |
| Red 500 | `#EF4444` | At-risk dot, error states |
| Red 600 | `#DC2626` | LIVE badge, alert icon |
| Red 700 | `#B91C1C` | At-risk feedback text (light mode) |

### Yellow / Amber — Warning / Moderate Students

| Shade | Hex Code | Usage |
|-------|----------|-------|
| Yellow 100 | `#FEF9C3` | Warning badge background |
| Yellow 300 | `#FDE047` | Moderate student text (dark mode) |
| Yellow 400 | `#FACC15` | Star rating (filled) |
| Yellow 700 | `#A16207` | Moderate student feedback text (light mode) |
| Yellow 800 | `#854D0E` | Warning badge text |
| Orange 500 | `#F97316` | Course card gradient start |

### Indigo — Course Enrollment / Secondary Accent

| Shade | Hex Code | Usage |
|-------|----------|-------|
| Indigo 100 | `#E0E7FF` | Step badges, enrollment icon backgrounds |
| Indigo 400 | `#818CF8` | Step text (dark mode) |
| Indigo 500 | `#6366F1` | Focus rings, filter active state, course cards |
| Indigo 600 | `#4F46E5` | Apply filter button, enrollment accent |
| Indigo 900 | `#312E81` | Dark mode enrollment backgrounds |

### Purple — Reports / Course Cards

| Shade | Hex Code | Usage |
|-------|----------|-------|
| Purple 100 | `#F3E8FF` | Assessment badge background |
| Purple 500 | `#A855F7` | Course card gradient, social media gradient start |
| Purple 600 | `#9333EA` | Course card gradient end, profile avatar gradient |
| Purple 800 | `#6B21A8` | Assessment badge text |
| Pink 500 | `#EC4899` | Social media gradient end |
| Rose 600 | `#E11D48` | Course card gradient end |

---

## 4. Light Mode Theme Variables

| Variable | HSL Value | Approximate Hex | Usage |
|----------|----------|----------------|-------|
| `--background` | `hsl(217, 100%, 98%)` | `#F5F8FF` | Page background |
| `--foreground` | `hsl(222, 47%, 11%)` | `#0F172A` | Primary text |
| `--muted` | `hsl(217, 33%, 92%)` | `#E2E8F0` | Muted backgrounds |
| `--muted-foreground` | `hsl(215, 16%, 47%)` | `#64748B` | Muted/secondary text |
| `--card` | `hsl(0, 0%, 100%)` | `#FFFFFF` | Card backgrounds |
| `--card-foreground` | `hsl(222, 47%, 11%)` | `#0F172A` | Card text |
| `--border` | `hsl(214, 32%, 85%)` | `#CBD5E1` | Borders |
| `--input` | `hsl(214, 32%, 91%)` | `#E2E8F0` | Input backgrounds |
| `--primary` | `hsl(217, 91%, 60%)` | `#3B82F6` | Primary actions |
| `--primary-foreground` | `hsl(0, 0%, 100%)` | `#FFFFFF` | Text on primary |
| `--secondary` | `hsl(214, 95%, 93%)` | `#DBEAFE` | Secondary backgrounds |
| `--secondary-foreground` | `hsl(222, 47%, 31%)` | `#334155` | Secondary text |
| `--accent` | `hsl(214, 95%, 95%)` | `#EFF6FF` | Accent highlights |
| `--destructive` | `hsl(0, 84%, 60%)` | `#EF4444` | Error/delete actions |
| `--ring` | `hsl(217, 91%, 60%)` | `#3B82F6` | Focus ring |

---

## 5. Dark Mode Theme Variables

| Variable | HSL Value | Approximate Hex | Usage |
|----------|----------|----------------|-------|
| `--background` | `hsl(222, 47%, 6%)` | `#0A0F1A` | Page background |
| `--foreground` | `hsl(214, 32%, 95%)` | `#F1F5F9` | Primary text |
| `--muted` | `hsl(217, 33%, 14%)` | `#1E293B` | Muted backgrounds |
| `--muted-foreground` | `hsl(215, 20%, 60%)` | `#94A3B8` | Muted/secondary text |
| `--card` | `hsl(222, 47%, 10%)` | `#111827` | Card backgrounds |
| `--card-foreground` | `hsl(214, 32%, 95%)` | `#F1F5F9` | Card text |
| `--border` | `hsl(217, 33%, 20%)` | `#1E293B` | Borders |
| `--input` | `hsl(217, 33%, 18%)` | `#1E293B` | Input backgrounds |
| `--primary` | `hsl(217, 91%, 55%)` | `#3B82F6` | Primary actions |
| `--primary-foreground` | `hsl(0, 0%, 100%)` | `#FFFFFF` | Text on primary |
| `--secondary` | `hsl(217, 33%, 18%)` | `#1E293B` | Secondary backgrounds |
| `--destructive` | `hsl(0, 70%, 50%)` | `#D32F2F` | Error/delete actions |
| `--ring` | `hsl(217, 91%, 55%)` | `#3B82F6` | Focus ring |

---

## 6. Special Effect Colors

| Effect | Colors Used | Hex Codes |
|--------|-----------|-----------|
| **Card Hover Shadow** | Blue glow | `rgba(59, 130, 246, 0.2)` and `rgba(59, 130, 246, 0.15)` |
| **Focus Ring Animation** | Blue ring | `rgba(59, 130, 246, 0.4)` → `rgba(59, 130, 246, 0.2)` |
| **Glassmorphism (light)** | White glass | `rgba(255, 255, 255, 0.7)` with `rgba(255, 255, 255, 0.2)` border |
| **Glassmorphism (dark)** | Dark glass | `rgba(17, 24, 39, 0.7)` with `rgba(255, 255, 255, 0.1)` border |
| **Button Glow** | White sweep | `rgba(255, 255, 255, 0.2)` moving left-to-right |
| **Soft Shadow** | Subtle drop | `rgba(0, 0, 0, 0.07)` and `rgba(0, 0, 0, 0.04)` |
| **Scrollbar (light)** | Blue thumb | `#3B82F6` → hover: `#2563EB` |
| **Scrollbar (dark)** | Dark blue thumb | `#2563EB` → hover: `#3B82F6` |

---

## 7. Color Usage by Feature

| Feature | Primary Color | Secondary Colors |
|---------|-------------|-----------------|
| **Navigation Bar** | Blue gradient (`#3B82F6` → `#1D4ED8`) | White text |
| **Footer** | Blue gradient (`#3B82F6` → `#1D4ED8`) | Blue-200 links, White headings |
| **Login / Register** | Blue buttons (`#3B82F6`), Blue background gradient | Gray inputs, White cards |
| **Dashboard Cards** | White / Gray-800 (dark) backgrounds | Blue-600 accents |
| **Active Students** | Green-700 text, Green-600 badge | Green-100 background |
| **Moderate Students** | Yellow-700 text, Yellow badge | Yellow-100 background |
| **At-Risk Students** | Red-700 text, Red-500 dot + ping animation | Red-100 background |
| **Course Cards** | Multi-color gradients (Indigo, Blue, Orange, Pink, Violet) | White text overlay |
| **Forms & Inputs** | Gray-200 borders, Gray-50 fills | Blue-500 focus ring |
| **Tables** | Gray-50 header, White rows | Gray-200 borders |
| **Badges** | Blue-100/800, Purple-100/800, Yellow-100/800 | Per context |
| **Star Rating** | Yellow-400 (filled), Gray-300 (empty) | — |
| **Modals** | Blue gradient header (`#2563EB` → `#1D4ED8`) | White/Gray-800 body |
| **Social Icons** | Gray-100 background, Blue hover | Purple-Pink gradient (social) |

---

## 8. Complete Hex Color Summary

### Most Used Colors (Top 15)

| # | Color | Hex Code | Primary Purpose |
|---|-------|----------|-----------------|
| 1 | Primary Blue | `#3B82F6` | Brand color, buttons, links, focus |
| 2 | White | `#FFFFFF` | Backgrounds, text on blue |
| 3 | Dark Blue | `#2563EB` | Hover states, gradients |
| 4 | Deep Blue | `#1D4ED8` | Gradient endpoints, dark accents |
| 5 | Near Black | `#0F172A` | Light mode text |
| 6 | Light Gray | `#F9FAFB` | Table headers, subtle backgrounds |
| 7 | Gray | `#6B7280` | Secondary text, descriptions |
| 8 | Dark Gray | `#1F2937` | Dark mode cards |
| 9 | Darkest | `#111827` | Dark mode backgrounds |
| 10 | Light Blue | `#EFF6FF` | Highlight backgrounds |
| 11 | Green | `#16A34A` | Active student badge |
| 12 | Red | `#EF4444` | Error states, at-risk alerts |
| 13 | Yellow | `#FACC15` | Star ratings, moderate badge |
| 14 | Indigo | `#6366F1` | Course enrollment, filters |
| 15 | Purple | `#A855F7` | Course cards, report badges |

---

*ClassPulse — Color Palette & Design System Reference*
