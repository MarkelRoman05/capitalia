import { Component, input } from '@angular/core';

@Component({
  selector: 'cap-logo',
  styles: [
    `
      :host {
        display: inline-flex;
        flex: none;
        line-height: 0;
      }
      svg {
        display: block;
      }
    `,
  ],
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      @if (variant() === 'dark') {
        <defs>
          <linearGradient id="cap-logo-bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#1c2547" />
            <stop offset="100%" stop-color="#0f1322" />
          </linearGradient>
        </defs>
        <rect
          width="32"
          height="32"
          rx="8"
          fill="url(#cap-logo-bg)"
          stroke="rgba(255, 255, 255, 0.14)"
          stroke-width="1"
        />
        <path
          d="M 16.84 11.76 A 6 6 0 1 0 16.84 20.24"
          stroke="#eef0f6"
          stroke-width="2.8"
          stroke-linecap="round"
        />
        <path
          d="M 20.4 20.4 V 15.2"
          stroke="#96a6ff"
          stroke-width="2.5"
          stroke-linecap="round"
        />
        <path
          d="M 24.8 20.4 V 10.6"
          stroke="#e0b163"
          stroke-width="2.5"
          stroke-linecap="round"
        />
      } @else {
        <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.12" />
        <path
          d="M 16.84 11.76 A 6 6 0 1 0 16.84 20.24"
          stroke="currentColor"
          stroke-width="2.8"
          stroke-linecap="round"
        />
        <path
          d="M 20.4 20.4 V 15.2"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          opacity="0.72"
        />
        <path
          d="M 24.8 20.4 V 10.6"
          stroke="var(--gold, #e0b163)"
          stroke-width="2.5"
          stroke-linecap="round"
        />
      }
    </svg>
  `,
})
export class LogoComponent {
  size = input<number>(32);
  variant = input<'auto' | 'dark'>('auto');
}
