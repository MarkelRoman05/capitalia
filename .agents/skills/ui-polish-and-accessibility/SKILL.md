---
name: ui-polish-and-accessibility
description: >-
  Audits Angular templates and CSS for binding pitfalls, WCAG AA accessibility, mobile ergonomics,
  and frontend security before finishing UI changes. Use whenever modifying Angular components,
  templates, styles, or interactive controls.
---

# Auditoría UI, Accesibilidad (WCAG AA) y Angular v22+

Checklist obligatoria antes de dar por terminado cualquier cambio visual o estructural en el frontend de Capitalia.

## 1. Regla Crítica de Angular `[class]`
- **NUNCA** combines `class="clase-base ..."` estático con `[class]="expresion"` en el mismo elemento HTML: en Angular `[class]="..."` sobrescribe completamente el atributo `class` estático y borra `clase-base`.
- **Correcto**: usa bindings booleanos específicos como `[class.pos]="..."` y `[class.neg]="..."` junto a las clases estáticas, o devuelve la cadena completa de clases dentro de `[class]`.

## 2. Accesibilidad WCAG AA y AXE
- **Contraste**: texto normal ≥ 4.5:1; texto grande (≥ 18pt o ≥ 14pt bold) y elementos UI ≥ 3:1 en tema oscuro y claro.
- **Foco visible**: mantener `:focus-visible` nítido en enlaces, botones, filtros píldora, acordeones e inputs; respetar `@media (prefers-reduced-motion: reduce)`.
- **Semántica y ARIA**:
  - Botones de estado binario (ej. Modo discreto) con `[attr.aria-pressed]`.
  - Pestañas activas con `[attr.aria-current]="'page'"` o estado equivalente; acordeones con `[attr.aria-expanded]`.
  - Avisos de éxito con `role="status"` y errores con `role="alert"`.
  - Botones solo-icono con `aria-label` descriptivo; SVG decorativos con `aria-hidden="true"`.

## 3. Ergonomía Responsive y Móvil
- Evitar cualquier overflow horizontal (`overflow-x: clip`, `min-width: 0` en hijos grid/flex).
- Targets táctiles ≥ 38–44px en móvil, inputs con `font-size: 16px` en `< 720px` para evitar zoom automático en iOS, y barra de navegación inferior respetando `env(safe-area-inset-bottom)`.

## 4. Seguridad Frontend (`mandatory-secure-web-skills`)
- Cero `innerHTML`, `outerHTML`, `bypassSecurityTrustHtml`, `alert()`, `confirm()` o `prompt()`.
- `localStorage` solo para preferencias visuales no sensibles (tema, modo discreto); nunca tokens, sesiones ni PII.

## 5. Verificación Automática Pre-Entrega
1. `npm run build` (0 errores).
2. `npm test -- --watch=false` (todos los specs en verde).
3. `grep -rn 'class="[^"]*"[^>]*\[class\]=' src/app/` (debe devolver 0 coincidencias).
4. `grep -rnE "innerHTML|outerHTML|bypassSecurityTrust|alert\(|confirm\(|prompt\(" src/app/` (limpio).
