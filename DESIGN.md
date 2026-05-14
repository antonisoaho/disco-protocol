# Design Notes

## Button System

The signed-out login screen defines the app's button language. Buttons are rounded, centered controls with generous mobile touch targets. The shape is intentionally pill-like: it should feel like one consistent interaction system across auth, scoring, dashboard, courses, and social actions.

### Geometry

- Buttons use `inline-flex`, centered horizontal and vertical alignment, and `gap: $space-2` for icon/text combinations.
- Default touch target is `$touch-target-comfortable`.
- Button radius is `999px` for primary, secondary, and danger actions.
- Full-width buttons are a layout decision, not a variant. Use component-level `width: 100%` only when the surrounding form or panel needs it.

### Primary Buttons

Primary buttons use the login submit treatment:

- Green background from `map.get($score-color, eagle)`.
- Dark text `#111827` for contrast.
- Matching green border.
- Soft green shadow for prominence.
- Hover darkens the green while keeping dark text.

Use primary buttons for the single main action in a context: signing in, starting a round, saving a key form, moving to the next hole, or completing a round.

### Secondary Buttons

Ordinary `button` elements are secondary by default:

- Secondary surface: `color-mix(in srgb, var(--surface-bg) 78%, transparent)`.
- Muted text by default, regular text on hover.
- Standard border from `var(--border)`.
- Same centered pill geometry as primary buttons.

Use secondary buttons for optional, reversible, or adjacent actions: toggles, filter actions, navigation alternatives, profile saves, and non-primary form actions.

### Danger Buttons

Danger buttons keep the shared geometry but use the red semantic score token:

- Foreground and border based on `map.get($score-color, double-bogey-plus)`.
- Subtle red-tinted background.
- Same pill radius and centered alignment.

Use danger buttons for destructive or removal actions. Do not make destructive actions green, even when they are the only action in the panel.

### Links That Look Like Buttons

CTA links may use button styling when they represent navigation actions. They should follow the same visual hierarchy:

- Primary CTA links match primary buttons.
- Secondary CTA links match secondary buttons.
- They keep `text-decoration: none`, visible focus rings, and visited color rules that do not create browser-default purple links.

### Exceptions

Icon-only controls may keep compact sizing when the surrounding UI requires it, but they should still use rounded geometry and centered content. Selection cards, list rows, and score inputs are not button variants; they can keep card or input styling when their shape communicates selection rather than command action.
