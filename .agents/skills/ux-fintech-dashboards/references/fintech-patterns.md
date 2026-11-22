# Patrones Fintech y Flujos Operativos en Capitalia

## Anatomía del Hero Patrimonial
- Izquierda: saludo contextual → kicker + píldora `En vivo` → cifra gigante `--font-display` con `.valor-privado` → badges de plusvalía y TIR → línea de contexto (`aportado` + rango de fechas).
- Derecha: indicador de última sincronización (`.actualizacion-meta`) + widget de objetivo patrimonial (`.objetivo-box`) con barra de progreso lineal y estimación temporal.

## Anatomía de Tarjeta de Producto (`.prod-card`)
- Borde izquierdo de 4px en el color asignado al activo (`--prod-color`).
- Cabecera: identificador visual + nombre + etiquetas concisas (vehículo, entidad con mini-logo si existe, TER, SRRI, Largo plazo) + valor actual y peso a la derecha.
- Cuerpo: sparkline SVG ligero de 48px de alto alineado al rango temporal activo.
- Pie (grid 4 columnas): `Invertido` | `Ganancia` | `Rentab.` | `TIR` + indicador sutil de detalle (`Ver ficha →`).

## Flujo de Entrada de Datos (`Mis datos`)
- KPI strip superior contextual por sub-pestaña.
- Toolbar con buscador y filtros alineados antes de las listas/tablas.
- Encadenamiento tras alta: ofrecer «Crear y anotar compra» / «Crear y anotar saldo» para minimizar clics desde la creación del producto hasta el primer asiento.
- Confirmaciones y formularios siempre en modales Angular nativos (`.modal-card`), nunca diálogos del navegador.
