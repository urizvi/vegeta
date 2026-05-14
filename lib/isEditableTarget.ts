/**
 * Returns true if the event target is an editable element (input, textarea,
 * select, or contenteditable). Used by global keydown handlers to avoid
 * intercepting keys while the user is typing.
 */
export function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}
