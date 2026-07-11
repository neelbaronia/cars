import { useCallback, useEffect, useRef } from 'react'

const EMPTY_INPUT = { left: false, right: false, up: false, down: false }
const KEY_MAP = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

function isInteractiveTarget(target) {
  return target instanceof Element && target.closest(
    'input, textarea, select, button, a[href], [contenteditable="true"], [role="slider"], [role="combobox"], [role="listbox"]',
  )
}

export function usePerspectiveInput() {
  const perspectiveInputRef = useRef({ ...EMPTY_INPUT })

  const releasePerspective = useCallback(() => {
    perspectiveInputRef.current = { ...EMPTY_INPUT }
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      const control = KEY_MAP[event.key]
      if (!control || event.metaKey || event.ctrlKey || event.altKey || isInteractiveTarget(event.target)) return
      event.preventDefault()
      perspectiveInputRef.current = { ...perspectiveInputRef.current, [control]: true }
    }
    const onKeyUp = (event) => {
      const control = KEY_MAP[event.key]
      if (!control) return
      if (!event.metaKey && !event.ctrlKey && !event.altKey && !isInteractiveTarget(event.target)) event.preventDefault()
      perspectiveInputRef.current = { ...perspectiveInputRef.current, [control]: false }
    }
    window.addEventListener('keydown', onKeyDown, { passive: false })
    window.addEventListener('keyup', onKeyUp, { passive: false })
    window.addEventListener('blur', releasePerspective)
    document.addEventListener('visibilitychange', releasePerspective)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releasePerspective)
      document.removeEventListener('visibilitychange', releasePerspective)
    }
  }, [releasePerspective])

  return { perspectiveInputRef, releasePerspective }
}
