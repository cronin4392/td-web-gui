import { For, createSignal, type JSX } from 'solid-js';
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

  const actions = () => [...menu.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];

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
    actions()[0]?.focus();
  }

  function onKeyDown(event: KeyboardEvent): void {
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
          opener?.focus();
          opener = null;
        });
      }}
      popover="auto"
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
