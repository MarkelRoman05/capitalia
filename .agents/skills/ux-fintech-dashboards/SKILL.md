---
name: ux-fintech-dashboards
description: >-
  Applies fintech and personal wealth management UX patterns to Capitalia views, charts, KPIs,
  product cards, and tables. Use when designing or improving portfolio dashboards, financial tables,
  privacy mode, entity branding, or data-entry workflows.
---

# UX Fintech Dashboards — Capitalia

Patrones de experiencia de usuario específicos para aplicaciones de gestión patrimonial, análisis cuantitativo y seguimiento de inversiones.

## Reglas Clave de UX Financiera

1. **Divulgación progresiva de arriba abajo**:
   - Nivel 1 (Hero): cifra total de patrimonio, variación absoluta/porcentual, TIR, estado de actualización en vivo y meta patrimonial.
   - Nivel 2 (Filtros + KPIs): barra de filtros rápida (píldoras con dot de color y valor compacto) y cuadrícula de 6 KPIs clave.
   - Nivel 3 (Gráfico principal): evolución interactiva con conmutación de vista y rango temporal en el propio header del panel.
   - Nivel 4 (Posiciones): tarjetas de producto con identidad clara, sparkline de tendencia y 4 métricas comparables.
   - Nivel 5 (Detalle profundo): tablas históricas filtrables con totales al pie (`tfoot`).
2. **Precisión y legibilidad numérica**:
   - Todas las columnas numéricas alineadas a la derecha (`.num`) con cifras tabulares (`.mono`).
   - Variaciones siempre con signo explícito (`+` / `−`) y chip o color semántico (`pos` / `neg`), nunca dependiendo solo del color.
3. **Modo Discreto (`.valor-privado`)**:
   - Todo importe monetario absoluto en euros (saldo, ganancia en €, aportado, precio unitario, objetivo) debe llevar la clase `.valor-privado`.
   - Los porcentajes relativos (`%`, `TIR`, pesos) permanecen visibles para mantener utilidad analítica sin exponer patrimonio neto al compartir pantalla.
   - Control accesible en un clic desde la topbar y el menú de cuenta móvil (`data-privado="1"` en `<html>`).
4. **Identidad de Entidades y Affordances**:
   - Mostrar el logotipo oficial de la entidad/bróker junto al nombre cuando esté disponible en el catálogo, con fallback limpio y sin iconos rotos.
   - Toda tarjeta clicable (`.prod-card`) debe comunicar interactividad mediante hover elevado y un indicador direccional sutil.
   - Notificaciones no intrusivas mediante `.toast-stack` fijo para no provocar saltos visuales (*layout shift*) en las métricas superiores.

Para patrones detallados de componentes y flujo operativo, consulta [fintech-patterns.md](./references/fintech-patterns.md).
