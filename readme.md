# 🌻 HuertApp - Huerta de Tetuán

Aplicación web para gestionar la huerta urbana de Tetuán con tu comunidad.

## 🚀 Características

- **Sistema de aprobación de usuarios**: Los nuevos usuarios solicitan acceso y los administradores aprueban
- **Tareas colaborativas**: Crear, asignar, completar y comentar tareas
- **Semáforo de la huerta**: Estado abierta/alguien va/cerrada con notificaciones en tiempo real
- **Noticias y eventos**: Compartir información con la comunidad
- **Gestión de huertis**: Administradores pueden gestionar usuarios y roles
- **Tiempo real**: Todos los cambios se ven al instante gracias a Supabase

## 📦 Instalación

### 1. Configurar Supabase

1. Crea una cuenta en [Supabase](https://supabase.com)
2. Crea un nuevo proyecto llamado `huertapp`
3. En **SQL Editor**, ejecuta el script SQL completo (incluido en los archivos)

### 2. Configurar credenciales

En `app.js`, reemplaza:

```javascript
const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU_CLAVE_ANONIMA';
