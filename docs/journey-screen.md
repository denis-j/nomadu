# Journey screen: layout, tokens, motion

The trip page (`app/(tabs)/(plans)/[id].tsx`) as it is built. Values are the
ones in the code; change them there, then here.

## Layout, top to bottom

| Block | Size and placement |
| --- | --- |
| Header | The screen draws its own bar over the map (the native header is off): a 44pt glass back disc, the title chip, a 44pt glass add disc, 16pt from the edges. The chip is a 44pt glass capsule with the trip name (15/600) over the status line (caption, tabular) and the travellers as up to three 24pt faces at its end. Tap morphs the chip into the travellers panel (below), long press opens the trip menu. |
| Map | 360pt tall, bleeds to both edges, bottom corners 28pt. Standard Apple map, own pin image anchored at the bottom centre, dashed route 1.5pt at 45% black. A vertical fade (background 70% to 0%) under the header keeps the title readable over sea. Drawn once as a snapshot; the live map is the fallback. |
| Entry card | Documents. Glass card, radius 18, padding 12 vertical / 14 horizontal, 36pt icon tile, title (16/600) over a grey line, chevron. 16pt before the timeline. |
| Timeline | A 2pt line at x = 13 inside a 28pt gutter, fading in over the first 4% and out over the last 4%. Each stop: a capsule connector ("Flight") 8pt above and below, then a 10pt black dot with a 2pt white ring beside the card. An 8pt grey dot closes the line. |
| Stop card | Glass, radius 18, padding 16, 12pt gap between flag (28pt), text and the right column. City 17/700, country and dates 13 grey, dates tabular. Notes 13 tertiary, two lines. Chips underneath in a 6pt wrap. |
| AI suggestions | Same anatomy as a stop, dashed 1.5pt border instead of a surface, hollow dot. Header is a glass capsule with a chevron; chips are 999-radius capsules, black when active. |
| Bottom | 100pt of padding so the last card clears the floating tab bar. |

Continuous corner curves everywhere (`borderCurve: 'continuous'`).

## Tokens

| Token | Value | Used for |
| --- | --- | --- |
| Radius, card | 18 | stop, suggestion and entry cards |
| Radius, chip | 8 | days badge, visa and stay chips |
| Radius, capsule | 999 | connectors, title chip, AI pills and chips, avatars |
| Radius, map | 28 | bottom corners of the map |
| Gutter | 16 | page sides; 28pt timeline column inside |
| Card padding | 16 | stop and suggestion cards; entry cards 12/14 |
| Chip padding | 8 / 3 | every chip and badge, caption 600 |
| Surface | glass (`regular`) | cards and capsules on iOS 26; `Colors.surface` with a hairline `Colors.border` below that |
| Line | `Colors.primary` at 20% | timeline; `Colors.border` for the end dot and separators |
| Chip fill | colour at 8% (`+ '14'`) | days badge in primary, visa chips in their status colour; the stay chip on `surfaceSecondary` |
| Text | `text`, `textSecondary`, `textTertiary` | title and city; country, dates, subtitles; notes and placeholders |
| Shadows | none on glass | the title chip fallback carries the only drop shadow (0 2 8 at 12%) |

Colour is for meaning only: green, amber and red on visa and tax chips, red on destructive actions. Everything else is black and grey so the glass reads.

## Motion

| What | How |
| --- | --- |
| Header collapse | None: the header is fixed and transparent, the map scrolls under it. The title chip keeps its 44pt height and minimum width from the first frame so nothing shifts when the trip loads. |
| Text changes | `MorphText`: 150ms fade out, swap, 200ms fade in. Compared by string, so a re-render with the same text does not replay it. |
| Connectors | `FadeIn` 250ms on mount, `FadeOut` 150ms on unmount. |
| Reordering | Long press (200ms) with medium haptic lifts the card (`ScaleDecorator`); dates re-flow optimistically along the new order, then persist. |
| AI section | Chevron springs (damping 18, stiffness 200); the list grows and shrinks with a 280ms ease-in-out `LayoutAnimation`. Two skeleton cards while loading; one tappable card on error. |
| Taps | 0.75 opacity while pressed on cards, 0.6 on chips and rows. Light haptic on open, medium on drag and menus, success on save. |
| Tabs | System native tabs; the bar minimises on scroll down. |
| Travellers | The chip morphs like the Map tab's: width to screen minus 32, height to the row plus the panel, radius 22 to 26, 400ms bezier(0.4, 0, 0.2, 1) both ways. The title row stays put, the small faces fade out over the first 30 %, the panel (faces, invite, stop sharing or leave) fades in over the last 60 %. A tap anywhere else folds it back. |
| Sheets | Form sheets with a grabber. A page is never pushed while a sheet is up (see `accommodationBridge`). |

## Empty and loading

- No stops: plane emoji, "No stops yet", one line, the cloudy button. On a friend's trip the line names them and there is no button.
- Map: a tertiary spinner on `surfaceSecondary` until the snapshot exists.
- Suggestions: two skeleton cards (flag block and three bars in `Colors.border`).
