# Haptic Feedback in BUSGO

## Why the `web-haptics` Library Didn't Work

The original implementation used the [`web-haptics`](https://haptics.lochie.me/) library, which failed for two reasons:

1. **Android**: `navigator.vibrate()` was called correctly, but the library wrapped it in an `async` function triggered from a `pointerdown` capture handler. The indirection and timing caused browsers to silently reject the vibration as it didn't meet user-gesture requirements.

2. **iOS**: The library relies on programmatically `.click()`-ing a hidden `<input type="checkbox" switch>` element, which triggers iOS Safari's `UIFeedbackGenerator`. However, calling `.click()` from inside an unrelated `pointerdown` event handler is **not treated as a trusted user gesture** by Safari — the haptic is silently ignored.

3. **Event interference**: Using `pointerdown` in capture phase interfered with the mobile browser's tap gesture recognition chain, causing buttons to require a **double-tap** to activate.

## Current Implementation

Haptics are now handled directly in `main.jsx` without any library dependency.

### How It Works

| Platform | Mechanism |
|----------|-----------|
| **Android** (Chrome/Firefox) | `navigator.vibrate([30, 60, 40])` — double-pulse success pattern |
| **iOS** (Safari) | Hidden `<input type="checkbox" switch>` toggled via `.click()` — triggers `UIFeedbackGenerator` |

The global `HapticManager` component in `main.jsx` listens for `click` events (capture phase) to avoid interfering with button activation. Using `click` instead of `pointerdown` means the button activates first, then the haptic fires (~50ms later, imperceptible).

### Where Haptics Trigger

| Interaction | How it's detected |
|-------------|-------------------|
| Buttons, links, `[role="button"]` | Global `click` handler matches these selectors |
| Bottom menu station cards | `data-haptic` attribute on `StopItem` |
| Bus departure rows | `data-haptic` attribute on `Arrival` component |
| Map station markers | Custom `document.dispatchEvent(new Event('haptic'))` from `MapGL.jsx` |

### Suppressed Haptics

- Tapping an **already-selected station** (bottom menu or map) does **not** trigger haptic feedback.
  - `StopItem`: `data-haptic` is conditionally rendered only when `!isSelected`
  - `MapGL`: the click handler checks if the stop matches `selectedStop` before dispatching

## Adding Haptics to New Elements

### Option 1: DOM elements (buttons, cards, etc.)

Add the `data-haptic` attribute to any clickable element:

```jsx
<div onClick={handleClick} data-haptic>
  Tap me for haptics
</div>
```

To conditionally disable haptics:

```jsx
<div onClick={handleClick} data-haptic={shouldHaptic ? '' : undefined}>
  Conditionally haptic
</div>
```

### Option 2: Non-DOM interactions (canvas, maps, etc.)

Dispatch a custom event on `document`:

```js
document.dispatchEvent(new Event('haptic'));
```

## Platform Notes

- **Android**: `navigator.vibrate()` is widely supported in Chrome and Firefox. It does **not** work in WebView or some OEM browsers.
- **iOS**: The `<input switch>` trick only works in **Safari 17.4+** and requires the interaction to originate from a user gesture. It may break in future Safari updates as Apple hasn't officially documented this behavior.
- **Desktop**: No haptic feedback (silently skipped).
