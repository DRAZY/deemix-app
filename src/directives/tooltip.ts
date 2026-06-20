import type { Directive, DirectiveBinding } from 'vue'

// v-tooltip — a small, dependency-free replacement for native HTML `title`.
//
// Native `title` is unreliable: browser-controlled long delay, a single
// lingering instance, and stale/mispositioned text that can bleed from an
// adjacent element (the Sync-view row icons where only one label seemed to
// show — the green enable/disable "eye" displaying the sync button's "Sync
// Now"). This directive renders one controlled, body-teleported node so each
// element shows its own label instantly, correctly positioned, with no
// lingering. Usage: replace `:title="x"` with `v-tooltip="x"`.

const SHOW_DELAY_MS = 250

// Module-level singleton — only ever one tooltip node in the DOM. Kills the
// "stale/lingering" class of bug that native `title` exhibits.
let tipEl: HTMLDivElement | null = null
let showTimer: ReturnType<typeof setTimeout> | null = null
let activeEl: HTMLElement | null = null

interface TooltipState {
  text: string
  onEnter: () => void
  onLeave: () => void
  onFocus: () => void
  onBlur: () => void
}

const stateMap = new WeakMap<HTMLElement, TooltipState>()

function ensureTipEl(): HTMLDivElement {
  if (!tipEl) {
    tipEl = document.createElement('div')
    // Theme-matched via global Tailwind classes (works even though the node
    // lives on <body>, outside the app tree). Positioning is inline.
    tipEl.className =
      'bg-background-secondary text-foreground text-xs rounded px-2 py-1 shadow-lg border border-white/10'
    tipEl.style.position = 'fixed'
    tipEl.style.zIndex = '9999'
    tipEl.style.pointerEvents = 'none'
    tipEl.style.maxWidth = '320px'
    tipEl.style.whiteSpace = 'nowrap'
    tipEl.setAttribute('role', 'tooltip')
    document.body.appendChild(tipEl)
  }
  return tipEl
}

function positionTip(el: HTMLElement) {
  const tip = ensureTipEl()
  const rect = el.getBoundingClientRect()
  const tipRect = tip.getBoundingClientRect()
  const margin = 6

  // Default above; flip below if it would clip the viewport top.
  let top = rect.top - tipRect.height - margin
  if (top < margin) top = rect.bottom + margin

  // Center horizontally over the element, clamped to the viewport.
  let left = rect.left + rect.width / 2 - tipRect.width / 2
  const maxLeft = window.innerWidth - tipRect.width - margin
  if (left < margin) left = margin
  if (left > maxLeft) left = Math.max(margin, maxLeft)

  tip.style.top = `${Math.round(top)}px`
  tip.style.left = `${Math.round(left)}px`
}

function hideTip() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
  if (tipEl) tipEl.style.visibility = 'hidden'
  activeEl = null
}

function showTipFor(el: HTMLElement) {
  const state = stateMap.get(el)
  if (!state || !state.text) return
  const tip = ensureTipEl()
  tip.textContent = state.text
  tip.style.visibility = 'hidden'
  // Make it measurable, then position and reveal.
  positionTip(el)
  tip.style.visibility = 'visible'
  activeEl = el
}

function scheduleShow(el: HTMLElement) {
  if (showTimer) clearTimeout(showTimer)
  showTimer = setTimeout(() => showTipFor(el), SHOW_DELAY_MS)
}

function attach(el: HTMLElement, text: string) {
  const onEnter = () => scheduleShow(el)
  const onLeave = () => { if (activeEl === el || showTimer) hideTip() }
  const onFocus = () => showTipFor(el)
  const onBlur = () => { if (activeEl === el) hideTip() }

  el.addEventListener('mouseenter', onEnter)
  el.addEventListener('mouseleave', onLeave)
  el.addEventListener('click', onLeave) // hide once the action fires
  el.addEventListener('focus', onFocus)
  el.addEventListener('blur', onBlur)

  el.setAttribute('aria-label', text)
  stateMap.set(el, { text, onEnter, onLeave, onFocus, onBlur })
}

function detach(el: HTMLElement) {
  const state = stateMap.get(el)
  if (!state) return
  el.removeEventListener('mouseenter', state.onEnter)
  el.removeEventListener('mouseleave', state.onLeave)
  el.removeEventListener('click', state.onLeave)
  el.removeEventListener('focus', state.onFocus)
  el.removeEventListener('blur', state.onBlur)
  stateMap.delete(el)
  // If this element's tooltip was open, tear it down so no orphan lingers.
  if (activeEl === el) hideTip()
}

function normalize(value: unknown): string {
  return value == null ? '' : String(value)
}

export const tooltip: Directive<HTMLElement, unknown> = {
  mounted(el, binding: DirectiveBinding) {
    const text = normalize(binding.value)
    if (text) attach(el, text)
  },
  updated(el, binding: DirectiveBinding) {
    const text = normalize(binding.value)
    const state = stateMap.get(el)
    if (!state && text) {
      attach(el, text)
    } else if (state && text !== state.text) {
      // Reactive label changed (e.g. enable/disable toggling "Disable"↔"Enable").
      state.text = text
      el.setAttribute('aria-label', text)
      if (activeEl === el && tipEl) tipEl.textContent = text
    } else if (state && !text) {
      detach(el)
    }
  },
  beforeUnmount(el) {
    detach(el)
  }
}

export default tooltip
