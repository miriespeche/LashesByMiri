let WHATSAPP_NUMBER = localStorage.getItem("miri_wa_number") || "5491144123280";
const DEFAULT_MESSAGE = "Hola, quiero reservar un turno para extensiones de pestañas";
let BANK_ALIAS = localStorage.getItem("miri_mp_link") || "mirandaespeche";
let BANK_NAME = "Miranda Espeche";

// --- Estructura de Horarios (Soporte Multi-estudio) ---
const DEFAULT_SLOTS = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

const loadWorkSlots = () => {
  const saved = localStorage.getItem("miri_work_slots");
  if (!saved) return { "Monserrat": [...DEFAULT_SLOTS], "José Marmol": [...DEFAULT_SLOTS] };
  try {
    const parsed = JSON.parse(saved);
    // Compatibilidad con formato antiguo (array simple)
    if (Array.isArray(parsed)) return { "Monserrat": parsed, "José Marmol": [...DEFAULT_SLOTS] };
    return parsed;
  } catch (e) {
    return { "Monserrat": [...DEFAULT_SLOTS], "José Marmol": [...DEFAULT_SLOTS] };
  }
};

let WORK_SLOTS = loadWorkSlots();
let CUSTOM_WORK_DAYS = JSON.parse(localStorage.getItem("miri_custom_days") || "{}");

// --- Bloqueo de meses / desbloqueo de días ---
// CLOSED_MONTHS["9/2026"] = true (cerrado) | false (abierto explícito). Si no está definido, aplica CLOSED_DEFAULT.
// UNLOCKED_DAYS["23/9/2026"] = true: día habilitado dentro de un mes cerrado.
const safeParse = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "") ?? fallback; } catch (e) { return fallback; } };
let CLOSED_MONTHS = safeParse("miri_closed_months", {});
let UNLOCKED_DAYS = safeParse("miri_unlocked_days", {});
let CLOSED_DEFAULT = localStorage.getItem("miri_closed_default") === "1";

const monthKeyOf = (date) => `${date.getMonth() + 1}/${date.getFullYear()}`;
const isMonthClosed = (date) => {
  const v = CLOSED_MONTHS[monthKeyOf(date)];
  return v === undefined ? CLOSED_DEFAULT : !!v;
};
// Un día NO es reservable si su mes está cerrado y ella no lo desbloqueó
const isDayLocked = (date) => isMonthClosed(date) && !UNLOCKED_DAYS[`${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`];

const getSchedulePayload = () => ({
  slots: WORK_SLOTS,
  custom_days: CUSTOM_WORK_DAYS,
  closed_months: CLOSED_MONTHS,
  unlocked_days: UNLOCKED_DAYS,
  closed_default: CLOSED_DEFAULT
});

const persistLockState = () => {
  localStorage.setItem("miri_closed_months", JSON.stringify(CLOSED_MONTHS));
  localStorage.setItem("miri_unlocked_days", JSON.stringify(UNLOCKED_DAYS));
  localStorage.setItem("miri_closed_default", CLOSED_DEFAULT ? "1" : "0");
};

// Aplica una fila "schedule" (de la nube o del JSON) al estado local
const applyScheduleData = (data) => {
  if (!data) return;
  if (data.slots) {
    let incoming = data.slots;
    if (Array.isArray(incoming)) incoming = { "Monserrat": incoming, "José Marmol": [...DEFAULT_SLOTS] };
    localStorage.setItem("miri_work_slots", JSON.stringify(incoming));
    WORK_SLOTS = incoming;
  }
  if (data.custom_days) {
    localStorage.setItem("miri_custom_days", JSON.stringify(data.custom_days));
    CUSTOM_WORK_DAYS = data.custom_days;
  }
  if (data.closed_months || data.unlocked_days || data.closed_default !== undefined) {
    CLOSED_MONTHS = data.closed_months || {};
    UNLOCKED_DAYS = data.unlocked_days || {};
    CLOSED_DEFAULT = !!data.closed_default;
    persistLockState();
  }
};

// --- Helper de Fecha Consistente ---
const normalizeDateStr = (dateStr) => {
  if (!dateStr) return dateStr;
  // Caso 1: Formato d/m/yyyy (ej: 8/4/2026 o 08/04/2026)
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      // Forzamos d/m/yyyy sin ceros a la izquierda para consistencia total
      return `${parseInt(parts[0])}/${parseInt(parts[1])}/${parts[2]}`;
    }
  }
  // Caso 2: Formato ISO yyyy-mm-dd (que suele devolver Supabase)
  if (dateStr.includes("-")) {
    const parts = dateStr.split("T")[0].split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      // Convertimos yyyy-mm-dd a d/m/yyyy
      return `${parseInt(parts[2])}/${parseInt(parts[1])}/${parts[0]}`;
    }
  }
  return dateStr;
};

const formatDate = (date) => `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

// --- Helper de Comparación de Estudios ---
const isSameStudio = (s1, s2) => {
  const norm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return norm(s1) === norm(s2);
};

const inferStudioFromBookingId = (bookingId) => {
  if (!bookingId) return "Monserrat";
  const parts = bookingId.split("-");
  if (parts.length <= 5) return "Monserrat";
  const studioSlug = parts.slice(5).join(" ");
  if (isSameStudio(studioSlug, "José Marmol")) return "José Marmol";
  if (isSameStudio(studioSlug, "Monserrat")) return "Monserrat";
  return studioSlug || "Monserrat";
};

const encodeBookingCloudMeta = (serviceName, studio, name) => JSON.stringify({
  service: serviceName || null,
  studio: studio || "Monserrat",
  name: name || "-",
  created_at: new Date().toISOString()
});

const decodeBookingCloudMeta = (serviceValue, bookingId) => {
  const fallback = {
    service: null,
    studio: inferStudioFromBookingId(bookingId),
    name: "-",
    created_at: null
  };

  if (!serviceValue || typeof serviceValue !== "string") return fallback;

  try {
    const parsed = JSON.parse(serviceValue);
    return {
      service: parsed.service || null,
      studio: parsed.studio || fallback.studio,
      name: parsed.name || "-",
      created_at: parsed.created_at || null
    };
  } catch (e) {
    return {
      service: serviceValue,
      studio: fallback.studio,
      name: "-",
      created_at: null
    };
  }
};

const getBookingCloudId = (dateStr, time, studio) =>
  `${normalizeDateStr(dateStr)}-${time}-${studio}`.replace(/[\/\s:]/g, "-").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const loadPendingCloudBookings = () => {
  try {
    return JSON.parse(localStorage.getItem("miri_pending_cloud_bookings") || "[]");
  } catch (e) {
    return [];
  }
};

const savePendingCloudBookings = (items) => {
  localStorage.setItem("miri_pending_cloud_bookings", JSON.stringify(items));
};

const upsertPendingCloudBooking = (booking) => {
  const items = loadPendingCloudBookings().filter(item => item.id !== booking.id);
  items.push(booking);
  savePendingCloudBookings(items);
};

const removePendingCloudBooking = (bookingId) => {
  const items = loadPendingCloudBookings().filter(item => item.id !== bookingId);
  savePendingCloudBookings(items);
};

// --- Configuración de Base de Datos (Supabase) ---
const CLOUD_URL = "https://hugbaugzsntojbotjblz.supabase.co"; 
const CLOUD_KEY = "sb_publishable_kBQ4L0lrcxnQNIasDakhBw_tmhkeNJs"; 

let SUPABASE_URL = localStorage.getItem("miri_supabase_url") || CLOUD_URL;
let SUPABASE_KEY = localStorage.getItem("miri_supabase_key") || CLOUD_KEY;
let cloudSyncIntervalId = null;

// Solo habilitamos la nube si la llave existe
const isCloudEnabled = () => SUPABASE_URL !== "" && SUPABASE_KEY !== "";

// La página queda oculta (CSS) hasta tener datos frescos; esto garantiza que nunca quede oculta para siempre.
// Cambios de página: copia en memoria + caché en localStorage (si la cuota se llena, la página igual funciona)
const changesMem = {};
const setPageChanges = (id, data) => {
  changesMem[id] = data;
  try { localStorage.setItem(`miri_changes_${id}`, JSON.stringify(data)); }
  catch (e) { console.warn("Caché local lleno; se usa solo memoria para", id); }
};
const getPageChanges = (id) => {
  if (changesMem[id]) return changesMem[id];
  try { return JSON.parse(localStorage.getItem(`miri_changes_${id}`) || "null"); } catch (e) { return null; }
};

const revealPage = () => { document.body.style.opacity = "1"; };
setTimeout(revealPage, 4000);

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);

const cloudFetch = async (table, query = "select=*") => {
  if (!isCloudEnabled()) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
      cache: "no-store"
    });
    return response.ok ? await response.json() : null;
  } catch (e) { return null; }
};

const cloudUpsert = async (table, data) => {
  if (!isCloudEnabled()) return false;
  try {
    // Para Supabase/PostgREST, el upsert se hace con POST y los headers adecuados.
    // Añadimos on_conflict para ser más explícitos si hay una columna ID.
    const url = `${SUPABASE_URL}/rest/v1/${table}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { 
        "apikey": SUPABASE_KEY, 
        "Authorization": `Bearer ${SUPABASE_KEY}`, 
        "Content-Type": "application/json", 
        "Prefer": "resolution=merge-duplicates" 
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      // Intentar leer el error detallado
      let errorDetail = "";
      try {
        const err = await response.json();
        errorDetail = JSON.stringify(err);
        console.error("Error detallado en cloudUpsert:", err);
      } catch (e) {
        errorDetail = response.statusText;
      }
      return false;
    }
    console.log(`Guardado exitoso en la nube (${table})`);
    return true;
  } catch (e) { 
    console.error("Error de conexión en cloudUpsert:", e);
    return false; 
  }
};

const cloudDelete = async (table, id) => {
  if (!isCloudEnabled()) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
    });
    return response.ok;
  } catch (e) { return false; }
};

const getElementPath = (el) => {
  if (el.id) return `#${el.id}`;
  const path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    let sibling = el.previousElementSibling;
    let index = 1;
    while (sibling) {
      if (sibling.nodeName === el.nodeName) index++;
      sibling = sibling.previousElementSibling;
    }
    const hasSiblings = el.nextElementSibling || index > 1;
    if (hasSiblings) selector += `:nth-of-type(${index})`;
    path.unshift(selector);
    el = el.parentNode;
  }
  return path.join(" > ");
};

// --- Carga Inicial de Datos desde miri_data.json (GitHub Fallback) ---
const loadInitialData = async () => {
  try {
    // Respaldo: solo se usa cuando la nube no responde y solo rellena lo que NO existe en el caché local.
    // Nunca pisa datos más nuevos (antes el JSON viejo pisaba el caché y 3 seg después la nube lo corregía).
    const response = await fetch('miri_data.json', { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();

    console.log("Cargando respaldo desde miri_data.json...");

    if (data.config) {
      if (!localStorage.getItem("miri_wa_number") && data.config.wa) {
        localStorage.setItem("miri_wa_number", data.config.wa);
        WHATSAPP_NUMBER = data.config.wa;
      }
      if (!localStorage.getItem("miri_mp_link") && data.config.mp) {
        localStorage.setItem("miri_mp_link", data.config.mp);
        BANK_ALIAS = data.config.mp;
      }
      if (!localStorage.getItem("miri_supabase_url") && data.config.supabase_url) {
        localStorage.setItem("miri_supabase_url", data.config.supabase_url);
        SUPABASE_URL = data.config.supabase_url;
      }
      if (!localStorage.getItem("miri_supabase_key") && data.config.supabase_key) {
        localStorage.setItem("miri_supabase_key", data.config.supabase_key);
        SUPABASE_KEY = data.config.supabase_key;
      }
    }

    if (data.schedule) {
      if (data.schedule.slots && !localStorage.getItem("miri_work_slots")) {
        localStorage.setItem("miri_work_slots", JSON.stringify(data.schedule.slots));
        WORK_SLOTS = data.schedule.slots;
      }
      if (data.schedule.custom_days && !localStorage.getItem("miri_custom_days")) {
        localStorage.setItem("miri_custom_days", JSON.stringify(data.schedule.custom_days));
        CUSTOM_WORK_DAYS = data.schedule.custom_days;
      }
      if (!localStorage.getItem("miri_closed_months") && (data.schedule.closed_months || data.schedule.unlocked_days)) {
        applyScheduleData({ closed_months: data.schedule.closed_months, unlocked_days: data.schedule.unlocked_days, closed_default: data.schedule.closed_default });
      }
    }

    // Aplicar turnos desde el JSON solo si no estamos usando la nube como fuente principal
    if (data.bookings && !isCloudEnabled()) {
      // Usamos una función de mezcla única para evitar duplicados y race conditions
      const localBookings = JSON.parse(localStorage.getItem("bookedSlots") || "{}");
      let changed = false;
      
      Object.keys(data.bookings).forEach(date => {
        const normDate = normalizeDateStr(date);
        if (!localBookings[normDate]) localBookings[normDate] = [];
        
        data.bookings[date].forEach(b => {
          const time = typeof b === 'string' ? b : b.time;
          const studio = typeof b === 'string' ? "Monserrat" : (b.studio || "Monserrat");
          const exists = localBookings[normDate].some(lb => {
            const lTime = typeof lb === 'string' ? lb : lb.time;
            const lStudio = typeof lb === 'string' ? "Monserrat" : (lb.studio || "Monserrat");
            return lTime === time && isSameStudio(lStudio, studio);
          });
          if (!exists) {
            localBookings[normDate].push(b);
            changed = true;
          }
        });
      });
      if (changed) {
        localStorage.setItem("bookedSlots", JSON.stringify(localBookings));
        console.log("Turnos del JSON mezclados con éxito.");
      }
    } else if (data.bookings && isCloudEnabled()) {
      console.log("Se ignoraron los turnos del JSON porque la nube está activa.");
    }

    // Aplicar cambios visuales
    if (data.changes) {
      Object.keys(data.changes).forEach(page => {
        const key = `miri_changes_${page}`;
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data.changes[page]));
      });
    }

  } catch (e) {
    console.warn("No se pudo cargar miri_data.json o el archivo no existe.");
  }
};
let adminCommandString = "";
let adminOverlay = null;
let adminBookingFilter = "upcoming";

const adminToast = (msg) => {
  if (!adminOverlay) return;
  let el = document.getElementById("adminToast");
  if (!el) { el = document.createElement("div"); el.id = "adminToast"; el.className = "admin-toast"; adminOverlay.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._h);
  el._h = setTimeout(() => el.classList.remove("show"), 2200);
};

const injectAdminUI = () => {
  if (document.getElementById("adminOverlay")) return;
  const html = `
    <div class="admin-overlay" id="adminOverlay">
      <div class="admin-modal" role="dialog" aria-label="Panel de administración">
        <header class="admin-head">
          <div>
            <span class="admin-kicker">Panel de administración</span>
            <h2>Hola, Miri</h2>
          </div>
          <button class="admin-close" id="adminClose" type="button" aria-label="Cerrar panel">&times;</button>
        </header>

        <nav class="admin-tabs" role="tablist">
          <button class="admin-tab active" type="button" data-tab="turnos"><span>Turnos</span></button>
          <button class="admin-tab" type="button" data-tab="dias"><span>Días</span></button>
          <button class="admin-tab" type="button" data-tab="horarios"><span>Horarios</span></button>
          <button class="admin-tab" type="button" data-tab="pagina"><span>Página</span></button>
          <button class="admin-tab" type="button" data-tab="ajustes"><span>Ajustes</span></button>
        </nav>

        <div class="admin-body">

          <!-- TURNOS -->
          <section class="admin-pane active" data-pane="turnos">
            <div class="admin-stats" id="adminStats"></div>
            <div class="admin-segment" role="group" aria-label="Filtrar turnos">
              <button type="button" class="active" id="adminFilterUpcoming">Próximos</button>
              <button type="button" id="adminFilterAll">Todos</button>
            </div>
            <div class="admin-bookings" id="adminBookingsTable"></div>
          </section>

          <!-- DÍAS -->
          <section class="admin-pane" data-pane="dias">
            <div class="admin-card">
              <h3>Calendario</h3>
              <p class="admin-hint">Tocá un día para ver o cambiar sus horarios. Los días con puntito dorado tienen horarios especiales.</p>
              <div class="calendar-wrapper admin-cal">
                <div class="calendar-header">
                  <button id="adminSchedulePrev" type="button" aria-label="Mes anterior">&lt;</button>
                  <h2 id="adminScheduleMonth">Mes Año</h2>
                  <button id="adminScheduleNext" type="button" aria-label="Mes siguiente">&gt;</button>
                </div>
                <div class="calendar-grid" id="adminScheduleGrid"></div>
              </div>
            </div>

            <div class="admin-card">
              <h3>Abrir o cerrar turnos</h3>
              <div class="admin-lock-panel">
                <p id="adminLockStatus" class="admin-lock-status"></p>
                <div class="admin-lock-actions">
                  <button class="button button-primary" id="adminCloseMonth" type="button">Cerrar todos los turnos del mes</button>
                  <button class="button button-secondary" id="adminOpenMonth" type="button">Abrir mes completo</button>
                  <button class="button button-secondary" id="adminToggleDay" type="button">Desbloquear día seleccionado</button>
                  <button class="button button-secondary" id="adminToggleDefault" type="button">Cerrar todos los meses por defecto</button>
                </div>
                <p class="admin-lock-help">Con el mes cerrado, las clientas no pueden reservar ningún día. Elegí un día en el calendario y tocá "Desbloquear" para habilitarlo.</p>
              </div>
            </div>

            <div class="admin-card">
              <h3>Horarios de este día</h3>
              <p class="admin-hint">Escribí los horarios separados por coma. Si lo dejás vacío, se usan los horarios de siempre. Para cerrar solo este día escribí: <b>Sin horarios</b>.</p>
              <div class="admin-grid">
                <div class="admin-field">
                  <label for="adminCustomSlotStudio">Estudio</label>
                  <select id="adminCustomSlotStudio">
                    <option value="Monserrat">Monserrat</option>
                    <option value="José Marmol">José Marmol</option>
                  </select>
                </div>
                <div class="admin-field"><label for="adminCustomDate">Día elegido</label><input type="date" id="adminCustomDate"></div>
                <div class="admin-field admin-span"><label for="adminCustomSlots">Horarios</label><input type="text" id="adminCustomSlots" placeholder="Ej: 10:00, 11:00, 12:30"></div>
              </div>
              <button class="button button-primary admin-save" id="adminSaveCustomDay" type="button">Guardar horarios del día</button>
            </div>
          </section>

          <!-- HORARIOS -->
          <section class="admin-pane" data-pane="horarios">
            <div class="admin-card">
              <h3>Horarios de siempre</h3>
              <p class="admin-hint">Son los horarios que se ofrecen todos los días, salvo los que cambies en la pestaña Días. Escribilos separados por coma (ej: 09:00, 10:30, 14:00).</p>
              <div class="admin-grid">
                <div class="admin-field">
                  <label for="adminWorkSlotStudio">Estudio</label>
                  <select id="adminWorkSlotStudio">
                    <option value="Monserrat">Monserrat</option>
                    <option value="José Marmol">José Marmol</option>
                  </select>
                </div>
                <div class="admin-field">
                  <label for="adminWorkSlots">Horarios</label>
                  <input type="text" id="adminWorkSlots" placeholder="09:00, 10:00, 11:00...">
                </div>
              </div>
              <button class="button button-primary admin-save" id="adminSaveSlots" type="button">Guardar horarios</button>
            </div>
          </section>

          <!-- PÁGINA -->
          <section class="admin-pane" data-pane="pagina">
            <div class="admin-card">
              <h3>Editar la página</h3>
              <p class="admin-hint">Cambiá textos, precios y fotos directamente sobre la página. Tocá lo que quieras modificar, escribí y después apretá <b>Guardar</b> arriba.</p>
              <button class="button button-primary admin-save" id="adminEnableEdit" type="button">Activar modo edición</button>
            </div>
          </section>

          <!-- AJUSTES -->
          <section class="admin-pane" data-pane="ajustes">
            <div class="admin-card">
              <h3>Datos de contacto</h3>
              <div class="admin-grid">
                <div class="admin-field"><label for="adminWaNumber">WhatsApp</label><input type="text" id="adminWaNumber" inputmode="tel"></div>
                <div class="admin-field"><label for="adminMpLink">Alias para transferencias</label><input type="text" id="adminMpLink"></div>
              </div>
              <button class="button button-primary admin-save" id="adminSaveConfig" type="button">Guardar</button>
            </div>

            <details class="admin-card admin-advanced">
              <summary>Opciones avanzadas</summary>
              <p class="admin-hint">Solo para uso técnico. No hace falta tocar esto en el día a día.</p>
              <div class="admin-lock-actions">
                <button class="button button-secondary" id="adminSyncFromCloud" type="button">Actualizar desde la nube</button>
                <button class="button button-secondary" id="adminDownloadChanges" type="button">Descargar copia de seguridad</button>
                <button class="button admin-danger" id="adminResetLocal" type="button">Borrar datos de este dispositivo</button>
              </div>
              <h4 class="admin-sub">Conexión a la nube</h4>
              <div class="admin-grid">
                <div class="admin-field"><label for="adminSupabaseUrl">URL</label><input type="text" id="adminSupabaseUrl"></div>
                <div class="admin-field"><label for="adminSupabaseKey">Clave pública</label><input type="text" id="adminSupabaseKey"></div>
              </div>
              <button class="button button-secondary admin-save" id="adminSaveCloudConfig" type="button">Guardar conexión</button>
            </details>
          </section>

        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  adminOverlay = document.getElementById("adminOverlay");
  document.getElementById("adminClose").onclick = () => adminOverlay.style.display = "none";
  const setAdminTab = (name) => {
    adminOverlay.querySelectorAll(".admin-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    adminOverlay.querySelectorAll(".admin-pane").forEach(p => p.classList.toggle("active", p.dataset.pane === name));
    if (name === "turnos") renderAdminBookings();
    adminOverlay.querySelector(".admin-body").scrollTop = 0;
  };
  adminOverlay.querySelectorAll(".admin-tab").forEach(b => b.onclick = () => setAdminTab(b.dataset.tab));
  adminOverlay.addEventListener("click", (e) => { if (e.target === adminOverlay) adminOverlay.style.display = "none"; });
  document.getElementById("adminFilterUpcoming").onclick = () => { adminBookingFilter = "upcoming"; renderAdminBookings(); };
  document.getElementById("adminFilterAll").onclick = () => { adminBookingFilter = "all"; renderAdminBookings(); };
  document.getElementById("adminEnableEdit").onclick = () => { adminOverlay.style.display = "none"; enableVisualEditing(); };
  document.getElementById("adminSaveCloudConfig").onclick = () => {
    localStorage.setItem("miri_supabase_url", document.getElementById("adminSupabaseUrl").value.trim());
    localStorage.setItem("miri_supabase_key", document.getElementById("adminSupabaseKey").value.trim());
    location.reload();
  };
  document.getElementById("adminSyncFromCloud").onclick = () => syncWithCloud(true);
  document.getElementById("adminResetLocal").onclick = () => { if(confirm("¿Borrar todo?")) { localStorage.clear(); location.reload(); } };
  document.getElementById("adminSaveConfig").onclick = () => {
    const wa = document.getElementById("adminWaNumber").value.trim();
    const mp = document.getElementById("adminMpLink").value.trim();
    if(wa) localStorage.setItem("miri_wa_number", wa);
    if(mp) localStorage.setItem("miri_mp_link", mp);
    if(isCloudEnabled()) cloudUpsert("config", {id:1, wa:wa||WHATSAPP_NUMBER, mp:mp||BANK_ALIAS}).then(() => location.reload());
    else location.reload();
  };
  document.getElementById("adminSaveSlots").onclick = () => {
    const studio = document.getElementById("adminWorkSlotStudio").value;
    const slotsRaw = document.getElementById("adminWorkSlots").value.trim();
    if(slotsRaw) {
      const slotsArr = slotsRaw.split(",").map(s => s.trim()).filter(s => s !== "");
      if(slotsArr.length > 0) {
        WORK_SLOTS[studio] = slotsArr;
        localStorage.setItem("miri_work_slots", JSON.stringify(WORK_SLOTS));
        
        const btn = document.getElementById("adminSaveSlots");
        const oldText = btn.textContent;
        btn.textContent = "¡Guardado!";
        btn.style.background = "#48bb78";
        
        if(isCloudEnabled()) {
          cloudUpsert("page_changes", {id:"schedule", data:getSchedulePayload()}).then(ok => {
            setTimeout(() => { btn.textContent = oldText; btn.style.background = "#d98aa7"; }, 2000);
            if(!ok) alert("Error al guardar en la nube, pero quedó localmente.");
          });
        } else {
          setTimeout(() => { btn.textContent = oldText; btn.style.background = "#d98aa7"; }, 2000);
        }
      }
    }
  };
  document.getElementById("adminSaveCustomDay").onclick = () => {
    const studio = document.getElementById("adminCustomSlotStudio").value;
    const rawDate = document.getElementById("adminCustomDate").value;
    if(!rawDate) return alert("Selecciona una fecha");
    const [y, m, d] = rawDate.split("-");
    const dStr = `${parseInt(d)}/${parseInt(m)}/${y}`;
    const rawSlots = document.getElementById("adminCustomSlots").value.trim();
    
    const newCustomDays = {...CUSTOM_WORK_DAYS};
    if(!newCustomDays[dStr]) newCustomDays[dStr] = {};
    
    if(Array.isArray(newCustomDays[dStr])) {
      const oldSlots = newCustomDays[dStr];
      newCustomDays[dStr] = { "Monserrat": oldSlots, "José Marmol": [...DEFAULT_SLOTS] };
    }

    if(!rawSlots) {
      delete newCustomDays[dStr][studio];
      if(Object.keys(newCustomDays[dStr]).length === 0) delete newCustomDays[dStr];
    } else {
      newCustomDays[dStr][studio] = rawSlots.split(",").map(s => s.trim()).filter(s => s !== "");
    }
    
    localStorage.setItem("miri_custom_days", JSON.stringify(newCustomDays));
    CUSTOM_WORK_DAYS = newCustomDays;
    
    const btn = document.getElementById("adminSaveCustomDay");
    const oldText = btn.textContent;
    btn.textContent = "¡Día Guardado!";
    btn.style.background = "#48bb78";
    
    renderScheduleCal(); // Refrescar el mini-calendario del admin

    if(isCloudEnabled()) {
      cloudUpsert("page_changes", {id:"schedule", data:getSchedulePayload()}).then(ok => {
        setTimeout(() => { btn.textContent = oldText; btn.style.background = "#4a5568"; }, 2000);
        if(!ok) alert("Error al guardar en la nube.");
      });
    } else {
      setTimeout(() => { btn.textContent = oldText; btn.style.background = "#4a5568"; }, 2000);
    }
  };
  document.getElementById("adminDownloadChanges").onclick = () => {
    const data = { 
      config: { 
        wa: WHATSAPP_NUMBER, 
        mp: BANK_ALIAS,
        supabase_url: SUPABASE_URL,
        supabase_key: SUPABASE_KEY
      }, 
      bookings: JSON.parse(localStorage.getItem("bookedSlots") || "{}"), 
      schedule: getSchedulePayload(),
      changes: {} 
    };
    ['inicio', 'servicios', 'galeria', 'opiniones', 'contacto', 'reservar', 'global'].forEach(p => { 
      const s = localStorage.getItem(`miri_changes_${p}`); 
      if(s) data.changes[p] = JSON.parse(s); 
    });
    const a = document.createElement("a"); 
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:"application/json"})); 
    a.download = "miri_data.json"; 
    a.click();
  };

  const monthEl = document.getElementById("adminScheduleMonth");
  const grid = document.getElementById("adminScheduleGrid");
  const dateInput = document.getElementById("adminCustomDate");
  const slotsInput = document.getElementById("adminCustomSlots");
  let curr = new Date();
  let selected = null;

  const toKey = (date) => `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  const toDateInput = (date) => {
    const y = `${date.getFullYear()}`;
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const selectDay = (date) => {
    selected = date;
    const key = toKey(date);
    dateInput.value = toDateInput(date);
    const studio = document.getElementById("adminCustomSlotStudio").value;
    let custom = CUSTOM_WORK_DAYS[key];
    
    // Compatibilidad
    if (Array.isArray(custom)) {
      custom = { "Monserrat": custom, "José Marmol": [...DEFAULT_SLOTS] };
    }
    
    const studioSlots = custom ? custom[studio] : null;
    slotsInput.value = Array.isArray(studioSlots) ? studioSlots.join(", ") : "";
    renderScheduleCal();
    if (typeof refreshLockUI === "function") refreshLockUI();
  };

  document.getElementById("adminWorkSlotStudio").onchange = () => {
    const studio = document.getElementById("adminWorkSlotStudio").value;
    document.getElementById("adminWorkSlots").value = (WORK_SLOTS[studio] || []).join(", ");
  };

  document.getElementById("adminCustomSlotStudio").onchange = () => {
    if (selected) selectDay(selected);
  };

  const renderScheduleCal = () => {
    if(!grid || !monthEl) return;
    grid.innerHTML = "";
    monthEl.textContent = new Intl.DateTimeFormat("es-ES", {month:"long", year:"numeric"}).format(curr);
    ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].forEach(d => { const h = document.createElement("div"); h.className="calendar-day-head"; h.textContent=d; grid.appendChild(h); });
    const first = new Date(curr.getFullYear(), curr.getMonth(), 1).getDay();
    const last = new Date(curr.getFullYear(), curr.getMonth() + 1, 0).getDate();
    for(let i=0; i<first; i++) grid.appendChild(document.createElement("div")).className="calendar-day empty";
    for(let i=1; i<=last; i++) {
      const cell = document.createElement("div");
      cell.className = "calendar-day";
      cell.textContent = i;
      const date = new Date(curr.getFullYear(), curr.getMonth(), i);
      if(selected && date.toDateString() === selected.toDateString()) cell.classList.add("selected");
      const key = toKey(date);
      if(CUSTOM_WORK_DAYS[key]) {
        const indicator = document.createElement("div");
        indicator.className = "day-indicator";
        indicator.innerHTML = '<span class="dot-indicator" style="background: var(--gold);"></span>';
        cell.appendChild(indicator);
      }
      if (isMonthClosed(date)) cell.classList.add(UNLOCKED_DAYS[key] ? "day-unlocked" : "day-locked");
      cell.onclick = () => selectDay(date);
      grid.appendChild(cell);
    }
  };

  const lockStatusEl = document.getElementById("adminLockStatus");
  const monthLabel = () => new Intl.DateTimeFormat("es-ES", {month: "long", year: "numeric"}).format(curr);

  const refreshLockUI = () => {
    const closed = isMonthClosed(curr);
    const unlockedCount = Object.keys(UNLOCKED_DAYS).filter(k => { const [, m, y] = k.split("/").map(Number); return m === curr.getMonth() + 1 && y === curr.getFullYear(); }).length;
    lockStatusEl.textContent = closed
      ? `${monthLabel()}: CERRADO (${unlockedCount} día${unlockedCount === 1 ? "" : "s"} desbloqueado${unlockedCount === 1 ? "" : "s"})`
      : `${monthLabel()}: ABIERTO (todos los días con horarios se pueden reservar)`;
    lockStatusEl.classList.toggle("is-closed", closed);
    document.getElementById("adminCloseMonth").disabled = closed;
    document.getElementById("adminOpenMonth").disabled = !closed;
    const toggleDay = document.getElementById("adminToggleDay");
    toggleDay.disabled = !closed || !selected;
    toggleDay.textContent = selected && UNLOCKED_DAYS[toKey(selected)] ? "Volver a bloquear día seleccionado" : "Desbloquear día seleccionado";
    document.getElementById("adminToggleDefault").textContent = CLOSED_DEFAULT ? "Dejar los meses abiertos por defecto" : "Cerrar todos los meses por defecto";
  };

  const saveLockState = async () => {
    persistLockState();
    renderScheduleCal();
    refreshLockUI();
    if (isCloudEnabled()) {
      const ok = await cloudUpsert("page_changes", {id: "schedule", data: getSchedulePayload()});
      if (!ok) alert("Error al guardar en la nube, pero quedó guardado localmente.");
      else adminToast("Cambios guardados");
    } else adminToast("Guardado en este dispositivo");
  };

  const clearUnlockedOfMonth = () => {
    Object.keys(UNLOCKED_DAYS).forEach(k => { const [, m, y] = k.split("/").map(Number); if (m === curr.getMonth() + 1 && y === curr.getFullYear()) delete UNLOCKED_DAYS[k]; });
  };

  document.getElementById("adminCloseMonth").onclick = () => {
    if (!confirm(`¿Cerrar TODOS los turnos de ${monthLabel()}? Las clientas no podrán reservar hasta que desbloquees días.`)) return;
    CLOSED_MONTHS[monthKeyOf(curr)] = true;
    clearUnlockedOfMonth();
    saveLockState();
  };
  document.getElementById("adminOpenMonth").onclick = () => {
    CLOSED_MONTHS[monthKeyOf(curr)] = false;
    clearUnlockedOfMonth();
    saveLockState();
  };
  document.getElementById("adminToggleDay").onclick = () => {
    if (!selected) return;
    const k = toKey(selected);
    if (UNLOCKED_DAYS[k]) delete UNLOCKED_DAYS[k]; else UNLOCKED_DAYS[k] = true;
    saveLockState();
  };
  document.getElementById("adminToggleDefault").onclick = () => {
    const msg = CLOSED_DEFAULT
      ? "¿Dejar los meses abiertos por defecto?"
      : "¿Cerrar TODOS los meses por defecto? Solo se podrá reservar en los meses que abras y en los días que desbloquees.";
    if (!confirm(msg)) return;
    CLOSED_DEFAULT = !CLOSED_DEFAULT;
    saveLockState();
  };

  document.getElementById("adminSchedulePrev").onclick = () => { curr.setMonth(curr.getMonth()-1); renderScheduleCal(); refreshLockUI(); };
  document.getElementById("adminScheduleNext").onclick = () => { curr.setMonth(curr.getMonth()+1); renderScheduleCal(); refreshLockUI(); };
  renderScheduleCal();
  selectDay(new Date());
};

const openAdminPanel = () => {
  // Forzar reinyección si falta el campo de horarios (por actualizaciones de código)
  if(adminOverlay && !document.getElementById("adminWorkSlots")) {
    adminOverlay.remove();
    adminOverlay = null;
  }
  if(!adminOverlay) injectAdminUI();
  adminOverlay.style.display = "flex";
  document.getElementById("adminWaNumber").value = WHATSAPP_NUMBER;
  document.getElementById("adminMpLink").value = BANK_ALIAS;
  
  const currentWorkStudio = document.getElementById("adminWorkSlotStudio").value;
  document.getElementById("adminWorkSlots").value = (WORK_SLOTS[currentWorkStudio] || []).join(", ");
  
  if(isCloudEnabled()) {
    document.getElementById("adminSupabaseUrl").value = SUPABASE_URL;
    document.getElementById("adminSupabaseKey").value = SUPABASE_KEY;
  }
  
  // Sincronizar antes de mostrar la tabla para ver los turnos más recientes
  syncWithCloud().then(() => {
    renderAdminBookings();
  });
};

let adminTimer = null;
window.addEventListener("keydown", (e) => {
  if(e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  
  clearTimeout(adminTimer);
  adminCommandString += e.key.toLowerCase();
  
  if(adminCommandString.includes("miriadmin")) { 
    openAdminPanel(); 
    adminCommandString = ""; 
  }
  
  // Si no se escribe nada en 2 segundos, resetear el comando
  adminTimer = setTimeout(() => { adminCommandString = ""; }, 2000);
  
  if(adminCommandString.length > 20) adminCommandString = "";
});

const brandLogo = document.querySelector(".brand");
if(brandLogo) {
  let c = 0; brandLogo.onclick = (e) => { c++; if(c>=5) { e.preventDefault(); openAdminPanel(); c=0; } setTimeout(() => c=0, 3000); };
}

const currentPage = document.body.dataset.page;

const revealElements = document.querySelectorAll(".reveal");
if(revealElements.length) {
  const obs = new IntersectionObserver((es) => { es.forEach(e => { if(e.isIntersecting) { e.target.classList.add("is-visible"); obs.unobserve(e.target); } }); }, { threshold: 0.15 });
  revealElements.forEach(el => obs.observe(el));
}

// Slider (Testimonios)
const sliderTrack = document.querySelector(".testimonials-track");
const sliderBtns = document.querySelectorAll(".slider-button");
if(sliderTrack && sliderBtns.length) {
  let slide = 0;
  const update = () => {
    const cards = Array.from(sliderTrack.children);
    const perView = window.innerWidth <= 860 ? 1 : (window.innerWidth <= 1120 ? 2 : 3);
    const max = Math.max(cards.length - perView, 0);
    if(slide > max) slide = max;
    const w = cards[0]?.getBoundingClientRect().width || 0;
    sliderTrack.style.transform = `translateX(-${slide * (w + 16)}px)`;
  };
  sliderBtns.forEach(b => b.onclick = () => {
    const cards = Array.from(sliderTrack.children);
    const perView = window.innerWidth <= 860 ? 1 : (window.innerWidth <= 1120 ? 2 : 3);
    const max = Math.max(cards.length - perView, 0);
    if(b.dataset.direction === "next") slide = slide >= max ? 0 : slide + 1;
    else slide = slide <= 0 ? max : slide - 1;
    update();
  });
  window.onresize = update;
}

// --- Calendario de Reservas ---
if(currentPage === "reservar") {
  const grid = document.getElementById("calendarGrid");
  const monthEl = document.getElementById("currentMonth");
  const slotsGrid = document.getElementById("slotsGrid");
  let curr = new Date(); let selD = null; let selT = null; let selStudio = null;
  // Usar WORK_SLOTS dinámicos
  // const slots = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

  // Manejo de Selección de Estudio
  document.querySelectorAll(".studio-button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".studio-button").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selStudio = btn.dataset.studio;
      document.getElementById("bookingCalendar").style.display = "block";
      renderCal();
    };
  });

  const renderCal = () => {
    grid.innerHTML = ""; monthEl.textContent = new Intl.DateTimeFormat("es-ES", {month:"long", year:"numeric"}).format(curr);
    ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].forEach(d => { const h = document.createElement("div"); h.className="calendar-day-head"; h.textContent=d; grid.appendChild(h); });
    
    const bookedDays = JSON.parse(localStorage.getItem("bookedSlots") || "{}");
    const first = new Date(curr.getFullYear(), curr.getMonth(), 1).getDay();
    const last = new Date(curr.getFullYear(), curr.getMonth() + 1, 0).getDate();
    
    for(let i=0; i<first; i++) grid.appendChild(document.createElement("div")).className="calendar-day empty";
    
    const today = new Date(); today.setHours(0,0,0,0);
    for(let i=1; i<=last; i++) {
      const d = document.createElement("div"); d.className="calendar-day"; d.textContent=i;
      const dObj = new Date(curr.getFullYear(), curr.getMonth(), i);
      d.dataset.dow = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][dObj.getDay()];
      const dStr = formatDate(dObj);
      const normD = normalizeDateStr(dStr);
      
      // Indicadores Visuales
      const bookingsForDay = bookedDays[normD] || [];
      if(bookingsForDay.length > 0) {
        const indicator = document.createElement("div");
        indicator.className = "day-indicator";
        const hasMonserrat = bookingsForDay.some(b => {
          const studio = typeof b === 'string' ? "Monserrat" : (b.studio || "Monserrat");
          return isSameStudio(studio, "Monserrat");
        });
        const hasJose = bookingsForDay.some(b => {
          const studio = typeof b === 'object' ? b.studio : null;
          return isSameStudio(studio, "José Marmol");
        });
        if(hasMonserrat) indicator.innerHTML += '<span class="dot-indicator monserrat"></span>';
        if(hasJose) indicator.innerHTML += '<span class="dot-indicator jose-marmol"></span>';
        d.appendChild(indicator);
      }

      const isSunday = dObj.getDay() === 0;
      if(dObj < today || isSunday) d.classList.add("disabled");
      else if(isDayLocked(dObj)) { d.classList.add("disabled", "locked"); d.title = "Día no disponible"; }
      else {
        if(dObj.getTime()===today.getTime()) d.classList.add("today");
        if(selD && dObj.toDateString()===selD.toDateString()) d.classList.add("selected");
        d.onclick = () => { 
          selD = dObj; selT = null; 
          document.getElementById("bookingSummary").style.display="none"; 
          document.getElementById("selectedDateText").textContent=dStr; 
          document.getElementById("slotsContainer").style.display="block"; 
          renderCal(); 
        };
      }
      grid.appendChild(d);
    }
    // La tira de días se desplaza horizontalmente: llevar el día elegido (o hoy) al centro
    const focusEl = grid.querySelector(".calendar-day.selected") || grid.querySelector(".calendar-day.today") || grid.querySelector(".calendar-day:not(.disabled):not(.empty)");
    if (focusEl && grid.scrollWidth > grid.clientWidth) grid.scrollLeft = focusEl.offsetLeft - (grid.clientWidth - focusEl.offsetWidth) / 2;
    // Refrescar slots si ya hay un día seleccionado
    if (selD && selStudio) {
      renderSlots(formatDate(selD));
    }
  };

  const renderSlots = (dStr) => {
    slotsGrid.innerHTML = ""; 
    const normD = normalizeDateStr(dStr);
    const allBooked = JSON.parse(localStorage.getItem("bookedSlots") || "{}")[normD] || [];
    
    // Priorizar horarios específicos por fecha y estudio
    let daySlots = WORK_SLOTS[selStudio] || DEFAULT_SLOTS;
    const custom = CUSTOM_WORK_DAYS[normD];
    if (custom) {
      if (Array.isArray(custom)) {
        // Compatibilidad con formato antiguo
        daySlots = custom;
      } else if (custom[selStudio]) {
        daySlots = custom[selStudio];
      }
    }
    
    const [sd, sm, sy] = normD.split("/").map(Number);
    if (isDayLocked(new Date(sy, sm - 1, sd))) {
      const msg = document.createElement("p");
      msg.textContent = "No hay horarios disponibles para este día.";
      slotsGrid.appendChild(msg);
      document.getElementById("bookingSummary").style.display = "none";
      return;
    }

    // Días cerrados: el admin los marca con textos como "Sin horarios" / "sin turnos"; no deben ser reservables
    if (!daySlots.length || daySlots.some(s => /^\s*sin\b/i.test(s))) {
      const msg = document.createElement("p");
      msg.textContent = "No hay horarios disponibles para este día.";
      slotsGrid.appendChild(msg);
      document.getElementById("bookingSummary").style.display = "none";
      return;
    }

    daySlots.forEach(t => {
      const b = document.createElement("button"); b.className="slot-button"; b.textContent=t;
      
      // Verificar si el slot está ocupado para el estudio seleccionado
      const isBooked = allBooked.some(booking => {
        const bTime = typeof booking === 'string' ? booking : booking.time;
        const bStudio = typeof booking === 'string' ? "Monserrat" : (booking.studio || "Monserrat");
        return bTime === t && isSameStudio(bStudio, selStudio);
      });

      if(isBooked) { b.classList.add("booked"); b.disabled=true; }
      else {
        if(selT===t) b.classList.add("selected");
        b.onclick = () => { 
          selT=t; 
          document.getElementById("summaryDate").textContent=dStr; 
          document.getElementById("summaryTime").textContent=t; 
          document.getElementById("bookingSummary").style.display="block"; 
          slotsGrid.querySelectorAll(".slot-button").forEach(btn => btn.classList.toggle("selected", btn.textContent===t)); 
        };
      }
      slotsGrid.appendChild(b);
    });
  };

  window.__miriRenderCal = renderCal;

  // Arrastrar la tira de días con el mouse (en pantallas táctiles ya se desliza con el dedo)
  let dragStartX = 0, dragStartScroll = 0, dragMoved = false, dragging = false;
  grid.addEventListener("mousedown", (e) => { dragging = true; dragMoved = false; dragStartX = e.pageX; dragStartScroll = grid.scrollLeft; });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.pageX - dragStartX;
    if (Math.abs(dx) > 5) { dragMoved = true; grid.classList.add("dragging"); }
    if (dragMoved) grid.scrollLeft = dragStartScroll - dx;
  });
  window.addEventListener("mouseup", () => { dragging = false; setTimeout(() => grid.classList.remove("dragging"), 0); });
  grid.addEventListener("click", (e) => { if (dragMoved) { e.stopPropagation(); e.preventDefault(); dragMoved = false; } }, true);

  document.getElementById("prevMonth").onclick = () => { curr.setMonth(curr.getMonth()-1); renderCal(); };
  document.getElementById("nextMonth").onclick = () => { curr.setMonth(curr.getMonth()+1); renderCal(); };
  document.getElementById("confirmBooking").onclick = async () => {
    const nameInput = document.getElementById("clientName");
    const name = nameInput.value.trim();
    const urlParams = new URLSearchParams(window.location.search);
    const selectedService = urlParams.get('servicio') || "extensiones de pestañas";
    
    // Validación de formulario
    if (!name) {
      nameInput.classList.add("error");
      if (!nameInput.nextElementSibling || !nameInput.nextElementSibling.classList.contains("error-message")) {
        const err = document.createElement("span");
        err.className = "error-message";
        err.textContent = "Por favor, ingresá tu nombre.";
        nameInput.parentNode.appendChild(err);
      }
      return;
    }
    nameInput.classList.remove("error");
    if (nameInput.nextElementSibling && nameInput.nextElementSibling.classList.contains("error-message")) {
      nameInput.nextElementSibling.remove();
    }

    if(!selD || !selT || !selStudio) return; 
    const dStr = formatDate(selD);
    
    // Re-verificar disponibilidad justo antes de reservar para evitar colisiones
    const b = JSON.parse(localStorage.getItem("bookedSlots") || "{}"); if(!b[dStr]) b[dStr] = [];
    const alreadyBooked = b[dStr].some(booking => {
      const bTime = typeof booking === 'string' ? booking : booking.time;
      const bStudio = typeof booking === 'string' ? "Monserrat" : (booking.studio || "Monserrat");
      return bTime === selT && isSameStudio(bStudio, selStudio);
    });

    if(alreadyBooked) {
      alert("Lo sentimos, este turno acaba de ser reservado. Por favor, selecciona otro horario.");
      if (window.__miriRenderCal) window.__miriRenderCal();
      return;
    }

    // Bloqueo temporal para evitar clics múltiples
    const btn = document.getElementById("confirmBooking");
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Procesando...";

    // Datos frescos de horarios/bloqueos: Miri pudo cerrar el día mientras la clienta completaba el formulario
    if(isCloudEnabled()) await syncScheduleFromCloud();
    if (isDayLocked(selD)) {
      alert("Este día ya no está disponible. Por favor, elegí otra fecha.");
      btn.disabled = false;
      btn.textContent = oldText;
      selD = null; selT = null;
      document.getElementById("slotsContainer").style.display = "none";
      document.getElementById("bookingSummary").style.display = "none";
      if (window.__miriRenderCal) window.__miriRenderCal();
      return;
    }

    // Verificación en la nube: evita pisar un turno que otra persona reservó desde otro dispositivo
    if(isCloudEnabled()) {
      const cloudId = getBookingCloudId(normalizeDateStr(dStr), selT, selStudio);
      const existing = await cloudFetch("bookings", `select=id&id=eq.${encodeURIComponent(cloudId)}`);
      if (existing && existing.length > 0) {
        alert("Lo sentimos, este turno acaba de ser reservado. Por favor, selecciona otro horario.");
        btn.disabled = false;
        btn.textContent = oldText;
        await syncBookingsFromCloud();
        return;
      }
    }

    // 1. Guardado Local
    const createdAt = new Date().toISOString();
    b[dStr].push({time: selT, studio: selStudio, name: name, service: selectedService, created_at: createdAt}); 
    localStorage.setItem("bookedSlots", JSON.stringify(b)); 
    if (window.__miriRenderCal) window.__miriRenderCal();

    // 2. Guardado en la Nube (BLOQUEO CRÍTICO)
    if(isCloudEnabled()) {
      // Normalizamos el ID para que sea idéntico en todos los dispositivos
      const normD = normalizeDateStr(dStr);
      const safeId = getBookingCloudId(normD, selT, selStudio);
      upsertPendingCloudBooking({
        id: safeId,
        date: normD,
        time: selT,
        studio: selStudio,
        name: name,
        service: selectedService,
        created_at: createdAt
      });
      
      const success = await cloudUpsert("bookings", {
        id: safeId,
        date: normD,
        time: selT,
        service: encodeBookingCloudMeta(selectedService, selStudio, name)
      });
      
      if (!success) {
        // Silencioso para clientes: solo notificamos si estamos en modo admin (MiriAdmin abierta)
        const isAdminPanelOpen = adminOverlay && adminOverlay.style.display === "flex";
        if (isAdminPanelOpen) {
          alert("Error de sincronización con la nube (Supabase). El turno se guardó localmente pero no en la base de datos central.");
        }
        // No bloqueamos al cliente, procedemos al pago de todas formas (el turno ya está en el localBookings)
      } else {
        removePendingCloudBooking(safeId);
      }
    }

    // --- Flujo de Redirección ---
    const waText = encodeURIComponent(`¡Hola! Quiero confirmar mi turno para ${selectedService} en ${selStudio}: ${dStr} a las ${selT} a nombre de ${name}.\n\nAqui adjunto el comprobante.`);
    const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${waText}`;

    // Cambiar estado visual antes de la redirección
    btn.textContent = "¡Listo! Abriendo WhatsApp...";
    
    // Pequeño delay para asegurar que el guardado se procese
    setTimeout(() => {
      window.location.href = waUrl;
    }, 600);
  };
  renderCal();
}

// --- Gestión de Redirección Post-Pago (WhatsApp) ---
const checkPendingWA = () => {
  const pendingWA = sessionStorage.getItem("pendingWA");
  if (pendingWA) {
    sessionStorage.removeItem("pendingWA");
    
    // Feedback visual para el usuario
    const overlay = document.createElement("div");
    overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.95);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;text-align:center;padding:2rem;";
    overlay.innerHTML = `
      <div style="font-size:1.5rem;color:#d4af37;margin-bottom:1rem;font-weight:bold;">¡Turno Agendado!</div>
      <p style="margin-bottom:1rem;color:#333;">Para confirmar los detalles finales, abrí WhatsApp.</p>
      <button id="openWhatsAppBtn" class="button button-primary" style="min-height:44px; padding:0.8rem 1.2rem; margin-bottom:0.75rem;">Abrir WhatsApp</button>
      <a href="${pendingWA}" target="_blank" rel="noopener noreferrer" style="color:#4a5568; text-decoration:underline; font-size:0.95rem;">Si no se abre, tocá acá</a>
      <div class="loader-simple" aria-hidden="true" style="margin-top:1.25rem;width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #d4af37;border-radius:50%;animation:spin 1s linear infinite;"></div>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(overlay);

    const btn = overlay.querySelector("#openWhatsAppBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        // En click (gesto del usuario) los navegadores suelen permitir abrir WhatsApp sin bloquear.
        window.location.href = pendingWA;
      });
    }

    // Intento automático (puede fallar por políticas del navegador); el botón queda como fallback confiable.
    setTimeout(() => {
      try {
        window.location.href = pendingWA;
      } catch (e) {
        // No hacemos nada: el usuario tiene el botón/link visible.
      }
    }, 800);
  }
};

// Ejecutar en múltiples eventos para asegurar que se dispare al volver de MP
window.addEventListener('load', checkPendingWA);
if (document.readyState === 'complete') checkPendingWA();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkPendingWA();
});

// --- Edición y Sincronización ---
const enableVisualEditing = () => {
  document.body.classList.add('editing-mode');
  const bar = document.createElement('div'); bar.className='admin-alert';
  bar.innerHTML = `<span>MODO EDICIÓN</span><button id="adminSaveVisual">Guardar</button><button onclick="location.reload()">Salir</button>`;
  document.body.appendChild(bar);
  
  // Textos editables
  document.querySelectorAll('p, h1, h2, h3, span, strong, small, figcaption, .eyebrow, .button:not([href]), .service-card h3, .service-price, .price-list p, .price-list strong').forEach(el => { 
    if(!el.closest('.admin-overlay') && !el.closest('.admin-alert') && !el.closest('.calendar-grid') && !el.closest('.tabbar') && !el.closest('.nav') && !el.classList.contains('menu-toggle')) {
      el.contentEditable = "true";
      el.setAttribute('spellcheck', 'false');
    }
  });

  // Imágenes editables
  document.querySelectorAll('img, .collage-item, .gallery-item, .hero, .page-hero').forEach(el => {
    if (el.closest('.admin-overlay') || el.closest('.nav')) return;
    el.classList.add('editable-img');
    el.onclick = (e) => {
      if (e.target !== el && e.target.contentEditable === "true") return;
      e.preventDefault();
      
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      
      input.onchange = (ev) => {
        const file = ev.target.files[0];
        if (!file) return;

        // Comprimir imagen para que no pese tanto en la base de datos
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const MAX_SIZE = 1600; // Alta definición (antes 800px, se veía pixelado)
            if (width > height) {
              if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
            } else {
              if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
            }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convertir a texto (Base64) para guardar en Supabase
            const base64 = canvas.toDataURL('image/jpeg', 0.82);
            if (el.tagName === 'IMG') el.src = base64;
            else el.style.backgroundImage = `url("${base64}")`;
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      };
      input.click();
    };
  });

  document.getElementById('adminSaveVisual').onclick = async () => { 
    await saveAllChanges(); 
    location.reload(); 
  };
};

const saveAllChanges = async () => {
  const pId = currentPage || 'global'; const changes = { texts: {}, images: {} };
  
  // Guardar textos
  document.querySelectorAll('[contenteditable="true"]').forEach(el => { 
    // Limpiar el HTML antes de guardar para evitar que se guarden atributos de edición
    let htmlToSave = el.innerHTML.trim().replace(/contenteditable="true"/g, '').replace(/contenteditable="false"/g, '');
    changes.texts[getElementPath(el)] = htmlToSave; 
  });

  // Guardar imágenes
  document.querySelectorAll('.editable-img').forEach(el => {
    const path = getElementPath(el);
    let src = "";
    if (el.tagName === 'IMG') {
      src = el.src;
    } else {
      // Intentar obtener la imagen desde style.backgroundImage (que es donde el editor la pone)
      const bgStyle = el.style.backgroundImage;
      const match = bgStyle.match(/url\(["']?(.*?)["']?\)/);
      if (match) {
        src = match[1];
      }
    }
    // Solo guardamos si es una imagen nueva (Base64)
    if (src && src.startsWith('data:image')) { 
      changes.images[path] = src;
    }
  });

  console.log("Guardando cambios para:", pId, changes);
  setPageChanges(pId, changes);
  if(isCloudEnabled()) {
    const res = await cloudUpsert("page_changes", {id:pId, data:changes});
    if(res) alert("¡Cambios guardados con éxito en la nube!");
    else alert("Error al guardar en la nube, se guardó localmente.");
  } else {
    alert("Guardado localmente (Nube no configurada).");
  }
};

const applySavedChanges = () => {
  // Actualizar número de WhatsApp en la UI si existe el elemento
  const displayNum = document.getElementById("display-number");
  if (displayNum) displayNum.textContent = `+${WHATSAPP_NUMBER}`;

  const isEditing = document.body.classList.contains('editing-mode');
  const d = getPageChanges(currentPage || 'global');
  if(!d) return;
  
  if (d.texts) Object.keys(d.texts).forEach(p => { 
    const el = document.querySelector(p); 
    
    // NO sobrescribir elementos dinámicos críticos
    if (el && (
      el.id === 'selectedDateText' || 
      el.id === 'summaryDate' || 
      el.id === 'summaryTime' || 
      el.id === 'currentMonth' ||
      el.id === 'clientName' ||
      el.closest('#slotsContainer') ||
      el.closest('#bookingSummary') ||
      el.classList.contains('studio-button') || 
      el.closest('.studio-selector') || 
      el.classList.contains('calendar-day')
    )) {
      if (!isEditing) return;
    }

    // Permitir editar textos de servicios incluso si son botones
    const isServiceText = el && (el.classList.contains('service-price') || (el.parentElement && el.parentElement.classList.contains('service-card') && el.tagName === 'H3') || el.closest('.price-list'));
    
    if (el && !el.classList.contains('menu-toggle') && (!el.classList.contains('button') || isServiceText) && d.texts[p] !== undefined && d.texts[p] !== null) {
      let cleanHtml = d.texts[p].replace(/contenteditable="true"/g, '').replace(/contenteditable="false"/g, '');
      if (el.innerHTML !== cleanHtml) el.innerHTML = cleanHtml; 
      if (!isEditing) el.contentEditable = "false";
    }
  });
  if (d.images) Object.keys(d.images).forEach(p => { 
    const el = document.querySelector(p); 
    if (el) {
      let src = d.images[p];
      if (typeof src === 'object' && src !== null && src.src) src = src.src;
      if (typeof src === 'string') {
        if (el.tagName === 'IMG') {
          if (el.src !== src) el.src = src;
        } else {
          const url = `url("${src}")`;
          if (el.style.backgroundImage !== url) el.style.backgroundImage = url;
        }
      }
    }
  });
};

const syncBookingsFromCloud = async () => {
  const d = await cloudFetch("bookings");
  if (!d) return false;
  console.log(`Sincronizando ${d.length} turnos desde la nube...`);
  const pendingCloudBookings = loadPendingCloudBookings();
  const cloudBookings = {};

  d.forEach(b => {
    const normalizedDate = normalizeDateStr(b.date);
    const cloudMeta = decodeBookingCloudMeta(b.service, b.id);
    if (!cloudBookings[normalizedDate]) cloudBookings[normalizedDate] = [];
    cloudBookings[normalizedDate].push({
      time: b.time,
      studio: cloudMeta.studio,
      name: cloudMeta.name,
      service: cloudMeta.service,
      created_at: cloudMeta.created_at
    });
  });

  // La nube es la fuente principal; solo mantenemos pendientes locales que aún no sincronizaron
  const mergedBookings = { ...cloudBookings };
  pendingCloudBookings.forEach(pending => {
    const pendingDate = normalizeDateStr(pending.date);
    if (!mergedBookings[pendingDate]) mergedBookings[pendingDate] = [];
    const alreadyInMerged = mergedBookings[pendingDate].some(item =>
      item.time === pending.time && isSameStudio(item.studio, pending.studio)
    );
    if (!alreadyInMerged) {
      mergedBookings[pendingDate].push({
        time: pending.time,
        studio: pending.studio,
        name: pending.name || "-",
        service: pending.service || null,
        created_at: pending.created_at || null
      });
    }
  });

  localStorage.setItem("bookedSlots", JSON.stringify(mergedBookings));
  if (currentPage === "reservar" && window.__miriRenderCal) window.__miriRenderCal();
  if (adminOverlay && adminOverlay.style.display === "flex") renderAdminBookings();
  return true;
};

const syncConfigFromCloud = async () => {
  const d = await cloudFetch("config");
  if (!(d && d[0])) return false;
  localStorage.setItem("miri_wa_number", d[0].wa);
  localStorage.setItem("miri_mp_link", d[0].mp);
  WHATSAPP_NUMBER = d[0].wa;
  BANK_ALIAS = d[0].mp;
  const displayNum = document.getElementById("display-number");
  if (displayNum) displayNum.textContent = `+${WHATSAPP_NUMBER}`;
  return true;
};

// Solo baja las filas que necesita la página (antes bajaba TODAS, ~950 KB con imágenes, y por eso tardaba ~3 seg).
// Solo la fila de horarios/bloqueos (liviana): para que los desbloqueos de Miri se vean sin recargar
const syncScheduleFromCloud = async () => {
  const d = await cloudFetch("page_changes", "select=*&id=eq.schedule");
  if (!(d && d[0])) return false;
  applyScheduleData(d[0].data);
  if (currentPage === "reservar" && window.__miriRenderCal) window.__miriRenderCal();
  return true;
};

const syncPageChangesFromCloud = async (all = false) => {
  const ids = [...new Set([currentPage || "global", "global", "schedule"])];
  const d = await cloudFetch("page_changes", all ? "select=*" : `select=*&id=in.(${ids.join(",")})`);
  if (!d) return false;
  d.forEach(i => {
    if (i.id === "schedule") {
      applyScheduleData(i.data);
      return;
    }
    setPageChanges(i.id, i.data);
  });
  return true;
};

// Devuelve true si la nube respondió con los datos de la página. `timeout` (ms) limita cuánto se espera.
const syncWithCloud = async (manual = false, { timeout = 0, all = false } = {}) => {
  if (!isCloudEnabled()) {
    if (manual) alert("La nube no está configurada.");
    return false;
  }
  const needsBookings = currentPage === "reservar" || (adminOverlay && adminOverlay.style.display === "flex");
  const work = Promise.all([
    syncPageChangesFromCloud(all || manual),
    syncConfigFromCloud(),
    needsBookings ? syncBookingsFromCloud() : Promise.resolve(true)
  ]);
  const results = timeout ? await withTimeout(work, timeout) : await work;
  if (!results) return false;

  applySavedChanges();
  if (currentPage === "reservar" && window.__miriRenderCal) window.__miriRenderCal();
  if (manual) alert("Sincronización completada");
  return results[0];
};

const startCloudSyncPolling = () => {
  if (currentPage !== "reservar" || !isCloudEnabled() || cloudSyncIntervalId) return;
  // Solo turnos (liviano) y solo con la pestaña visible, para reflejar reservas de otros dispositivos
  cloudSyncIntervalId = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    syncBookingsFromCloud();
    syncScheduleFromCloud();
  }, 8000);
};

const parseBookingDate = (d) => { const [dd, mm, yy] = d.split("/").map(Number); return new Date(yy, mm - 1, dd); };
const DOW_LONG = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const renderAdminBookings = () => {
  const list = document.getElementById("adminBookingsTable"); if(!list) return;
  const b = JSON.parse(localStorage.getItem("bookedSlots") || "{}");
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Aplanar y normalizar
  const all = [];
  Object.keys(b).forEach(d => {
    (b[d] || []).filter(x => x !== null && x !== undefined).forEach(booking => {
      const isObj = typeof booking === "object";
      all.push({
        d,
        date: parseBookingDate(d),
        time: isObj ? booking.time : booking,
        studio: isObj ? (booking.studio || "Monserrat") : "Monserrat",
        name: isObj ? (booking.name || "-") : "-",
        service: isObj ? (booking.service || "") : "",
        createdAt: isObj ? (booking.created_at || null) : null
      });
    });
  });

  const upcoming = all.filter(x => x.date >= today);
  const todayCount = all.filter(x => x.date.getTime() === today.getTime()).length;

  const stats = document.getElementById("adminStats");
  if (stats) stats.innerHTML = `
    <div class="admin-stat"><strong>${todayCount}</strong><span>Hoy</span></div>
    <div class="admin-stat"><strong>${upcoming.length}</strong><span>Próximos</span></div>
    <div class="admin-stat"><strong>${all.length}</strong><span>En total</span></div>`;
  document.getElementById("adminFilterUpcoming")?.classList.toggle("active", adminBookingFilter === "upcoming");
  document.getElementById("adminFilterAll")?.classList.toggle("active", adminBookingFilter === "all");

  const rows = (adminBookingFilter === "upcoming" ? upcoming : all)
    .sort((x, y) => adminBookingFilter === "upcoming"
      ? (x.date - y.date) || String(x.time).localeCompare(String(y.time))
      : (y.date - x.date) || String(x.time).localeCompare(String(y.time)));

  list.innerHTML = "";
  if (!rows.length) {
    list.innerHTML = `<div class="admin-empty">${adminBookingFilter === "upcoming" ? "No hay turnos próximos." : "Todavía no hay turnos."}</div>`;
    return;
  }

  let lastDay = "";
  rows.forEach(r => {
    if (r.d !== lastDay) {
      lastDay = r.d;
      const isToday = r.date.getTime() === today.getTime();
      const head = document.createElement("div");
      head.className = "admin-day-head";
      head.textContent = `${isToday ? "Hoy · " : ""}${DOW_LONG[r.date.getDay()]} ${r.d}`;
      list.appendChild(head);
    }
    let created = "";
    if (r.createdAt) {
      const c = new Date(r.createdAt);
      created = `Reservó el ${c.getDate()}/${c.getMonth() + 1} a las ${c.getHours()}:${String(c.getMinutes()).padStart(2, "0")}`;
    }
    const studioClass = isSameStudio(r.studio, "Monserrat") ? "monserrat" : "jose-marmol";
    const card = document.createElement("div");
    card.className = "admin-booking";
    card.innerHTML = `
      <div class="admin-booking-time">${escapeHtml(r.time)}</div>
      <div class="admin-booking-info">
        <strong>${escapeHtml(r.name)}</strong>
        <span>${r.service ? escapeHtml(r.service) + " · " : ""}<em class="studio-tag ${studioClass}">${escapeHtml(r.studio)}</em></span>
        ${created ? `<small>${escapeHtml(created)}</small>` : ""}
      </div>
      <button class="button-release" type="button">Liberar</button>`;
    card.querySelector(".button-release").addEventListener("click", () => {
      if (confirm(`¿Liberar el turno de ${r.name === "-" ? "este horario" : r.name} (${r.d} ${r.time})? Quedará disponible para reservar.`)) window.releaseSlot(r.d, r.time, r.studio);
    });
    list.appendChild(card);
  });
};

window.releaseSlot = (d, t, s) => {
  const b = JSON.parse(localStorage.getItem("bookedSlots") || "{}");
  if(b[d]) {
    b[d] = b[d].filter(booking => {
      const bTime = typeof booking === 'string' ? booking : booking.time;
      const bStudio = typeof booking === 'string' ? "Monserrat" : (booking.studio || "Monserrat");
      return !(bTime === t && isSameStudio(bStudio, s));
    }); 
    localStorage.setItem("bookedSlots", JSON.stringify(b));
    removePendingCloudBooking(getBookingCloudId(d, t, s));
    if(isCloudEnabled()) {
      const safeId = getBookingCloudId(d, t, s);
      cloudDelete("bookings", safeId);
    }
    renderAdminBookings();
  }
};

document.addEventListener('DOMContentLoaded', async () => { 
  // --- Lógica del Menú Mobile ---
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.header'); // Usamos el header para el estado nav-active
  
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      const isOpen = document.body.classList.toggle('nav-active');
      menuToggle.setAttribute('aria-expanded', isOpen);
    });
  }

  // Cerrar menú al hacer clic en un link
  document.querySelectorAll('.nav a').forEach(link => {
    link.addEventListener('click', () => {
      document.body.classList.remove('nav-active');
      if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
    });
  });

  // --- Navegación activa + barra inferior estilo app (móvil) ---
  const TAB_ICONS = {
    inicio: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    servicios: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    galeria: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
    opiniones: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/>',
    contacto: '<path d="M4 5h16v11H9l-5 4z"/>',
    reservar: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>'
  };
  const navLinks = [...document.querySelectorAll('.nav > a')];
  navLinks.forEach(a => {
    const key = a.dataset.nav || (a.getAttribute('href') || '').replace('.html', '');
    const page = key === 'index' ? 'inicio' : key;
    if (page === currentPage || (currentPage === 'inicio' && key === 'index')) a.classList.add('active');
  });
  if (navLinks.length && !document.querySelector('.tabbar')) {
    const tabbar = document.createElement('nav');
    tabbar.className = 'tabbar';
    tabbar.setAttribute('aria-label', 'Navegación principal');
    navLinks.forEach(a => {
      const isCta = a.classList.contains('button');
      const key = isCta ? 'reservar' : (a.dataset.nav || 'inicio');
      const label = a.textContent.trim().split(' ')[0];
      const tab = document.createElement('a');
      tab.href = a.getAttribute('href');
      if (isCta) tab.classList.add('tab-cta');
      if (a.classList.contains('active') || (isCta && currentPage === 'reservar')) tab.classList.add('active');
      tab.innerHTML = `<span class="tab-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${TAB_ICONS[key] || TAB_ICONS.inicio}</svg></span><span class="tab-label">${escapeHtml(label)}</span>`;
      tabbar.appendChild(tab);
    });
    document.body.appendChild(tabbar);
  }

  // --- Botón de Admin en Móvil (Footer) ---
  const footerBottom = document.querySelector('.footer-bottom');
  if (footerBottom) {
    const adminBtn = document.createElement('button');
    adminBtn.innerHTML = '⚙️';
    adminBtn.style = 'position:fixed; bottom:10px; right:10px; width:50px; height:50px; background:transparent; border:0; z-index:9999; cursor:default; opacity:0;';
    adminBtn.onclick = () => {
      let c = parseInt(adminBtn.dataset.clicks || '0') + 1;
      adminBtn.dataset.clicks = c;
      if (c >= 5) {
        openAdminPanel();
        adminBtn.dataset.clicks = '0';
      }
      setTimeout(() => { adminBtn.dataset.clicks = '0'; }, 3000);
    };
    document.body.appendChild(adminBtn);
  }

  // Asegurar que nada sea editable al cargar la página
  document.querySelectorAll('[contenteditable]').forEach(el => el.contentEditable = "false");
  
  // La página sigue oculta hasta tener los datos actuales: se pide a la nube (solo lo necesario) y,
  // si no responde en 2.5 seg, se usa el caché local (y el JSON como último respaldo).
  applySavedChanges();
  const cloudOk = await syncWithCloud(false, { timeout: 2500 });
  if (!cloudOk) {
    await loadInitialData();
    applySavedChanges();
    if (currentPage === "reservar" && window.__miriRenderCal) window.__miriRenderCal();
  }
  revealPage();
  startCloudSyncPolling();
  
  // Refrescar cuando el usuario vuelve a la pestaña (botón atrás o cambiar de app)
   window.addEventListener('pageshow', (event) => {
     if (currentPage === "reservar") {
       if (window.__miriRenderCal) window.__miriRenderCal();
       syncWithCloud();
       startCloudSyncPolling();
     }
   });
});
