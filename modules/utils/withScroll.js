import off from 'dom-helpers/events/off'
import on from 'dom-helpers/events/on'
import scrollLeft from 'dom-helpers/query/scrollLeft'
import scrollTop from 'dom-helpers/query/scrollTop'
import requestAnimationFrame from 'dom-helpers/util/requestAnimationFrame'

// Try at most this many times to scroll, to avoid getting stuck.
const MAX_SCROLL_ATTEMPTS = 2

export default function withScroll(
  history,
  shouldUpdateScroll,
  { getScrollPosition, start, stop, updateLocation }
) {
  let checkScrollHandle
  let scrollTarget
  let numScrollAttempts

  function cancelCheckScroll() {
    if (checkScrollHandle !== null) {
      requestAnimationFrame.cancel(checkScrollHandle)
      checkScrollHandle = null
    }
  }

  function onScroll() {
    if (!scrollTarget) {
      return
    }

    const [ xTarget, yTarget ] = scrollTarget
    const x = scrollLeft(window)
    const y = scrollTop(window)

    if (x === xTarget && y === yTarget) {
      scrollTarget = null
      cancelCheckScroll()
    }
  }

  function checkScrollPosition() {
    checkScrollHandle = null

    // We can only get here if scrollTarget is set. Every code path that unsets
    // scroll target also cancels the handle to avoid calling this handler.
    // Still, check anyway just in case.
    /* istanbul ignore if: paranoid guard */
    if (!scrollTarget) {
      return
    }

    const [ x, y ] = scrollTarget
    window.scrollTo(x, y)

    ++numScrollAttempts

    /* istanbul ignore if: paranoid guard */
    if (numScrollAttempts >= MAX_SCROLL_ATTEMPTS) {
      scrollTarget = null
      return
    }

    checkScrollHandle = requestAnimationFrame(checkScrollPosition)
  }

  // TODO: Actually track listener array. This count is not always correct.
  let numListeners = 0

  function checkStart() {
    if (numListeners === 0) {
      if (start) {
        start(history)
      }

      scrollTarget = null
      numScrollAttempts = 0
      checkScrollHandle = null

      on(window, 'scroll', onScroll)
    }

    ++numListeners
  }

  function checkStop() {
    --numListeners

    if (numListeners === 0) {
      if (stop) {
        stop()
      }

      off(window, 'scroll', onScroll)

      cancelCheckScroll()
    }
  }

  function listenBefore(hook) {
    checkStart()
    const unlisten = history.listenBefore(hook)

    return function () {
      unlisten()
      checkStop()
    }
  }

  let currentLocation = null
  let currentUpdateHandle = null

  function updateScrollPosition(scrollPosition) {
    if (scrollPosition && !Array.isArray(scrollPosition)) {
      scrollPosition = getScrollPosition(currentLocation)
    }

    scrollTarget = scrollPosition

    // Check the scroll position to see if we even need to scroll.
    onScroll()
    if (!scrollTarget) {
      return
    }

    numScrollAttempts = 0
    checkScrollPosition()
  }

  function onChange(location) {
    const prevLocation = currentLocation
    currentLocation = location

    listeners.forEach(listener => listener(location))

    // Whatever we were doing before isn't relevant any more.
    cancelCheckScroll()

    // withStandardScroll needs the new location even when not updating the
    // scroll position, to update the current key.
    if (updateLocation) {
      updateLocation(location)
    }

    // We don't need to update the handle here, because it will never be
    // checked, since shouldUpdateScroll cannot change on us.
    if (!shouldUpdateScroll) {
      updateScrollPosition(true)
      return
    }
    if (shouldUpdateScroll.length <= 2) {
      updateScrollPosition(shouldUpdateScroll(prevLocation, location))
      return
    }

    const updateHandle = {}
    currentUpdateHandle = updateHandle

    shouldUpdateScroll(prevLocation, location, scrollPosition => {
      if (updateHandle === currentUpdateHandle) {
        currentUpdateHandle = null
        updateScrollPosition(scrollPosition)
      }
    })
  }

  let listeners = []
  let unlisten

  function listen(listener) {
    checkStart()

    if (listeners.length === 0) {
      unlisten = history.listen(onChange)
    }

    // Add the listener to the list afterward so we can manage calling it
    // initially with the current location.
    listeners.push(listener)
    listener(currentLocation)

    return function () {
      listeners = listeners.filter(item => item !== listener)
      if (listeners.length === 0) {
        unlisten()
      }

      checkStop()
    }
  }

  return {
    ...history,
    listenBefore,
    listen
  }
}