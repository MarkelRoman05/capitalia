import {
  DestroyRef,
  Directive,
  ElementRef,
  effect,
  inject,
  input,
} from '@angular/core';
import {
  arrow,
  autoUpdate,
  computePosition,
  flip,
  offset,
  Placement,
  shift,
} from '@floating-ui/dom';

let nextTooltipId = 0;

@Directive({
  selector: '[capTooltip]',
  standalone: true,
  host: {
    '(mouseenter)': 'onEnter()',
    '(mouseleave)': 'hide()',
    '(focus)': 'onFocus()',
    '(blur)': 'hide()',
    '(click)': 'hide()',
    '(keydown.escape)': 'hide()',
  },
})
export class CapTooltipDirective {
  readonly capTooltip = input<string | null | undefined>('');
  readonly capTooltipPlacement = input<Placement>('top');
  readonly capTooltipDelay = input<number>(140);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private tooltipEl: HTMLDivElement | null = null;
  private textEl: HTMLSpanElement | null = null;
  private arrowEl: HTMLSpanElement | null = null;
  private cleanupAutoUpdate: (() => void) | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly tooltipId = `cap-tooltip-${++nextTooltipId}`;

  constructor() {
    effect(() => {
      const text = (this.capTooltip() ?? '').trim();
      if (!text) {
        this.hide();
        return;
      }
      if (this.textEl) {
        this.textEl.textContent = text;
        this.updatePosition();
      }
    });

    this.destroyRef.onDestroy(() => {
      this.hide();
    });
  }

  onEnter(): void {
    this.scheduleShow(this.capTooltipDelay());
  }

  onFocus(): void {
    this.scheduleShow(60);
  }

  private scheduleShow(delay: number): void {
    const text = (this.capTooltip() ?? '').trim();
    if (!text || typeof document === 'undefined') return;
    this.clearTimer();
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      this.show(text);
    }, delay);
  }

  private show(text: string): void {
    if (this.tooltipEl || typeof document === 'undefined') return;
    const host = this.el.nativeElement;

    const tip = document.createElement('div');
    tip.className = 'cap-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.id = this.tooltipId;

    const span = document.createElement('span');
    span.className = 'cap-tooltip-text';
    span.textContent = text;

    const arr = document.createElement('span');
    arr.className = 'cap-tooltip-arrow';
    arr.setAttribute('aria-hidden', 'true');

    tip.appendChild(span);
    tip.appendChild(arr);
    document.body.appendChild(tip);

    this.tooltipEl = tip;
    this.textEl = span;
    this.arrowEl = arr;

    host.setAttribute('aria-describedby', this.tooltipId);

    this.cleanupAutoUpdate = autoUpdate(host, tip, () => {
      this.updatePosition();
    });

    requestAnimationFrame(() => {
      this.tooltipEl?.classList.add('is-visible');
    });
  }

  private updatePosition(): void {
    if (!this.tooltipEl || !this.arrowEl) return;
    const host = this.el.nativeElement;
    const tip = this.tooltipEl;
    const arr = this.arrowEl;

    void computePosition(host, tip, {
      placement: this.capTooltipPlacement(),
      middleware: [
        offset(9),
        flip({ padding: 8 }),
        shift({ padding: 10 }),
        arrow({ element: arr, padding: 6 }),
      ],
    }).then(({ x, y, placement, middlewareData }) => {
      if (!this.tooltipEl || this.tooltipEl !== tip) return;

      tip.style.left = `${Math.round(x)}px`;
      tip.style.top = `${Math.round(y)}px`;

      const side = placement.split('-')[0] as 'top' | 'bottom' | 'left' | 'right';
      tip.dataset['side'] = side;

      const staticSide: Record<'top' | 'bottom' | 'left' | 'right', string> = {
        top: 'bottom',
        right: 'left',
        bottom: 'top',
        left: 'right',
      };

      const ax = middlewareData.arrow?.x;
      const ay = middlewareData.arrow?.y;
      arr.style.left = ax != null ? `${Math.round(ax)}px` : '';
      arr.style.top = ay != null ? `${Math.round(ay)}px` : '';
      arr.style.right = '';
      arr.style.bottom = '';
      arr.style[staticSide[side] as 'top' | 'bottom' | 'left' | 'right'] = '-4px';
    });
  }

  hide(): void {
    this.clearTimer();
    if (this.cleanupAutoUpdate) {
      this.cleanupAutoUpdate();
      this.cleanupAutoUpdate = null;
    }
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
      this.textEl = null;
      this.arrowEl = null;
    }
    const host = this.el.nativeElement;
    if (host.getAttribute('aria-describedby') === this.tooltipId) {
      host.removeAttribute('aria-describedby');
    }
  }

  private clearTimer(): void {
    if (this.showTimer !== null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }
}
