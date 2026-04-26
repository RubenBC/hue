/* =============================================
   HuertApp — Huerta de Tetuán
   Con Supabase, aprobación de usuarios y gestión completa
   ============================================= */

'use strict';

// ============================================
// CONFIGURACIÓN DE SUPABASE
// ============================================
// ⚠️ IMPORTANTE: Reemplaza estos valores con los de tu proyecto Supabase
const SUPABASE_URL = 'sb_publishable_BXTPFRL3QSvZAGQgR6s3gA_AZSsmrpW';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhpcmh0bmhtYm16cWFxcnN2anNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDg1NDksImV4cCI6MjA5MjY4NDU0OX0.ul3riHSKF_0P0evCf9lSebnqZcKFQvaH8EL6Yq5NoDw';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// ESTADO GLOBAL
// ============================================
let currentUser = null;      // Usuario actual (huerti)
let currentHuerta = null;    // Datos de la huerta (única: Huerta de Tetuán)
let currentTab = 'tareas';   // Tab activa: tareas, noticias, eventos, huertis, menu

// Filtros de tareas
let filterTiempo = 'hoy';
let filterCat = 'todas';

// Tarea que se está editando (para el modal)
let editingTareaId = null;

// Noticia/evento que se está editando
let editingNoticiaId = null;
let editingEventoId = null;
let currentNoticiaTipo = 'noticia';

// Suscripciones en tiempo real
let tareasSubscription = null;
let huertaSubscription = null;

// ============================================
// INICIALIZACIÓN
// ============================================
async function init() {
    // Cargar datos de la huerta (ID fijo de Huerta de Tetuán)
    const HUERTA_ID = '33333333-3333-3333-3333-333333333333';
    
    // Verificar si el usuario tiene sesión guardada
    const savedUserId = sessionStorage.getItem('huertapp_user_id');
    
    if (savedUserId) {
        // Intentar restaurar sesión
        const { data: user, error } = await supabase
            .from('huertis')
            .select('*, huertas(*)')
            .eq('id', savedUserId)
            .eq('activo', true)
            .single();
        
        if (user && !error) {
            currentUser = user;
            currentHuerta = user.huertas;
            await cargarHuerta();
            await suscribirseCambios();
            entrarApp();
            return;
        } else {
            sessionStorage.removeItem('huertapp_user_id');
        }
    }
    
    // Si no hay sesión, mostrar pantalla de bienvenida
    show('s-welcome');
}

// Cargar datos de la huerta (ID fijo)
async function cargarHuerta() {
    const HUERTA_ID = '33333333-3333-3333-3333-333333333333';
    
    const { data, error } = await supabase
        .from('huertas')
        .select('*')
        .eq('id', HUERTA_ID)
        .single();
    
    if (data && !error) {
        currentHuerta = data;
        actualizarSemForoUI();
    } else if (error && error.code === 'PGRST116') {
        // La huerta no existe, crearla
        await crearHuertaInicial();
    }
}

// Crear huerta inicial si no existe
async function crearHuertaInicial() {
    const HUERTA_ID = '33333333-3333-3333-3333-333333333333';
    
    const { data, error } = await supabase
        .from('huertas')
        .insert([{
            id: HUERTA_ID,
            nombre: 'Huerta de Tetuán',
            emoji: '🌻',
            semaforo: 'rojo'
        }])
        .select()
        .single();
    
    if (data) {
        currentHuerta = data;
        
        // Crear categorías iniciales
        const categorias = [
            { id: 'c1-tetuán', nombre: 'Riego', emoji: '💧', orden: 0 },
            { id: 'c2-tetuán', nombre: 'Poda', emoji: '✂️', orden: 1 },
            { id: 'c3-tetuán', nombre: 'Siembra', emoji: '🌱', orden: 2 },
            { id: 'c4-tetuán', nombre: 'Limpieza', emoji: '🧹', orden: 3 },
            { id: 'c5-tetuán', nombre: 'Cosecha', emoji: '🥬', orden: 4 }
        ];
        
        for (const cat of categorias) {
            await supabase.from('categorias').insert([{
                id: cat.id,
                huerta_id: HUERTA_ID,
                nombre: cat.nombre,
                emoji: cat.emoji,
                orden: cat.orden
            }]);
        }
        
        // Crear admin inicial
        const { data: admin } = await supabase
            .from('huertis')
            .insert([{
                id: 'admin-tetuán',
                huerta_id: HUERTA_ID,
                nombre: 'Administrador',
                emoji: '👩‍🌾',
                rol: 'admin',
                activo: true
            }])
            .select()
            .single();
        
        if (admin) {
            sessionStorage.setItem('huertapp_user_id', admin.id);
            currentUser = admin;
            entrarApp();
        }
    }
}

// ============================================
// AUTENTICACIÓN Y SOLICITUDES
// ============================================

function showLoginForm() {
    document.getElementById('login-nombre').value = '';
    show('s-login');
}

function showSolicitarAcceso() {
    document.getElementById('solicitud-nombre').value = '';
    document.getElementById('solicitud-emoji').value = '🌱';
    document.getElementById('solicitud-mensaje').style.display = 'none';
    show('s-solicitar');
}

async function doLogin() {
    const nombre = document.getElementById('login-nombre').value.trim();
    
    if (!nombre) {
        alert('Escribe tu nombre');
        return;
    }
    
    // Buscar usuario aprobado
    const { data: user, error } = await supabase
        .from('huertis')
        .select('*, huertas(*)')
        .eq('nombre', nombre)
        .eq('activo', true)
        .single();
    
    if (user && !error) {
        currentUser = user;
        currentHuerta = user.huertas;
        sessionStorage.setItem('huertapp_user_id', user.id);
        await suscribirseCambios();
        entrarApp();
    } else {
        alert('Usuario no encontrado o no aprobado. Solicita acceso primero.');
    }
}

async function enviarSolicitud() {
    const nombre = document.getElementById('solicitud-nombre').value.trim();
    const emoji = document.getElementById('solicitud-emoji').value;
    const mensajeDiv = document.getElementById('solicitud-mensaje');
    
    if (!nombre) {
        alert('Escribe tu nombre');
        return;
    }
    
    // Verificar si ya existe solicitud pendiente
    const { data: existing } = await supabase
        .from('solicitudes')
        .select('*')
        .eq('nombre', nombre)
        .eq('estado', 'pendiente')
        .single();
    
    if (existing) {
        mensajeDiv.textContent = '⚠️ Ya tienes una solicitud pendiente. Espera a que un admin la revise.';
        mensajeDiv.style.display = 'block';
        return;
    }
    
    // Crear solicitud
    const { error } = await supabase
        .from('solicitudes')
        .insert([{
            nombre: nombre,
            emoji: emoji,
            estado: 'pendiente'
        }]);
    
    if (!error) {
        mensajeDiv.textContent = '✅ Solicitud enviada. Un administrador revisará tu petición.';
        mensajeDiv.style.display = 'block';
        setTimeout(() => {
            show('s-welcome');
        }, 2000);
    } else {
        mensajeDiv.textContent = '❌ Error al enviar la solicitud. Intenta de nuevo.';
        mensajeDiv.style.display = 'block';
    }
}

// ============================================
// ENTRAR A LA APP PRINCIPAL
// ============================================

function entrarApp() {
    // Actualizar UI con datos del usuario
    document.getElementById('huerta-nombre-top').textContent = currentHuerta.nombre;
    document.getElementById('huerta-emoji-top').textContent = currentHuerta.emoji;
    actualizarSemForoUI();
    
    document.getElementById('menu-nombre').textContent = currentUser.nombre;
    document.getElementById('menu-avatar').textContent = currentUser.emoji;
    const rolBadge = document.getElementById('menu-rol');
    rolBadge.textContent = currentUser.rol;
    rolBadge.className = currentUser.rol === 'admin' ? 'badge badge-admin' : 'badge';
    
    // Mostrar/ocultar sección admin
    const adminSection = document.getElementById('admin-section');
    if (currentUser.rol === 'admin') {
        adminSection.classList.remove('hidden');
        cargarContadorSolicitudes();
        suscribirseSolicitudes();
    } else {
        adminSection.classList.add('hidden');
    }
    
    // Cargar el tab por defecto
    cambiarTab('tareas');
    show('s-main');
}

// ============================================
// SUSCRIPCIONES EN TIEMPO REAL
// ============================================

async function suscribirseCambios() {
    // Suscripción a cambios en tareas
    if (tareasSubscription) {
        await supabase.removeChannel(tareasSubscription);
    }
    
    tareasSubscription = supabase
        .channel('tareas-channel')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'tareas', filter: `huerta_id=eq.${currentHuerta.id}` },
            () => {
                if (currentTab === 'tareas') renderTareas();
            }
        )
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'asignaciones' },
            () => {
                if (currentTab === 'tareas') renderTareas();
            }
        )
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'noticias', filter: `huerta_id=eq.${currentHuerta.id}` },
            () => {
                if (currentTab === 'noticias') renderNoticias();
                if (currentTab === 'eventos') renderEventos();
            }
        )
        .subscribe();
    
    // Suscripción a cambios en el semáforo
    if (huertaSubscription) {
        await supabase.removeChannel(huertaSubscription);
    }
    
    huertaSubscription = supabase
        .channel('huerta-channel')
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'huertas', filter: `id=eq.${currentHuerta.id}` },
            (payload) => {
                if (payload.new.semaforo !== currentHuerta.semaforo) {
                    currentHuerta.semaforo = payload.new.semaforo;
                    actualizarSemForoUI();
                    
                    // Mostrar notificación
                    let mensaje = '';
                    if (payload.new.semaforo === 'verde') mensaje = '🌿 ¡Huerta abierta!';
                    if (payload.new.semaforo === 'naranja') mensaje = '🟠 Alguien va hoy a la huerta';
                    if (payload.new.semaforo === 'rojo') mensaje = '🔒 ¡Huerta cerrada!';
                    mostrarNotificacion(mensaje, 'info');
                }
            }
        )
        .subscribe();
}

function suscribirseSolicitudes() {
    const solicitudesChannel = supabase
        .channel('solicitudes-channel')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'solicitudes', filter: `estado=eq.pendiente` },
            () => cargarContadorSolicitudes()
        )
        .subscribe();
}

async function cargarContadorSolicitudes() {
    const { count, error } = await supabase
        .from('solicitudes')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'pendiente');
    
    if (!error) {
        const badge = document.getElementById('solicitudes-count');
        if (badge) {
            badge.textContent = count || 0;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
    }
}

// ============================================
// SEMÁFORO
// ============================================

function toggleSemaforoPanel() {
    const panel = document.getElementById('sem-panel');
    panel.classList.toggle('hidden');
}

async function cambiarSemaforo(estado) {
    const { error } = await supabase
        .from('huertas')
        .update({ semaforo: estado })
        .eq('id', currentHuerta.id);
    
    if (!error) {
        document.getElementById('sem-panel').classList.add('hidden');
        
        // Si es naranja, guardar quién lo cambió
        if (estado === 'naranja') {
            // La notificación se mostrará vía la suscripción
        }
    }
}

function actualizarSemForoUI() {
    const dot = document.getElementById('sem-indicator');
    const label = document.getElementById('sem-label');
    
    dot.className = `sem-dot sem-${currentHuerta.semaforo}`;
    
    const labels = { verde: 'abierta', naranja: 'alguien va', rojo: 'cerrada' };
    label.textContent = labels[currentHuerta.semaforo] || 'cerrada';
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const area = document.getElementById('notif-area');
    const clase = tipo === 'info' ? 'notif-green' : 'notif-orange';
    area.innerHTML = `<div class="notif ${clase}">${mensaje}</div>`;
    setTimeout(() => { area.innerHTML = ''; }, 4000);
}

// ============================================
// NAVEGACIÓN POR TABS
// ============================================

function cambiarTab(tab, btnElement = null) {
    currentTab = tab;
    
    // Actualizar clases de los botones
    document.querySelectorAll('.navbtn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (btnElement) {
        btnElement.classList.add('active');
    } else {
        const btns = document.querySelectorAll('.navbtn');
        const tabNames = ['tareas', 'noticias', 'eventos', 'huertis', 'menu'];
        const idx = tabNames.indexOf(tab);
        if (idx >= 0 && btns[idx]) btns[idx].classList.add('active');
    }
    
    // Ocultar todos los contenidos y mostrar el seleccionado
    document.querySelectorAll('.tab-contenido').forEach(el => {
        el.classList.add('hidden');
    });
    
    const contenidoId = `contenido-${tab}`;
    const contenido = document.getElementById(contenidoId);
    if (contenido) contenido.classList.remove('hidden');
    
    // Cargar datos según el tab
    if (tab === 'tareas') {
        renderTareas();
        cargarCategoriasParaFiltros();
    } else if (tab === 'noticias') {
        renderNoticias();
    } else if (tab === 'eventos') {
        renderEventos();
    } else if (tab === 'huertis') {
        renderHuertis();
    } else if (tab === 'menu') {
        // Ya está cargado
    }
}

// ============================================
// TAREAS - FILTROS
// ============================================

function setFilterTiempo(btn, valor) {
    filterTiempo = valor;
    document.querySelectorAll('#filter-tiempo .chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTareas();
}

function setFilterCat(btn, valor) {
    filterCat = valor;
    document.querySelectorAll('#filter-cat .chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTareas();
}

async function cargarCategoriasParaFiltros() {
    const { data: categorias } = await supabase
        .from('categorias')
        .select('*')
        .eq('huerta_id', currentHuerta.id)
        .order('orden', { ascending: true });
    
    const container = document.getElementById('filter-cat');
    let html = '<button class="chip active" onclick="setFilterCat(this, \'todas\')">Todas</button>';
    
    if (categorias) {
        categorias.forEach(cat => {
            html += `<button class="chip" onclick="setFilterCat(this, '${cat.id}')">${cat.emoji} ${cat.nombre}</button>`;
        });
    }
    
    container.innerHTML = html;
}

// ============================================
// TAREAS - RENDERIZADO
// ============================================

async function renderTareas() {
    // Obtener tareas
    let query = supabase
        .from('tareas')
        .select('*')
        .eq('huerta_id', currentHuerta.id);
    
    if (filterTiempo === 'hoy') {
        const hoyStr = new Date().toISOString().slice(0, 10);
        query = query.eq('fecha', hoyStr);
    }
    
    const { data: tareas } = await query.order('orden', { ascending: true });
    
    // Obtener categorías
    const { data: categorias } = await supabase
        .from('categorias')
        .select('*')
        .eq('huerta_id', currentHuerta.id);
    
    const catMap = {};
    if (categorias) {
        categorias.forEach(c => { catMap[c.id] = c; });
    }
    
    // Obtener asignaciones
    const { data: asignaciones } = await supabase
        .from('asignaciones')
        .select('*, huertis(*)');
    
    // Obtener huertis para nombres
    const { data: huertis } = await supabase
        .from('huertis')
        .select('*')
        .eq('huerta_id', currentHuerta.id)
        .eq('activo', true);
    
    const huertiMap = {};
    if (huertis) {
        huertis.forEach(h => { huertiMap[h.id] = h; });
    }
    
    // Agrupar asignaciones por tarea
    const asignacionesPorTarea = {};
    if (asignaciones) {
        asignaciones.forEach(a => {
            if (!asignacionesPorTarea[a.tarea_id]) asignacionesPorTarea[a.tarea_id] = [];
            if (huertiMap[a.huerti_id]) {
                asignacionesPorTarea[a.tarea_id].push(huertiMap[a.huerti_id]);
            }
        });
    }
    
    // Filtrar por categoría
    let filtered = tareas || [];
    if (filterCat !== 'todas') {
        filtered = filtered.filter(t => t.categoria_id === filterCat);
    }
    
    const pendientes = filtered.filter(t => !t.done);
    const completadas = filtered.filter(t => t.done);
    
    let html = '';
    
    if (pendientes.length === 0 && completadas.length === 0) {
        html = '<div class="task-empty"><span class="task-empty-icon">🌱</span>Sin tareas para mostrar.<br/>Pulsa + para crear una.</div>';
        document.getElementById('task-list').innerHTML = html;
        return;
    }
    
    pendientes.forEach(t => {
        html += generarHTMLTarea(t, asignacionesPorTarea[t.id] || [], catMap);
    });
    
    if (completadas.length > 0) {
        html += '<div class="tasks-section-label">Completadas</div>';
        completadas.forEach(t => {
            html += generarHTMLTarea(t, asignacionesPorTarea[t.id] || [], catMap);
        });
    }
    
    document.getElementById('task-list').innerHTML = html;
}

function generarHTMLTarea(tarea, asignados, catMap) {
    const categoria = catMap[tarea.categoria_id] || { emoji: '📌', nombre: 'Sin categoría' };
    const asignadosTexto = asignados.length > 0 
        ? asignados.map(a => `${a.emoji} ${a.nombre}`).join(', ')
        : 'SIN ASIGNAR';
    const asignadosClass = asignados.length > 0 ? 'pill-assigned' : 'pill-unassigned';
    const estaAsignado = asignados.some(a => a.id === currentUser.id);
    const tieneNotas = tarea.notas && tarea.notas.trim().length > 0;
    const checkClass = tarea.done ? 'task-check checked' : 'task-check';
    const nameClass = tarea.done ? 'task-name done-text' : 'task-name';
    
    return `
        <div class="task-row ${tarea.done ? 'done' : ''}" data-id="${tarea.id}">
            <div class="${checkClass}" onclick="toggleTareaDone('${tarea.id}', ${!tarea.done})">
                ${tarea.done ? '✓' : ''}
            </div>
            <div class="task-info">
                <div class="${nameClass}">
                    ${categoria.emoji} ${escapeHtml(tarea.nombre)}
                </div>
                <div class="task-meta">
                    <span class="pill ${asignadosClass}">${asignadosTexto}</span>
                    ${tarea.repetir ? `<span style="font-size:11px;color:var(--text-tertiary)">🔄 ${tarea.repetir}</span>` : ''}
                </div>
            </div>
            <div class="task-actions">
                <button class="btn-icon" title="${estaAsignado ? 'Quitarme' : 'Apuntarme'}" onclick="toggleAsignacion('${tarea.id}')">
                    ${estaAsignado ? '🙋' : '🤝'}
                </button>
                ${tieneNotas ? `<button class="btn-icon" title="Ver notas" onclick="verNotas('${escapeHtml(tarea.notas)}')">🛟</button>` : ''}
                <button class="btn-icon" title="Editar" onclick="editarTarea('${tarea.id}')">✏️</button>
                ${currentUser.rol === 'admin' ? `<button class="btn-icon" title="Eliminar" onclick="eliminarTarea('${tarea.id}')">🗑️</button>` : ''}
            </div>
        </div>
    `;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
        return c;
    });
}

// ============================================
// TAREAS - ACCIONES
// ============================================

async function toggleTareaDone(tareaId, nuevoEstado) {
    // Si se marca como hecha y no está asignada, auto-asignar
    if (nuevoEstado === true) {
        const { data: asignaciones } = await supabase
            .from('asignaciones')
            .select('*')
            .eq('tarea_id', tareaId)
            .eq('huerti_id', currentUser.id);
        
        if (!asignaciones || asignaciones.length === 0) {
            await supabase
                .from('asignaciones')
                .insert([{ tarea_id: tareaId, huerti_id: currentUser.id }]);
        }
    }
    
    const { error } = await supabase
        .from('tareas')
        .update({ done: nuevoEstado })
        .eq('id', tareaId);
    
    if (!error) {
        renderTareas();
    }
}

async function toggleAsignacion(tareaId) {
    // Verificar si ya está asignado
    const { data: existing } = await supabase
        .from('asignaciones')
        .select('*')
        .eq('tarea_id', tareaId)
        .eq('huerti_id', currentUser.id)
        .single();
    
    if (existing) {
        // Quitar asignación
        await supabase
            .from('asignaciones')
            .delete()
            .eq('tarea_id', tareaId)
            .eq('huerti_id', currentUser.id);
    } else {
        // Añadir asignación
        await supabase
            .from('asignaciones')
            .insert([{ tarea_id: tareaId, huerti_id: currentUser.id }]);
    }
    
    renderTareas();
}

async function eliminarTarea(tareaId) {
    if (!confirm('¿Eliminar esta tarea?')) return;
    
    await supabase
        .from('tareas')
        .delete()
        .eq('id', tareaId);
    
    renderTareas();
}

function verNotas(notas) {
    document.getElementById('notas-contenido').innerHTML = notas.replace(/\n/g, '<br>');
    mostrarModal('modal-notas');
}

// ============================================
// TAREAS - MODAL CREAR/EDITAR
// ============================================

async function mostrarModalTarea(tarea = null) {
    editingTareaId = tarea ? tarea.id : null;
    document.getElementById('modal-tarea-titulo').textContent = tarea ? 'Editar tarea' : 'Nueva tarea';
    
    // Cargar categorías
    const { data: categorias } = await supabase
        .from('categorias')
        .select('*')
        .eq('huerta_id', currentHuerta.id)
        .order('orden', { ascending: true });
    
    const catSelect = document.getElementById('tarea-categoria');
    catSelect.innerHTML = categorias.map(c => `<option value="${c.id}">${c.emoji} ${c.nombre}</option>`).join('');
    
    // Cargar huertis para asignación múltiple
    const { data: huertis } = await supabase
        .from('huertis')
        .select('*')
        .eq('huerta_id', currentHuerta.id)
        .eq('activo', true);
    
    const asigSelect = document.getElementById('tarea-asignados');
    asigSelect.innerHTML = huertis.map(h => `<option value="${h.id}">${h.emoji} ${h.nombre}</option>`).join('');
    
    // Si es edición, cargar asignaciones actuales
    let asignadosActuales = [];
    if (tarea) {
        const { data: asignaciones } = await supabase
            .from('asignaciones')
            .select('huerti_id')
            .eq('tarea_id', tarea.id);
        
        asignadosActuales = asignaciones ? asignaciones.map(a => a.huerti_id) : [];
        
        // Seleccionar en el select múltiple
        Array.from(asigSelect.options).forEach(opt => {
            opt.selected = asignadosActuales.includes(opt.value);
        });
        
        document.getElementById('tarea-nombre').value = tarea.nombre;
        document.getElementById('tarea-categoria').value = tarea.categoria_id || '';
        document.getElementById('tarea-fecha').value = tarea.fecha;
        document.getElementById('tarea-repetir').value = tarea.repetir || '';
        document.getElementById('tarea-notas').value = tarea.notas || '';
    } else {
        document.getElementById('tarea-nombre').value = '';
        document.getElementById('tarea-fecha').value = new Date().toISOString().slice(0, 10);
        document.getElementById('tarea-repetir').value = '';
        document.getElementById('tarea-notas').value = '';
        Array.from(asigSelect.options).forEach(opt => opt.selected = false);
    }
    
    mostrarModal('modal-tarea');
}

async function guardarTarea() {
    const nombre = document.getElementById('tarea-nombre').value.trim();
    if (!nombre) {
        alert('Escribe el nombre de la tarea');
        return;
    }
    
    const categoriaId = document.getElementById('tarea-categoria').value;
    const fecha = document.getElementById('tarea-fecha').value;
    let repetir = document.getElementById('tarea-repetir').value;
    const notas = document.getElementById('tarea-notas').value;
    
    // Obtener asignados seleccionados
    const asigSelect = document.getElementById('tarea-asignados');
    const asignados = Array.from(asigSelect.selectedOptions).map(opt => opt.value);
    
    // Procesar repetición personalizada
    if (repetir === 'custom') {
        const num = document.getElementById('custom-num').value;
        const unit = document.getElementById('custom-unit').value;
        repetir = `cada ${num} ${unit}`;
    }
    
    if (editingTareaId) {
        // Actualizar tarea existente
        await supabase
            .from('tareas')
            .update({
                nombre: nombre,
                categoria_id: categoriaId,
                fecha: fecha,
                repetir: repetir,
                notas: notas
            })
            .eq('id', editingTareaId);
        
        // Actualizar asignaciones
        await supabase
            .from('asignaciones')
            .delete()
            .eq('tarea_id', editingTareaId);
        
        if (asignados.length > 0) {
            const nuevasAsignaciones = asignados.map(huertiId => ({
                tarea_id: editingTareaId,
                huerti_id: huertiId
            }));
            await supabase.from('asignaciones').insert(nuevasAsignaciones);
        }
    } else {
        // Crear nueva tarea
        const { data: newTarea } = await supabase
            .from('tareas')
            .insert([{
                huerta_id: currentHuerta.id,
                nombre: nombre,
                categoria_id: categoriaId,
                fecha: fecha,
                repetir: repetir,
                notas: notas,
                done: false,
                orden: 0
            }])
            .select()
            .single();
        
        if (newTarea && asignados.length > 0) {
            const nuevasAsignaciones = asignados.map(huertiId => ({
                tarea_id: newTarea.id,
                huerti_id: huertiId
            }));
            await supabase.from('asignaciones').insert(nuevasAsignaciones);
        }
    }
    
    cerrarModal('modal-tarea');
    renderTareas();
}

function editarTarea(tareaId) {
    // Obtener tarea y mostrar modal
    supabase
        .from('tareas')
        .select('*')
        .eq('id', tareaId)
        .single()
        .then(({ data }) => {
            if (data) mostrarModalTarea(data);
        });
}

// ============================================
// NOTICIAS Y EVENTOS
// ============================================

async function renderNoticias() {
    const { data: noticias } = await supabase
        .from('noticias')
        .select('*')
        .eq('huerta_id', currentHuerta.id)
        .eq('tipo', 'noticia')
        .order('created_at', { ascending: false });
    
    const container = document.getElementById('noticias-list');
    
    if (!noticias || noticias.length === 0) {
        container.innerHTML = '<div class="task-empty">📰 No hay noticias todavía.</div>';
    } else {
        container.innerHTML = noticias.map(n => `
            <div class="news-card">
                <div class="news-title">${escapeHtml(n.titulo)}</div>
                <div class="news-date">${new Date(n.created_at).toLocaleDateString('es')}</div>
                <div class="news-content">${escapeHtml(n.contenido).replace(/\n/g, '<br>')}</div>
            </div>
        `).join('');
    }
    
    const adminButtons = document.getElementById('admin-noticias-buttons');
    if (adminButtons) {
        adminButtons.classList.toggle('hidden', currentUser.rol !== 'admin');
    }
}

async function renderEventos() {
    const { data: eventos } = await supabase
        .from('noticias')
        .select('*')
        .eq('huerta_id', currentHuerta.id)
        .eq('tipo', 'evento')
        .order('fecha_evento', { ascending: true });
    
    const container = document.getElementById('eventos-list');
    
    if (!eventos || eventos.length === 0) {
        container.innerHTML = '<div class="task-empty">📅 No hay eventos programados.</div>';
    } else {
        container.innerHTML = eventos.map(e => `
            <div class="event-card">
                <div class="event-title">${escapeHtml(e.titulo)}</div>
                <div class="event-date-badge">📅 ${e.fecha_evento}</div>
                <div class="event-content">${escapeHtml(e.contenido).replace(/\n/g, '<br>')}</div>
            </div>
        `).join('');
    }
    
    const adminButtons = document.getElementById('admin-eventos-buttons');
    if (adminButtons) {
        adminButtons.classList.toggle('hidden', currentUser.rol !== 'admin');
    }
}

function mostrarModalNoticia() {
    currentNoticiaTipo = 'noticia';
    editingNoticiaId = null;
    document.getElementById('modal-ne-titulo').textContent = 'Nueva noticia';
    document.getElementById('ne-titulo').value = '';
    document.getElementById('ne-contenido').value = '';
    document.getElementById('evento-fecha-group').classList.add('hidden');
    mostrarModal('modal-noticia-evento');
}

function mostrarModalEvento() {
    currentNoticiaTipo = 'evento';
    editingNoticiaId = null;
    document.getElementById('modal-ne-titulo').textContent = 'Nuevo evento';
    document.getElementById('ne-titulo').value = '';
    document.getElementById('ne-contenido').value = '';
    document.getElementById('ne-fecha').value = new Date().toISOString().slice(0, 10);
    document.getElementById('evento-fecha-group').classList.remove('hidden');
    mostrarModal('modal-noticia-evento');
}

async function guardarNoticiaEvento() {
    const titulo = document.getElementById('ne-titulo').value.trim();
    const contenido = document.getElementById('ne-contenido').value.trim();
    
    if (!titulo || !contenido) {
        alert('Completa todos los campos');
        return;
    }
    
    const data = {
        huerta_id: currentHuerta.id,
        titulo: titulo,
        contenido: contenido,
        tipo: currentNoticiaTipo,
        creado_por: currentUser.id
    };
    
    if (currentNoticiaTipo === 'evento') {
        data.fecha_evento = document.getElementById('ne-fecha').value;
    }
    
    await supabase.from('noticias').insert([data]);
    
    cerrarModal('modal-noticia-evento');
    if (currentNoticiaTipo === 'noticia') renderNoticias();
    else renderEventos();
}

// ============================================
// HUERTIS
// ============================================

async function renderHuertis() {
    const { data: huertis } = await supabase
        .from('huertis')
        .select('*')
        .eq('huerta_id', currentHuerta.id)
        .eq('activo', true);
    
    const container = document.getElementById('huertis-list');
    
    if (!huertis || huertis.length === 0) {
        container.innerHTML = '<p style="font-size:14px;color:var(--text-tertiary)">Sin huertis todavía.</p>';
    } else {
        container.innerHTML = huertis.map(h => `
            <div class="huerti-row">
                <div class="avatar">${h.emoji}</div>
                <span class="huerti-name">${escapeHtml(h.nombre)}</span>
                ${h.rol === 'admin' ? '<span class="badge badge-admin">admin</span>' : ''}
            </div>
        `).join('');
    }
}

// ============================================
// ADMIN - SOLICITUDES
// ============================================

async function mostrarSolicitudesPendientes() {
    const { data: solicitudes } = await supabase
        .from('solicitudes')
        .select('*')
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: true });
    
    const container = document.getElementById('solicitudes-lista');
    
    if (!solicitudes || solicitudes.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:20px">No hay solicitudes pendientes.</p>';
    } else {
        container.innerHTML = solicitudes.map(s => `
            <div class="solicitud-row">
                <div class="solicitud-emoji">${s.emoji}</div>
                <div class="solicitud-info">
                    <div class="solicitud-nombre">${escapeHtml(s.nombre)}</div>
                    <div class="solicitud-fecha">Solicitado: ${new Date(s.created_at).toLocaleDateString('es')}</div>
                </div>
                <button class="btn-icon-sm" onclick="aprobarSolicitud('${s.id}', '${escapeHtml(s.nombre)}', '${s.emoji}')" style="color: var(--green-mid)">✅</button>
                <button class="btn-icon-sm" onclick="rechazarSolicitud('${s.id}')" style="color: var(--red-mid)">❌</button>
            </div>
        `).join('');
    }
    
    mostrarModal('modal-solicitudes');
}

async function aprobarSolicitud(solicitudId, nombre, emoji) {
    // Crear huerti
    const { data: newHuerti } = await supabase
        .from('huertis')
        .insert([{
            huerta_id: currentHuerta.id,
            solicitud_id: solicitudId,
            nombre: nombre,
            emoji: emoji,
            rol: 'huerti',
            activo: true
        }])
        .select()
        .single();
    
    // Actualizar estado de la solicitud
    await supabase
        .from('solicitudes')
        .update({ estado: 'aprobado' })
        .eq('id', solicitudId);
    
    cerrarModal('modal-solicitudes');
    mostrarNotificacion(`✅ ${nombre} ha sido aprobado/a`, 'info');
    cargarContadorSolicitudes();
}

async function rechazarSolicitud(solicitudId) {
    await supabase
        .from('solicitudes')
        .update({ estado: 'rechazado' })
        .eq('id', solicitudId);
    
    cerrarModal('modal-solicitudes');
    cargarContadorSolicitudes();
}

// ============================================
// ADMIN - GESTIÓN DE CATEGORÍAS
// ============================================

async function mostrarGestionCategorias() {
    const { data: categorias } = await supabase
        .from('categorias')
        .select('*')
        .eq('huerta_id', currentHuerta.id)
        .order('orden', { ascending: true });
    
    const container = document.getElementById('categorias-lista');
    
    if (!categorias || categorias.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:20px">No hay categorías.</p>';
    } else {
        container.innerHTML = categorias.map((c, idx) => `
            <div class="cat-row">
                <span class="cat-emoji">${c.emoji}</span>
                <span class="cat-nombre">${escapeHtml(c.nombre)}</span>
                <button class="btn-icon-sm" onclick="eliminarCategoria('${c.id}')" title="Eliminar">🗑️</button>
            </div>
        `).join('');
    }
    
    document.getElementById('nueva-cat-nombre').value = '';
    mostrarModal('modal-categorias');
}

async function agregarCategoria() {
    const nombre = document.getElementById('nueva-cat-nombre').value.trim();
    const emoji = document.getElementById('nueva-cat-emoji').value;
    
    if (!nombre) {
        alert('Escribe un nombre');
        return;
    }
    
    const { data: categorias } = await supabase
        .from('categorias')
        .select('orden')
        .eq('huerta_id', currentHuerta.id)
        .order('orden', { ascending: false })
        .limit(1);
    
    const nuevoOrden = categorias && categorias.length > 0 ? categorias[0].orden + 1 : 0;
    
    await supabase
        .from('categorias')
        .insert([{
            huerta_id: currentHuerta.id,
            nombre: nombre,
            emoji: emoji,
            orden: nuevoOrden
        }]);
    
    mostrarGestionCategorias();
    cargarCategoriasParaFiltros();
}

async function eliminarCategoria(categoriaId) {
    if (!confirm('¿Eliminar esta categoría? Las tareas quedarán sin categoría.')) return;
    
    await supabase
        .from('categorias')
        .delete()
        .eq('id', categoriaId);
    
    mostrarGestionCategorias();
    cargarCategoriasParaFiltros();
    renderTareas();
}

// ============================================
// ADMIN - GESTIÓN DE HUERTIS
// ============================================

async function mostrarGestionHuertis() {
    const { data: huertis } = await supabase
        .from('huertis')
        .select('*')
        .eq('huerta_id', currentHuerta.id)
        .eq('activo', true);
    
    const container = document.getElementById('gestion-huertis-lista');
    
    container.innerHTML = huertis.map(h => `
        <div class="gestion-huerti-row">
            <div class="avatar" style="width:32px;height:32px;font-size:16px">${h.emoji}</div>
            <div style="flex:1">
                <strong>${escapeHtml(h.nombre)}</strong>
                ${h.rol === 'admin' ? '<span class="badge badge-admin" style="margin-left:8px">admin</span>' : ''}
            </div>
            <div style="display:flex;gap:4px">
                ${h.rol !== 'admin' ? `<button class="btn-icon-sm" onclick="hacerAdmin('${h.id}')" title="Hacer admin">⭐</button>` : ''}
                ${h.id !== currentUser.id ? `<button class="btn-icon-sm" onclick="eliminarHuerti('${h.id}', '${escapeHtml(h.nombre)}')" title="Eliminar" style="color:var(--red-mid)">🗑️</button>` : ''}
            </div>
        </div>
    `).join('');
    
    mostrarModal('modal-gestion-huertis');
}

async function hacerAdmin(huertiId) {
    await supabase
        .from('huertis')
        .update({ rol: 'admin' })
        .eq('id', huertiId);
    
    mostrarGestionHuertis();
    if (currentTab === 'huertis') renderHuertis();
}

async function eliminarHuerti(huertiId, nombre) {
    if (!confirm(`¿Eliminar a ${nombre} de la huerta?`)) return;
    
    await supabase
        .from('huertis')
        .update({ activo: false })
        .eq('id', huertiId);
    
    mostrarGestionHuertis();
    if (currentTab === 'huertis') renderHuertis();
}

// ============================================
// EDICIÓN DE HUERTA
// ============================================

function mostrarEditarHuerta() {
    document.getElementById('editar-huerta-nombre').value = currentHuerta.nombre;
    document.getElementById('editar-huerta-emoji').value = currentHuerta.emoji;
    mostrarModal('modal-editar-huerta');
}

async function guardarEditarHuerta() {
    const nombre = document.getElementById('editar-huerta-nombre').value.trim();
    const emoji = document.getElementById('editar-huerta-emoji').value;
    
    if (!nombre) {
        alert('Escribe un nombre');
        return;
    }
    
    await supabase
        .from('huertas')
        .update({ nombre: nombre, emoji: emoji })
        .eq('id', currentHuerta.id);
    
    currentHuerta.nombre = nombre;
    currentHuerta.emoji = emoji;
    
    document.getElementById('huerta-nombre-top').textContent = nombre;
    document.getElementById('huerta-emoji-top').textContent = emoji;
    
    cerrarModal('modal-editar-huerta');
}

// ============================================
// MI CUENTA
// ============================================

function editarMiPerfil() {
    const nuevoNombre = prompt('Nuevo nombre:', currentUser.nombre);
    if (nuevoNombre && nuevoNombre.trim()) {
        const nuevoEmoji = prompt('Nuevo emoji (elige uno):', currentUser.emoji);
        if (nuevoEmoji) {
            actualizarPerfil(nuevoNombre.trim(), nuevoEmoji);
        }
    }
}

async function actualizarPerfil(nombre, emoji) {
    await supabase
        .from('huertis')
        .update({ nombre: nombre, emoji: emoji })
        .eq('id', currentUser.id);
    
    currentUser.nombre = nombre;
    currentUser.emoji = emoji;
    
    document.getElementById('menu-nombre').textContent = nombre;
    document.getElementById('menu-avatar').textContent = emoji;
}

function borrarMiCuenta() {
    let mensaje = '¿Estás segura de que quieres borrar tu cuenta?';
    
    if (currentUser.rol === 'admin') {
        // Verificar si es el único admin
        supabase
            .from('huertis')
            .select('id', { count: 'exact' })
            .eq('huerta_id', currentHuerta.id)
            .eq('rol', 'admin')
            .eq('activo', true)
            .then(({ count }) => {
                if (count === 1) {
                    mensaje = 'Eres el único administrador. Si borras tu cuenta, se borrará toda la huerta. ¿Continuar?';
                }
                mostrarConfirmacion(mensaje, async () => {
                    if (count === 1) {
                        // Borrar toda la huerta
                        await supabase
                            .from('huertas')
                            .delete()
                            .eq('id', currentHuerta.id);
                        sessionStorage.removeItem('huertapp_user_id');
                        location.reload();
                    } else {
                        // Solo borrar la cuenta
                        await supabase
                            .from('huertis')
                            .update({ activo: false })
                            .eq('id', currentUser.id);
                        sessionStorage.removeItem('huertapp_user_id');
                        location.reload();
                    }
                });
            });
    } else {
        mostrarConfirmacion(mensaje, async () => {
            await supabase
                .from('huertis')
                .update({ activo: false })
                .eq('id', currentUser.id);
            sessionStorage.removeItem('huertapp_user_id');
            location.reload();
        });
    }
}

function confirmarBorrarHuerta() {
    mostrarConfirmacion(
        '⚠️ Esto borrará TODA la huerta: tareas, huertis, categorías, noticias y eventos. No se puede deshacer.',
        async () => {
            await supabase
                .from('huertas')
                .delete()
                .eq('id', currentHuerta.id);
            sessionStorage.removeItem('huertapp_user_id');
            location.reload();
        }
    );
}

// ============================================
// COMPARTIR
// ============================================

function compartir(via) {
    const url = window.location.href;
    const msg = `¡Únete a la Huerta de Tetuán en HuertApp! ${url}`;
    
    if (via === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`);
    } else if (via === 'telegram') {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('¡Únete a la Huerta de Tetuán!')}`);
    } else if (via === 'email') {
        window.location.href = `mailto:?subject=Únete a HuertApp&body=${encodeURIComponent(msg)}`;
    }
}

// ============================================
// UTILIDADES - MODALES Y CONFIRMACIONES
// ============================================

function mostrarModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function cerrarModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

let confirmCallback = null;

function mostrarConfirmacion(mensaje, callback) {
    document.getElementById('confirm-msg').textContent = mensaje;
    document.getElementById('confirm-nombre').value = '';
    confirmCallback = callback;
    
    const btnConfirm = document.getElementById('confirm-accion-btn');
    const newBtn = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);
    newBtn.onclick = () => {
        const typed = document.getElementById('confirm-nombre').value.trim();
        if (typed !== currentUser.nombre) {
            alert('El nombre no coincide. Escribe exactamente tu nombre.');
            return;
        }
        if (confirmCallback) confirmCallback();
        cerrarModal('modal-confirmar');
    };
    
    mostrarModal('modal-confirmar');
}

function show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// Configurar evento para repetición personalizada
document.addEventListener('DOMContentLoaded', () => {
    const repetirSelect = document.getElementById('tarea-repetir');
    if (repetirSelect) {
        repetirSelect.addEventListener('change', function() {
            const customGroup = document.getElementById('custom-repeat-group');
            if (customGroup) {
                customGroup.classList.toggle('hidden', this.value !== 'custom');
            }
        });
    }
});

// Iniciar
init();
