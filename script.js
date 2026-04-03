let WHATSAPP_NUMBER = localStorage.getItem("miri_wa_number") || "5491144123280";
const DEFAULT_MESSAGE = "Hola, quiero reservar un turno para extensiones de pestañas";
let MERCADO_PAGO_LINK = localStorage.getItem("miri_mp_link") || "https://mpago.la/1iJbsQy";

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

// --- Configuración de Base de Datos (Supabase) ---
const CLOUD_URL = "https://hugbaugzsntojbotjblz.supabase.co"; 
const CLOUD_KEY = "sb_publishable_kBQ4L0lrcxnQNIasDakhBw_tmhkeNJs"; 

let SUPABASE_URL = localStorage.getItem("miri_supabase_url") || CLOUD_URL;
let SUPABASE_KEY = localStorage.getItem("miri_supabase_key") || CLOUD_KEY;

// Solo habilitamos la nube si la llave existe
const isCloudEnabled = () => SUPABASE_URL !== "" && SUPABASE_KEY !== "";

const cloudFetch = async (table) => {
  if (!isCloudEnabled()) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
    });
    return response.ok ? await response.json() : null;
  } catch (e) { return null; }
};

const cloudUpsert = async (table, data) => {
  if (!isCloudEnabled()) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
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
      const err = await response.json();
      console.error("Error en cloudUpsert:", err);
      return false;
    }
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

// --- MiriAdmin Panel ---
let adminCommandString = "";
let adminOverlay = null;

const injectAdminUI = () => {
  if (document.getElementById("adminOverlay")) return;
  const html = `
    <div class="admin-overlay" id="adminOverlay">
      <div class="admin-modal">
        <span class="admin-close" id="adminClose">&times;</span>
        <h2>MiriAdmin Panel</h2>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom: 2rem;">
          <button class="button button-secondary" id="adminJumpGeneral" style="min-height:44px; padding:0.6rem 1rem;">General</button>
          <button class="button button-secondary" id="adminJumpSchedule" style="min-height:44px; padding:0.6rem 1rem;">Horarios</button>
          <button class="button button-secondary" id="adminJumpBookings" style="min-height:44px; padding:0.6rem 1rem;">Turnos</button>
        </div>
        <div class="admin-section">
          <h3>Nube Automática (Supabase)</h3>
          <p style="font-size:0.85rem; color:#666; margin-bottom:10px;">Pega tu "Anon Public Key" (la que empieza con <b>eyJ</b>) para que todo se guarde solo.</p>
          <div class="admin-grid">
            <div class="admin-field"><label>URL</label><input type="text" id="adminSupabaseUrl"></div>
            <div class="admin-field"><label>Key (Anon Key)</label><input type="text" id="adminSupabaseKey"></div>
          </div>
          <button class="button button-primary" id="adminSaveCloudConfig" style="margin-top:10px; background:#4a5568;">Activar Nube</button>
        </div>
        <div class="admin-section">
          <h3>Configuración Manual</h3>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="button button-secondary" id="adminDownloadChanges" style="background:#d98aa7; color:white;">1. Descargar JSON</button>
            <button class="button button-secondary" id="adminSyncFromCloud" style="color:#d98aa7;">Sincronizar Nube</button>
            <button class="button" id="adminResetLocal" style="background:#e53e3e; color:white;">Borrar TODO</button>
          </div>
        </div>
        <div class="admin-section">
          <h3>Edición Visual</h3>
          <button class="button button-primary btn-save-all" id="adminEnableEdit">Activar Modo Edición</button>
        </div>
        <div class="admin-section" id="adminSectionGeneral">
          <h3>General</h3>
          <div class="admin-grid">
            <div class="admin-field"><label>WhatsApp</label><input type="text" id="adminWaNumber"></div>
            <div class="admin-field"><label>Link Pago</label><input type="text" id="adminMpLink"></div>
          </div>
          <button class="button button-primary btn-save-all" id="adminSaveConfig">Guardar</button>
        </div>
        <div class="admin-section" id="adminSectionSlots">
          <h3>Horarios de Trabajo (Generales)</h3>
          <p style="font-size:0.85rem; color:#666; margin-bottom:10px;">Escribe los horarios separados por coma (ej: 09:00, 10:30, 14:00).</p>
          <div class="admin-grid">
            <div class="admin-field">
              <label>Estudio</label>
              <select id="adminWorkSlotStudio">
                <option value="Monserrat">Monserrat</option>
                <option value="José Marmol">José Marmol</option>
              </select>
            </div>
            <div class="admin-field">
              <label>Horarios (coma)</label>
              <input type="text" id="adminWorkSlots" placeholder="09:00, 10:00, 11:00...">
            </div>
          </div>
          <button class="button button-primary" id="adminSaveSlots" style="margin-top:10px; background:#d98aa7;">Actualizar Horarios Generales</button>
        </div>
        <div class="admin-section">
          <h3>Horarios por Día (Calendario)</h3>
          <p style="font-size:0.85rem; color:#666; margin-bottom:10px;">Elegí un día en el calendario y definí sus horarios. Si dejás vacío, ese día usa los horarios generales.</p>
          <div class="calendar-wrapper" style="padding: 1.5rem; margin-bottom: 1.5rem;">
            <div class="calendar-header">
              <button id="adminSchedulePrev">&lt;</button>
              <h2 id="adminScheduleMonth">Mes Año</h2>
              <button id="adminScheduleNext">&gt;</button>
            </div>
            <div class="calendar-grid" id="adminScheduleGrid"></div>
          </div>
          <div class="admin-grid">
            <div class="admin-field">
              <label>Estudio</label>
              <select id="adminCustomSlotStudio">
                <option value="Monserrat">Monserrat</option>
                <option value="José Marmol">José Marmol</option>
              </select>
            </div>
            <div class="admin-field"><label>Fecha seleccionada</label><input type="date" id="adminCustomDate"></div>
            <div class="admin-field" style="grid-column: span 2;"><label>Horarios (coma)</label><input type="text" id="adminCustomSlots" placeholder="Ej: 10:00, 11:00, 12:30"></div>
          </div>
          <button class="button button-primary" id="adminSaveCustomDay" style="margin-top:10px; background:#4a5568;">Guardar Horarios del Día</button>
        </div>
        <div class="admin-section" id="adminSectionBookings">
          <h3>Turnos</h3>
          <div class="admin-table-wrapper"><table class="admin-table"><thead><tr><th>Fecha</th><th>Hora</th><th>Estudio</th><th>Cliente</th><th>Acción</th></tr></thead><tbody id="adminBookingsTable"></tbody></table></div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  adminOverlay = document.getElementById("adminOverlay");
  document.getElementById("adminClose").onclick = () => adminOverlay.style.display = "none";
  document.getElementById("adminJumpGeneral").onclick = () => document.getElementById("adminSectionGeneral")?.scrollIntoView({behavior: "smooth", block: "start"});
  document.getElementById("adminJumpSchedule").onclick = () => document.getElementById("adminSectionSlots")?.scrollIntoView({behavior: "smooth", block: "start"});
  document.getElementById("adminJumpBookings").onclick = () => document.getElementById("adminSectionBookings")?.scrollIntoView({behavior: "smooth", block: "start"});
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
    if(isCloudEnabled()) cloudUpsert("config", {id:1, wa:wa||WHATSAPP_NUMBER, mp:mp||MERCADO_PAGO_LINK}).then(() => location.reload());
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
        if(isCloudEnabled()) cloudUpsert("page_changes", {id:"schedule", data:{slots: WORK_SLOTS, custom_days: CUSTOM_WORK_DAYS}}).then(ok => {
          if(!ok) alert("No se pudo guardar en la nube. Quedó guardado localmente.");
          location.reload();
        });
        else location.reload();
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
    
    // Si CUSTOM_WORK_DAYS[dStr] es un array (formato antiguo), lo convertimos
    if(Array.isArray(newCustomDays[dStr])) {
      const oldSlots = newCustomDays[dStr];
      newCustomDays[dStr] = { "Monserrat": oldSlots, "José Marmol": [...DEFAULT_SLOTS] };
    }

    if(!rawSlots) {
      delete newCustomDays[dStr][studio];
      // Si no quedan estudios con horarios personalizados ese día, borramos el día
      if(Object.keys(newCustomDays[dStr]).length === 0) delete newCustomDays[dStr];
    } else {
      newCustomDays[dStr][studio] = rawSlots.split(",").map(s => s.trim()).filter(s => s !== "");
    }
    
    localStorage.setItem("miri_custom_days", JSON.stringify(newCustomDays));
    CUSTOM_WORK_DAYS = newCustomDays;
    if(isCloudEnabled()) cloudUpsert("page_changes", {id:"schedule", data:{slots: WORK_SLOTS, custom_days: CUSTOM_WORK_DAYS}}).then(ok => {
      if(!ok) alert("No se pudo guardar en la nube. Quedó guardado localmente.");
      location.reload();
    });
    else location.reload();
  };
  document.getElementById("adminDownloadChanges").onclick = () => {
    const data = { config: { wa: WHATSAPP_NUMBER, mp: MERCADO_PAGO_LINK }, bookings: JSON.parse(localStorage.getItem("bookedSlots") || "{}"), changes: {} };
    ['inicio', 'servicios', 'galeria', 'opiniones', 'contacto', 'reservar', 'global'].forEach(p => { const s = localStorage.getItem(`miri_changes_${p}`); if(s) data.changes[p] = JSON.parse(s); });
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:"application/json"})); a.download = "miri_data.json"; a.click();
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
  };

  document.getElementById("adminWorkSlotStudio").onchange = () => {
    const studio = document.getElementById("adminWorkSlotStudio").value;
    document.getElementById("adminWorkSlots").value = WORK_SLOTS[studio].join(", ");
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
      cell.onclick = () => selectDay(date);
      grid.appendChild(cell);
    }
  };

  document.getElementById("adminSchedulePrev").onclick = () => { curr.setMonth(curr.getMonth()-1); renderScheduleCal(); };
  document.getElementById("adminScheduleNext").onclick = () => { curr.setMonth(curr.getMonth()+1); renderScheduleCal(); };
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
  document.getElementById("adminMpLink").value = MERCADO_PAGO_LINK;
  
  const currentWorkStudio = document.getElementById("adminWorkSlotStudio").value;
  document.getElementById("adminWorkSlots").value = WORK_SLOTS[currentWorkStudio].join(", ");
  
  if(isCloudEnabled()) {
    document.getElementById("adminSupabaseUrl").value = SUPABASE_URL;
    document.getElementById("adminSupabaseKey").value = SUPABASE_KEY;
  }
  renderAdminBookings();
};

window.addEventListener("keydown", (e) => {
  if(e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  adminCommandString += e.key.toLowerCase();
  if(adminCommandString.includes("miriadmin")) { openAdminPanel(); adminCommandString = ""; }
  if(adminCommandString.length > 20) adminCommandString = "";
});

const brandLogo = document.querySelector(".brand");
if(brandLogo) {
  let c = 0; brandLogo.onclick = (e) => { c++; if(c>=5) { e.preventDefault(); openAdminPanel(); c=0; } setTimeout(() => c=0, 3000); };
}

// --- Lógica de UI (Menú, Reveal, Slider) ---
const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav");
const currentPage = document.body.dataset.page;

if(menuToggle && nav) {
  menuToggle.onclick = () => { const open = nav.classList.toggle("is-open"); menuToggle.classList.toggle("is-open", open); };
}

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
      if(selD) renderSlots(selD.toLocaleDateString("es-ES"));
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
      const dStr = dObj.toLocaleDateString("es-ES");
      
      // Indicadores Visuales
      const bookingsForDay = bookedDays[dStr] || [];
      if(bookingsForDay.length > 0) {
        const indicator = document.createElement("div");
        indicator.className = "day-indicator";
        const hasMonserrat = bookingsForDay.some(b => (typeof b === 'string' || b.studio === "Monserrat"));
        const hasJose = bookingsForDay.some(b => (typeof b === 'object' && b.studio === "José Marmol"));
        if(hasMonserrat) indicator.innerHTML += '<span class="dot-indicator monserrat"></span>';
        if(hasJose) indicator.innerHTML += '<span class="dot-indicator jose-marmol"></span>';
        d.appendChild(indicator);
      }

      if(dObj < today) d.classList.add("disabled");
      else {
        if(dObj.getTime()===today.getTime()) d.classList.add("today");
        if(selD && dObj.toDateString()===selD.toDateString()) d.classList.add("selected");
        d.onclick = () => { 
          selD = dObj; selT = null; 
          document.getElementById("bookingSummary").style.display="none"; 
          document.getElementById("selectedDateText").textContent=dStr; 
          document.getElementById("slotsContainer").style.display="block"; 
          renderCal(); 
          renderSlots(dStr); 
        };
      }
      grid.appendChild(d);
    }
  };

  const renderSlots = (dStr) => {
    slotsGrid.innerHTML = ""; 
    const allBooked = JSON.parse(localStorage.getItem("bookedSlots") || "{}")[dStr] || [];
    
    // Priorizar horarios específicos por fecha y estudio
    let daySlots = WORK_SLOTS[selStudio];
    const custom = CUSTOM_WORK_DAYS[dStr];
    if (custom) {
      if (Array.isArray(custom)) {
        // Compatibilidad con formato antiguo
        daySlots = custom;
      } else if (custom[selStudio]) {
        daySlots = custom[selStudio];
      }
    }
    
    daySlots.forEach(t => {
      const b = document.createElement("button"); b.className="slot-button"; b.textContent=t;
      
      // Verificar si el slot está ocupado para el estudio seleccionado
      const isBooked = allBooked.some(booking => {
        if (typeof booking === 'string') return booking === t && selStudio === "Monserrat";
        return booking.time === t && booking.studio === selStudio;
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

  document.getElementById("prevMonth").onclick = () => { curr.setMonth(curr.getMonth()-1); renderCal(); };
  document.getElementById("nextMonth").onclick = () => { curr.setMonth(curr.getMonth()+1); renderCal(); };
  document.getElementById("confirmBooking").onclick = () => {
    const nameInput = document.getElementById("clientName");
    const name = nameInput.value.trim();
    
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
    const dStr = selD.toLocaleDateString("es-ES");
    const b = JSON.parse(localStorage.getItem("bookedSlots") || "{}"); if(!b[dStr]) b[dStr] = [];
    
    const alreadyBooked = b[dStr].some(booking => {
      if (typeof booking === 'string') return booking === selT && selStudio === "Monserrat";
      return booking.time === selT && booking.studio === selStudio;
    });

    if(!alreadyBooked) { 
      b[dStr].push({time: selT, studio: selStudio, name: name}); 
      localStorage.setItem("bookedSlots", JSON.stringify(b)); 
      if(isCloudEnabled()) cloudUpsert("bookings", {id:`${dStr}-${selT}-${selStudio}`, date:dStr, time:selT, studio:selStudio, name: name}); 
    }
    window.open(MERCADO_PAGO_LINK, "_blank");
    setTimeout(() => { window.location.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Confirmar turno en "+selStudio+": "+dStr+" "+selT+" a nombre de "+name)}`; }, 1000);
  };
  renderCal();
}

// --- Edición y Sincronización ---
const enableVisualEditing = () => {
  document.body.classList.add('editing-mode');
  const bar = document.createElement('div'); bar.className='admin-alert';
  bar.innerHTML = `<span>MODO EDICIÓN</span><button id="adminSaveVisual">Guardar</button><button onclick="location.reload()">Salir</button>`;
  document.body.appendChild(bar);
  
  // Textos editables
  document.querySelectorAll('p, h1, h2, h3, span, strong, small, figcaption, .eyebrow, .button').forEach(el => { 
    if(!el.closest('.admin-overlay') && !el.closest('.nav') && !el.classList.contains('menu-toggle')) {
      el.contentEditable = "true";
      el.setAttribute('spellcheck', 'false'); // Desactivar subrayado rojo de ortografía
    }
  });

  // Imágenes editables
  document.querySelectorAll('img, .collage-item, .gallery-item, .hero, .page-hero').forEach(el => {
    if (el.closest('.admin-overlay')) return;
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
            const MAX_SIZE = 800; // Tamaño máximo para optimizar
            if (width > height) {
              if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
            } else {
              if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
            }
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            
            // Convertir a texto (Base64) para guardar en Supabase
            const base64 = canvas.toDataURL('image/jpeg', 0.6);
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
  localStorage.setItem(`miri_changes_${pId}`, JSON.stringify(changes));
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
  const s = localStorage.getItem(`miri_changes_${currentPage || 'global'}`); if(!s) return;
  const d = JSON.parse(s); 
  
  if (d.texts) Object.keys(d.texts).forEach(p => { 
    const el = document.querySelector(p); 
    if (el && !el.classList.contains('menu-toggle') && d.texts[p] !== undefined && d.texts[p] !== null) {
      // Limpiar el HTML de posibles atributos contenteditable que se hayan filtrado
      let cleanHtml = d.texts[p].replace(/contenteditable="true"/g, '').replace(/contenteditable="false"/g, '');
      el.innerHTML = cleanHtml; 
      // Asegurar que no sea editable si no estamos en modo edición
      if (!isEditing) el.contentEditable = "false";
    }
  });
  if (d.images) Object.keys(d.images).forEach(p => { 
    const el = document.querySelector(p); 
    if (el) {
      let src = d.images[p];
      // Si el formato es un objeto (como en miri_data.json), extraemos la URL
      if (typeof src === 'object' && src !== null && src.src) {
        src = src.src;
      }
      // Solo aplicamos si es un string válido (URL o Base64)
      if (typeof src === 'string') {
        if (el.tagName === 'IMG') el.src = src;
        else el.style.backgroundImage = `url("${src}")`;
      }
    }
  });
};

const syncWithCloud = (manual = false) => {
  if(isCloudEnabled()) {
    cloudFetch("bookings").then(d => { if(d) { const c = {}; d.forEach(b => { if(!c[b.date]) c[b.date]=[]; c[b.date].push({time: b.time, studio: b.studio || "Monserrat", name: b.name || "-"}); }); localStorage.setItem("bookedSlots", JSON.stringify(c)); if(currentPage==="reservar" && window.__miriRenderCal) window.__miriRenderCal(); } });
    cloudFetch("config").then(d => { 
      if(d && d[0]) { 
        localStorage.setItem("miri_wa_number", d[0].wa); 
        localStorage.setItem("miri_mp_link", d[0].mp); 
      } 
    });
    cloudFetch("page_changes").then(d => { 
      if(d) {
        d.forEach(i => {
          if(i.id === "schedule") {
            if(i.data && i.data.slots) {
              let incomingSlots = i.data.slots;
              // Compatibilidad
              if (Array.isArray(incomingSlots)) {
                incomingSlots = { "Monserrat": incomingSlots, "José Marmol": [...DEFAULT_SLOTS] };
              }
              localStorage.setItem("miri_work_slots", JSON.stringify(incomingSlots));
              WORK_SLOTS = incomingSlots;
            }
            if(i.data && i.data.custom_days) {
              localStorage.setItem("miri_custom_days", JSON.stringify(i.data.custom_days));
              CUSTOM_WORK_DAYS = i.data.custom_days;
            }
            return;
          }
          localStorage.setItem(`miri_changes_${i.id}`, JSON.stringify(i.data));
        });
      }
      applySavedChanges();
      if(currentPage==="reservar" && window.__miriRenderCal) window.__miriRenderCal();
    });
    if(manual) alert("Sincronización completada");
  } else if(manual) {
    alert("La nube no está configurada.");
  }
};

const renderAdminBookings = () => {
  const t = document.getElementById("adminBookingsTable"); if(!t) return;
  const b = JSON.parse(localStorage.getItem("bookedSlots") || "{}"); t.innerHTML = "";
  Object.keys(b).forEach(d => b[d].forEach(booking => { 
    const r = t.insertRow(); 
    const studioClass = booking.studio === "Monserrat" ? "monserrat" : "jose-marmol";
    const clientName = booking.name || "-";
    r.innerHTML = `<td>${d}</td><td>${booking.time}</td><td><span class="studio-tag ${studioClass}">${booking.studio}</span></td><td>${clientName}</td><td><button onclick="releaseSlot('${d}','${booking.time}','${booking.studio}')">Liberar</button></td>`; 
  }));
};

window.releaseSlot = (d, t, s) => {
  const b = JSON.parse(localStorage.getItem("bookedSlots") || "{}");
  if(b[d]) {
    b[d] = b[d].filter(booking => !(booking.time === t && booking.studio === s)); 
    localStorage.setItem("bookedSlots", JSON.stringify(b));
    if(isCloudEnabled()) cloudDelete("bookings", `${d}-${t}-${s}`);
    renderAdminBookings();
  }
};

document.addEventListener('DOMContentLoaded', () => { 
  // --- Lógica del Menú Mobile ---
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.header'); // Usamos el header para el estado nav-active
  
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      const isOpen = document.body.classList.toggle('nav-active');
      menuToggle.setAttribute('aria-expanded', isOpen);
    });
  }

  // Cerrar menú al hacer clic en un link (opcional pero recomendado)
  document.querySelectorAll('.nav a').forEach(link => {
    link.addEventListener('click', () => {
      document.body.classList.remove('nav-active');
      if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
    });
  });

  // Asegurar que nada sea editable al cargar la página
  document.querySelectorAll('[contenteditable]').forEach(el => el.contentEditable = "false");
  
  applySavedChanges(); 
  syncWithCloud(); 
  if(currentPage === "reservar" && isCloudEnabled()) {
    setInterval(() => syncWithCloud(false), 20000);
  }
});
