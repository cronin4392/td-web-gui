import { For, createSignal, onCleanup, type JSX } from 'solid-js';
import { menuPosition, type MenuItems } from './menu';
import styles from './ContextMenu.module.css';

export type { MenuAction, MenuItems } from './menu';

/** A text field keeps Chrome's own menu: cut/copy/paste and spellcheck are
 * worth more there than whatever panel action sits behind it. */
function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea'))
  );
}

export interface ContextMenu {
  open: (event: MouseEvent, items: MenuItems) => void;
  element: JSX.Element;
}

/** One popover per panel, items built at open time — a grid mounts one menu, not one per tile. */
export function createContextMenu(): ContextMenu {
  const [items, setItems] = createSignal<MenuItems>([]);
  let menu!: HTMLDivElement;
  let opener: HTMLElement | null = null;
  /** The press that dismissed the menu is spent on the dismissal: clicking out
   * through a scene tile closes the menu and does not also load the scene. */
  let dismissing = false;

  const actions = () => [...menu.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];

  // `manual` rather than `auto` precisely because auto's light dismiss fires on
  // pointerdown and lets the click through; owning the dismissal is what lets
  // the click that caused it be swallowed below. The cost is Escape, which
  // `onKeyDown` handles instead.
  function dismissOnOutsidePress(event: PointerEvent): void {
    dismissing = false;
    if (!menu.matches(':popover-open') || event.composedPath().includes(menu)) return;
    // Only a primary press goes on to fire `click`; arming the flag for a right
    // press — which opens the next menu instead — would strand it set, and the
    // next keyboard activation anywhere would be swallowed in its place.
    dismissing = event.button === 0;
    menu.hidePopover();
  }

  // Capture on the document, so it lands before Solid's delegated handlers and
  // before the element's own. A press that never becomes a click — a drag —
  // leaves the flag set, which the next press clears before its own click.
  function swallowDismissingClick(event: MouseEvent): void {
    if (!dismissing) return;
    dismissing = false;
    event.preventDefault();
    event.stopPropagation();
  }

  document.addEventListener('pointerdown', dismissOnOutsidePress, true);
  document.addEventListener('click', swallowDismissingClick, true);
  onCleanup(() => {
    document.removeEventListener('pointerdown', dismissOnOutsidePress, true);
    document.removeEventListener('click', swallowDismissingClick, true);
  });

  function open(event: MouseEvent, next: MenuItems): void {
    // An item with nothing to offer lets the event through to whatever menu the
    // panel behind it has.
    if (next.length === 0) return;
    if (isTextEntry(event.target)) return;
    event.preventDefault();
    // Item menus sit inside panel menus; the innermost one to answer wins.
    event.stopPropagation();

    const showing = menu.matches(':popover-open');
    if (!showing) opener = document.activeElement as HTMLElement | null;
    setItems(next);
    if (!showing) menu.showPopover();

    const box = menu.getBoundingClientRect();
    const at = menuPosition(
      { x: event.clientX, y: event.clientY },
      { width: box.width, height: box.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    menu.style.left = `${at.x}px`;
    menu.style.top = `${at.y}px`;
    // Falls back to the menu itself so Escape has somewhere to land even when
    // every item is disabled.
    (actions()[0] ?? menu).focus();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      menu.hidePopover();
      return;
    }
    const list = actions();
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = (at + 1) % list.length;
        break;
      case 'ArrowUp':
        next = at < 0 ? list.length - 1 : (at - 1 + list.length) % list.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = list.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    list[next]?.focus();
  }

  const element = (
    <div
      ref={(el) => {
        menu = el;
        el.addEventListener('toggle', (event) => {
          if ((event as ToggleEvent).newState !== 'closed') return;
          // Focus left stranded in the hidden menu is ours to restore; focus an
          // action moved elsewhere (a rename box) was claimed on purpose.
          const held = document.activeElement;
          if (!held || held === document.body || el.contains(held)) opener?.focus();
          opener = null;
        });
      }}
      popover="manual"
      role="menu"
      tabIndex={-1}
      class={styles.menu}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <For each={items()}>
        {(item) =>
          item === 'separator' ? (
            <hr class={styles.separator} />
          ) : (
            <button
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={item.checked}
              disabled={item.disabled}
              data-danger={item.danger || undefined}
              class={styles.item}
              onClick={() => {
                menu.hidePopover();
                item.onSelect();
              }}
            >
              <span class={styles.check}>{item.checked ? '✓' : ''}</span>
              {item.label}
            </button>
          )
        }
      </For>
    </div>
  );

  return { open, element };
}
