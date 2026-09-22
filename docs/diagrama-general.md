# Norde Propiedades: alcance general del proyecto

> Transcripción del diagrama `docs/Diagrama general.jpeg`.
> **Fuera de alcance por ahora:** la rama "Web Render 3D" (ver al final).

El proyecto se divide en tres grandes áreas, más un listado de costos operativos:

1. Agentes de IA
2. Web + Diseño + SEO
3. Sistema de Gestión
4. Otros costos

**Arquitectura y lineamientos técnicos:** [arquitectura.md](arquitectura.md). Las reglas obligatorias están en los `CLAUDE.md`.

**Documentos de detalle por módulo:**

- [01: Agentes de IA](modulos/01-agentes-ia.md): basado en el MVP de APZ-WP-BOT.
- [02: Web + Diseño + SEO](modulos/02-web-diseno-seo.md): Next.js + Payload CMS, como en DS-DESIGN-Landing.
- [03: Sistema de Gestión](modulos/03-sistema-gestion.md): panel interno.

---

## 1. Agentes de IA

**Canales de entrada:**

- WhatsApp
- Web Chat

**Flujo del agente (se ejecuta en orden):**

1. Captar datos de clientes
2. Ofrecer propiedades disponibles
3. Derivar al equipo interno
4. Catalogar al cliente, que puede terminar en:
   - **Venta / Alquiler / Tasación**: lo gestiona Norde.
   - **Aplica a otra inmobiliaria**: Norde no tiene hoy nada para ofrecerle. Queda en ese estado para que el equipo revise opciones con inmobiliarias socias.

---

## 2. Web + Diseño + SEO

- **Rediseño** del sitio web.
- **Blog + SEO + GEO** (posicionamiento en buscadores tradicionales y en buscadores de IA).
- **Sugerencias al ingresar**: un modal que se abre al entrar a la web con un emprendimiento o unidad que Norde quiere publicitar. Incluye:
  - Destacados (propiedades destacadas).
- **Oportunidades por mail** (en el diagrama tiene borde rojo, igual que "Otros costos"; probablemente dependa del servicio de mailing).

---

## 3. Sistema de Gestión

### 3.1 Clientes

- Alta, baja y modificación (ABM) de clientes.
  - Cada cliente queda asignado a un agente.
- Oportunidades cross platform: se guarda cada cliente con sus canales de contacto (WhatsApp, web chat, MercadoLibre, Zonaprop, Argenprop).
- Exportar a Excel.

### 3.2 Propiedades: Venta, Alquiler y Emprendimientos

Las tres comparten el mismo módulo base:

- Alta, baja y modificación (ABM).
- Exportar a Excel.
- Mapa de propiedades.
- **Integraciones con portales:**
  - MercadoLibre
  - Zonaprop
  - Argenprop

### 3.3 Alquiler (gestión del contrato)

Además del ABM común, un alquiler tiene su propia gestión:

- Datos del propietario
- Datos de la propiedad
- Datos del inquilino
- Contrato de alquiler
- Actualizaciones por IPC, con notificación

### 3.4 Tasaciones

- Alta, baja y modificación.
- Convertir una tasación en venta.

### 3.5 Reportes

- Ventas y orígenes.
- Clientes y orígenes.

### 3.6 Usuarios

- Gestión de usuarios y roles.
- Trazabilidad de cambios (auditoría).

### 3.7 Agente de soporte interno

- Responder dudas generales sobre el uso del sistema.
- Derivar a soporte real (humano) cuando haga falta.

---

## 4. Otros costos

- Uso de OpenAI como agente de IA
- Costo de mensajes de WhatsApp Business
- Servidor + soporte
- Servicio en la nube para imágenes
- Dominio propio
- Servicio de mailing

---

## Fuera de alcance (por ahora): Web Render 3D

- Vista de Street View de Google Maps
- Videos y renders 3D
- Vista de la unidad con cámaras 360
- Vista de planos
