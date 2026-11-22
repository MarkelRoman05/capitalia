# Tokens y Superficies de Capitalia

## Paleta Semántica y Capas de Superficie

### Tema Oscuro (`html[data-theme='oscuro']`)
- `--bg`: `#0b0e16` (lienzo obsidian entintado) con sutil halo radial superior en `body` (`rgba(139, 158, 255, 0.08)`).
- `--surface`: `#121622` (paneles, tarjetas KPI, modales, tarjetas de productos).
- `--surface-2`: `#191e2e` (cajas anidadas, controles segmentados, inputs).
- `--surface-hover`: `#21283c` (hover interactivo).
- `--border`: `rgba(226, 232, 248, 0.09)` | `--border-strong`: `rgba(226, 232, 248, 0.19)`.
- `--surface-highlight`: `inset 0 1px 0 rgba(255, 255, 255, 0.045)`.
- `--txt`: `#f0f3fa` | `--txt-2`: `#c6cce0` | `--muted`: `#8f98b2`.
- `--primary`: `#8b9eff` | `--primary-hover`: `#a8b6ff` | `--on-primary`: `#0b0e16`.
- `--pos`: `#3dd68c` (`--pos-bg`: `rgba(61, 214, 140, 0.12)`).
- `--neg`: `#ff7373` (`--neg-bg`: `rgba(255, 115, 115, 0.12)`).
- `--gold`: `#e5b567`.

### Tema Claro (`html[data-theme='claro']`)
- `--bg`: `#f5f5f1` (papel marfil cálido).
- `--surface`: `#ffffff` | `--surface-2`: `#efefe9` | `--surface-hover`: `#e6e6de`.
- `--border`: `rgba(17, 20, 33, 0.09)` | `--border-strong`: `rgba(17, 20, 33, 0.2)`.
- `--surface-highlight`: `inset 0 1px 0 rgba(255, 255, 255, 0.7)`.
- `--shadow`: `0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.045)`.
- `--txt`: `#14161f` | `--txt-2`: `#3c4154` | `--muted`: `#63697d`.
- `--primary`: `#2b44cc` | `--primary-hover`: `#2035a8` | `--on-primary`: `#ffffff`.
- `--pos`: `#127a47` | `--neg`: `#c22727` | `--gold`: `#8c5c04`.

## Reglas de Elevación
- Contenedor nivel 0: `body` (`--bg`).
- Contenedor nivel 1: `.panel-card`, `.hero-patrimonio`, `.kpi-card`, `.prod-card` (`--surface`, borde `1px solid var(--border)`, `box-shadow: var(--surface-highlight), var(--shadow)`).
- Contenedor nivel 2: `.objetivo-box`, `.seg-group`, `.datos-kpi`, `.ventana-celda` (`--surface-2` o `--surface` dentro de `--surface`).
- Contenedor flotante nivel 3: `.toast-stack`, `.user-menu-panel`, `.banco-sel-dropdown`, `.modal-card` (`--border-strong` + sombra pronunciada).
