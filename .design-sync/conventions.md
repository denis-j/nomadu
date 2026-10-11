# Nomadu conventions (read first)

Nomadu is an iOS travel app (React Native). These components are the app's real code compiled for the web through react-native-web, so design as a **phone screen**: about 390px wide, light background, generous rounding, the system sans font.

## Setup

Wrap every screen in `SafeAreaProvider`. `UpdateBanner` throws "No safe area value available" without it. Pass `initialMetrics` so it renders on the first frame:

```jsx
const { SafeAreaProvider } = window.Nomadu;
<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
  {screen}
</SafeAreaProvider>
```

## Styling idiom

No CSS classes. Components style themselves; you configure them with props. For your own layout glue (screen padding, headings, section stacks) use plain elements with inline styles and the tokens in `styles.css`:

| Family | Tokens |
|---|---|
| Surfaces | `--color-background` (screen, #F8F9FA), `--color-surface` (cards, white), `--color-surface-secondary`, `--color-border` |
| Text | `--color-text`, `--color-text-secondary`, `--color-text-tertiary` |
| Brand | `--color-accent` (#E8976E, warm highlight), `--color-cloudy-blue`, `--color-cloudy-button-text` (navy label on CloudyButton) |
| Semantic | `--color-success`, `--color-warning`, `--color-error` |
| Type | `--type-<style>-size` / `-weight` / `-letter-spacing` for `brand-display`, `display-large`, `title-large`, `title-medium`, `title-small`, `body`, `body-small`, `label`, `caption`, `eyebrow`, `button-large` |
| Font | `--font-sans` |

The same values are on `window.Nomadu.Colors` (e.g. `Colors.accent`) and `window.Nomadu.Typography` (e.g. `Typography.titleLarge`, a style object with fontSize/fontWeight/letterSpacing), which is handy for props like `accent` or `color`.

Icons: `Ionicons` (`name`, `size`, `color`). Outline glyphs end in `-outline` (`bed-outline`, `calendar-outline`). Filled glyphs are for active or emphasis states (`airplane`, `sparkles`, `checkmark-circle`).

## Patterns

- One primary action per screen: `CloudyButton`, with children as the label in `--color-cloudy-button-text`, weight 700. Center the label with `innerStyle={{ justifyContent: 'center' }}`. Secondary actions are quiet text or `GlassPill`s, never a second CloudyButton.
- Selection rows: `PillRow` (filters, one active), `YearPicker`, `TransportPicker`. An active pill is filled black with white text.
- Facts: three `StatTile`s inside a `StatRow` under a title. Headline numbers: `StatCard`s in a 2-column grid.
- Lists of trips: `TripCard` on `--color-background`; `end_date: null` marks the ongoing trip.
- Empty screens: `EmptyState` (emoji, title, one sentence), optionally above a CloudyButton.

## Where the truth lives

Read `components/general/<Name>/<Name>.prompt.md` and `<Name>.d.ts` before using a component; each `.prompt.md` has working examples. Tokens live in `styles.css` (it imports `_ds_bundle.css`).

## Example

```jsx
const { SafeAreaProvider, StatRow, StatTile, CloudyButton, Ionicons, Colors } = window.Nomadu;
<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
  <div style={{ background: 'var(--color-background)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
    <h1 style={{ margin: 0, fontSize: 'var(--type-title-large-size)', fontWeight: 'var(--type-title-large-weight)' }}>Lisbon</h1>
    <StatRow>
      <StatTile label="Duration" value="14" unit="days" />
      <StatTile label="Stops" value="5" />
      <StatTile label="Starts" value="Mar 3" />
    </StatRow>
    <CloudyButton onPress={() => {}}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Ionicons name="sparkles" size={22} color={Colors.cloudyButtonText} />
        <span style={{ fontSize: 17, fontWeight: 700, color: Colors.cloudyButtonText }}>Import from screenshots</span>
      </div>
    </CloudyButton>
  </div>
</SafeAreaProvider>
```
