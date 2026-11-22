import { Component, input } from '@angular/core';

export type IconName =
  | 'close'
  | 'check'
  | 'plus'
  | 'minus'
  | 'spinner'
  | 'arrow-right'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'info'
  | 'alert'
  | 'sparkle'
  | 'target'
  | 'star';

@Component({
  selector: 'cap-icon',
  styles: [
    ':host { display: inline-flex; align-items: center; justify-content: center; flex: none; line-height: 0; }',
  ],
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.width]="size()"
      [attr.height]="size()"
      [class.girando]="spin()"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('close') {
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        }
        @case ('check') {
          <path d="M20 6 9 17l-5-5" />
        }
        @case ('plus') {
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        }
        @case ('minus') {
          <path d="M5 12h14" />
        }
        @case ('spinner') {
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        }
        @case ('arrow-right') {
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        }
        @case ('chevron-left') {
          <path d="m15 18-6-6 6-6" />
        }
        @case ('chevron-right') {
          <path d="m9 18 6-6-6-6" />
        }
        @case ('chevron-down') {
          <path d="m6 9 6 6 6-6" />
        }
        @case ('info') {
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        }
        @case ('alert') {
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <path d="M12 16h.01" />
        }
        @case ('sparkle') {
          <path
            d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z"
          />
        }
        @case ('target') {
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
        }
        @case ('star') {
          <polygon
            points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
            fill="currentColor"
          />
        }
      }
    </svg>
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input<number>(16);
  readonly spin = input<boolean>(false);
}
