let WHATSAPP_NUMBER = localStorage.getItem("miri_wa_number") || "5491144123280";
const DEFAULT_MESSAGE = "Hola, quiero reservar un turno para extensiones de pestañas";
let MERCADO_PAGO_LINK = localStorage.getItem("miri_mp_link") || "https://mpago.la/1iJbsQy";

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
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(data)
    });
    return response.ok;
  } catch (e) { return false; }
};

const cloudDelete = async (table, id) => {
  if (!isCloudEnabled()) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
    });
    return response.ok;
  } catch (e) { return false; }
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
            <button class="button button-secondary" id="adminSyncFromCloud" style="color:#d98aa7;">Cargar desde GitHub</button>
            <button class="button" id="adminResetLocal" style="background:#e53e3e; color:white;">Borrar TODO</button>
          </div>
        </div>
        <div class="admin-section">
          <h3>Edición Visual</h3>
          <button class="button button-primary btn-save-all" id="adminEnableEdit">Activar Modo Edición</button>
        </div>
        <div class="admin-section">
          <h3>General</h3>
          <div class="admin-grid">
            <div class="admin-field"><label>WhatsApp</label><input type="text" id="adminWaNumber"></div>
            <div class="admin-field"><label>Link Pago</label><input type="text" id="adminMpLink"></div>
          </div>
          <button class="button button-primary btn-save-all" id="adminSaveConfig">Guardar</button>
        </div>
        <div class="admin-section">
          <h3>Turnos</h3>
          <div class="admin-table-wrapper"><table class="admin-table"><thead><tr><th>Fecha</th><th>Hora</th><th>Acción</th></tr></thead><tbody id="adminBookingsTable"></tbody></table></div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  adminOverlay = document.getElementById("adminOverlay");
  document.getElementById("adminClose").onclick = () => adminOverlay.style.display = "none";
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
  document.getElementById("adminDownloadChanges").onclick = () => {
    const data = { config: { wa: WHATSAPP_NUMBER, mp: MERCADO_PAGO_LINK }, bookings: JSON.parse(localStorage.getItem("bookedSlots") || "{}"), changes: {} };
    ['inicio', 'servicios', 'galeria', 'opiniones', 'contacto', 'reservar', 'global'].forEach(p => { const s = localStorage.getItem(`miri_changes_${p}`); if(s) data.changes[p] = JSON.parse(s); });
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:"application/json"})); a.download = "miri_data.json"; a.click();
  };
};

const openAdminPanel = () => {
  if(!adminOverlay) injectAdminUI();
  adminOverlay.style.display = "flex";
  document.getElementById("adminWaNumber").value = WHATSAPP_NUMBER;
  document.getElementById("adminMpLink").value = MERCADO_PAGO_LINK;
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
  let curr = new Date(); let selD = null; let selT = null;
  const slots = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

  const renderCal = () => {
    grid.innerHTML = ""; monthEl.textContent = new Intl.DateTimeFormat("es-ES", {month:"long", year:"numeric"}).format(curr);
    ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].forEach(d => { const h = document.createElement("div"); h.className="calendar-day-head"; h.textContent=d; grid.appendChild(h); });
    const first = new Date(curr.getFullYear(), curr.getMonth(), 1).getDay();
    const last = new Date(curr.getFullYear(), curr.getMonth() + 1, 0).getDate();
    for(let i=0; i<first; i++) grid.appendChild(document.createElement("div")).className="calendar-day empty";
    const today = new Date(); today.setHours(0,0,0,0);
    for(let i=1; i<=last; i++) {
      const d = document.createElement("div"); d.className="calendar-day"; d.textContent=i;
      const dObj = new Date(curr.getFullYear(), curr.getMonth(), i);
      if(dObj < today) d.classList.add("disabled");
      else {
        if(dObj.getTime()===today.getTime()) d.classList.add("today");
        if(selD && dObj.toDateString()===selD.toDateString()) d.classList.add("selected");
        d.onclick = () => { selD = dObj; selT = null; document.getElementById("bookingSummary").style.display="none"; document.getElementById("selectedDateText").textContent=dObj.toLocaleDateString("es-ES"); document.getElementById("slotsContainer").style.display="block"; renderCal(); renderSlots(dObj.toLocaleDateString("es-ES")); };
      }
      grid.appendChild(d);
    }
  };

  const renderSlots = (dStr) => {
    slotsGrid.innerHTML = ""; const booked = JSON.parse(localStorage.getItem("bookedSlots") || "{}")[dStr] || [];
    slots.forEach(t => {
      const b = document.createElement("button"); b.className="slot-button"; b.textContent=t;
      if(booked.includes(t)) { b.classList.add("booked"); b.disabled=true; }
      else {
        if(selT===t) b.classList.add("selected");
        b.onclick = () => { selT=t; document.getElementById("summaryDate").textContent=dStr; document.getElementById("summaryTime").textContent=t; document.getElementById("bookingSummary").style.display="block"; slotsGrid.querySelectorAll(".slot-button").forEach(btn => btn.classList.toggle("selected", btn.textContent===t)); };
      }
      slotsGrid.appendChild(b);
    });
  };

  document.getElementById("prevMonth").onclick = () => { curr.setMonth(curr.getMonth()-1); renderCal(); };
  document.getElementById("nextMonth").onclick = () => { curr.setMonth(curr.getMonth()+1); renderCal(); };
  document.getElementById("confirmBooking").onclick = () => {
    if(!selD || !selT) return; const dStr = selD.toLocaleDateString("es-ES");
    const b = JSON.parse(localStorage.getItem("bookedSlots") || "{}"); if(!b[dStr]) b[dStr] = [];
    if(!b[dStr].includes(selT)) { b[dStr].push(selT); localStorage.setItem("bookedSlots", JSON.stringify(b)); if(isCloudEnabled()) cloudUpsert("bookings", {id:`${dStr}-${selT}`, date:dStr, time:selT}); }
    window.open(MERCADO_PAGO_LINK, "_blank");
    setTimeout(() => { window.location.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Confirmar turno "+dStr+" "+selT)}`; }, 1000);
  };
  renderCal();
}

// --- Edición y Sincronización ---
const enableVisualEditing = () => {
  document.body.classList.add('editing-mode');
  const bar = document.createElement('div'); bar.className='admin-alert';
  bar.innerHTML = `<span>MODO EDICIÓN</span><button id="adminSaveVisual">Guardar</button><button onclick="location.reload()">Salir</button>`;
  document.body.appendChild(bar);
  document.querySelectorAll('p, h1, h2, h3, span, strong, small, figcaption, .eyebrow, .button').forEach(el => { if(!el.closest('.admin-overlay') && !el.closest('.nav')) el.contentEditable="true"; });
  document.getElementById('adminSaveVisual').onclick = () => { saveAllChanges(); location.reload(); };
};

const saveAllChanges = () => {
  const pId = currentPage || 'global'; const changes = { texts: {}, images: {} };
  document.querySelectorAll('[contenteditable="true"]').forEach(el => { changes.texts[getElementPath(el)] = el.innerHTML.trim(); });
  localStorage.setItem(`miri_changes_${pId}`, JSON.stringify(changes));
  if(isCloudEnabled()) cloudUpsert("page_changes", {id:pId, data:changes});
};

const getElementPath = (el) => {
  const path = []; while(el && el.nodeType===Node.ELEMENT_NODE) {
    let s = el.nodeName.toLowerCase(); if(el.id) { s += '#'+el.id; path.unshift(s); break; }
    let sib = el, n = 1; while(sib = sib.previousElementSibling) if(sib.nodeName.toLowerCase()==s) n++;
    if(n!=1) s += `:nth-of-type(${n})`; path.unshift(s); el = el.parentNode;
  } return path.join(" > ");
};

const applySavedChanges = () => {
  const s = localStorage.getItem(`miri_changes_${currentPage || 'global'}`); if(!s) return;
  const d = JSON.parse(s); if(d.texts) Object.keys(d.texts).forEach(p => { const el = document.querySelector(p); if(el) el.innerHTML = d.texts[p]; });
};

const syncWithCloud = () => {
  if(isCloudEnabled()) {
    cloudFetch("bookings").then(d => { if(d) { const c = {}; d.forEach(b => { if(!c[b.date]) c[b.date]=[]; c[b.date].push(b.time); }); localStorage.setItem("bookedSlots", JSON.stringify(c)); if(currentPage==="reservar") renderCal(); } });
    cloudFetch("config").then(d => { if(d && d[0]) { localStorage.setItem("miri_wa_number", d[0].wa); localStorage.setItem("miri_mp_link", d[0].mp); } });
    cloudFetch("page_changes").then(d => { if(d) d.forEach(i => localStorage.setItem(`miri_changes_${i.id}`, JSON.stringify(i.data))); applySavedChanges(); });
  }
};

const renderAdminBookings = () => {
  const t = document.getElementById("adminBookingsTable"); if(!t) return;
  const b = JSON.parse(localStorage.getItem("bookedSlots") || "{}"); t.innerHTML = "";
  Object.keys(b).forEach(d => b[d].forEach(time => { const r = t.insertRow(); r.innerHTML = `<td>${d}</td><td>${time}</td><td><button onclick="releaseSlot('${d}','${time}')">Liberar</button></td>`; }));
};

window.releaseSlot = (d, t) => {
  const b = JSON.parse(localStorage.getItem("bookedSlots") || "{}");
  if(b[d]) {
    b[d] = b[d].filter(time => time !== t); localStorage.setItem("bookedSlots", JSON.stringify(b));
    if(isCloudEnabled()) cloudDelete("bookings", `${d}-${t}`);
    renderAdminBookings();
  }
};

document.addEventListener('DOMContentLoaded', () => { applySavedChanges(); syncWithCloud(); });
