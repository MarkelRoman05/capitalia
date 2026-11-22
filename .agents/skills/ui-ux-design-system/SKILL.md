---
name: ui-ux-design-system
description: >-
  Guides the visual design system of Capitalia with Private Banking & Quant Editorial aesthetics.
  Use when designing or styling components, updating CSS tokens, adjusting light/dark themes,
  typography, elevation, borders, spacing, or semantic color palettes.
---

# UI/UX Design System — Capitalia (Private Banking & Quant Editorial)

Sistema de diseño editorial cuantitativo inspirado en terminales de banca privada y plataformas de análisis patrimonial. Prioriza la legibilidad de cifras financieras, la jerarquía tonal limpia y la paridad estricta entre tema oscuro y tema claro.

## Principios Fundamentales

1. **Jerarquía tonal 60-30-10**:
   - **60% lienzo base (`--bg`)**: profundo y tranquilo para descansar la vista en sesiones largas (`#0b0e16` en oscuro, `#f5f5f1` en claro).
   - **30% superficies (`--surface`, `--surface-2`, `--surface-hover`)**: elevación mediante cambio sutil de luminancia, borde hairline (`--border`) y brillo superior (`--surface-highlight`) en oscuro, o sombras multicapa suaves (`--shadow`) en claro.
   - **10% acentos y semántica**: `--primary` reservado para navegación activa y acción principal; `--pos`, `--neg` y `--gold` exclusivos para estado financiero, signos e hitos.
2. **Tipografía dual y cifras tabulares**:
   - **Display (`--font-display`)**: `Bricolage Grotesque` para títulos de sección, cifras hero de patrimonio y KPIs clave (`letter-spacing: -0.02em` a `-0.035em`).
   - **Cuerpo y tablas (`--font-body`)**: `Figtree` con `font-variant-numeric: tabular-nums` en toda cifra, porcentaje, fecha o celda tabular (`.num`, `.mono`).
3. **Ritmo espacial (escala 4px / 8px)**:
   - Separación entre bloques principales: `1.5rem` – `1.75rem`.
   - Padding interno de paneles (`.panel-card`): `1.35rem 1.5rem` en escritorio (`1rem` en móvil).
   - Radios consistentes: `--r-sm: 7px`, `--r-md: 12px`, `--r-lg: 18px`.
4. **Contraste y paridad Dark/Light**:
   - Todo token de color debe cumplir WCAG AA (≥ 4.5:1 en texto normal, ≥ 3:1 en texto grande y bordes interactivos) tanto en `html[data-theme='oscuro']` como en `html[data-theme='claro']`.
   - Consulta las definiciones exactas de tokens y reglas de superficie en [tokens-and-surfaces.md](./references/tokens-and-surfaces.md).

## Checklist al Estilar un Componente

- Usar exclusivamente variables CSS (`var(--surface)`, `var(--border)`, `var(--txt-2)`, etc.); nunca colores hexadecimales hardcoded para fondos o textos de interfaz.
- Mantener la coherencia con la jerarquía de botones global (`.btn-primario`, `.btn-secundario`, `.btn-fantasma`, `.btn-peligro`, `.btn-peligro-outline`, `.btn-tabla`).
- Aplicar `--surface-highlight` en tarjetas elevadas del tema oscuro para separarlas visualmente del fondo sin recurrir a sombras pesadas ni efectos neón.
- Verificar en escritorio y bajo `@media (max-width: 720px)` que no hay desbordes ni saltos de layout.
