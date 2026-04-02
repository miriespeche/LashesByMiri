let WHATSAPP_NUMBER = localStorage.getItem("miri_wa_number") || "5491144123280";
const DEFAULT_MESSAGE = "Hola, quiero reservar un turno para extensiones de pestañas";
let MERCADO_PAGO_LINK = localStorage.getItem("miri_mp_link") || "https://mpago.la/1iJbsQy";

// --- Configuración de Base de Datos (Supabase) para Sincronización Automática ---
// IMPORTANTE: Podés dejar estos campos vacíos y cargarlos desde el panel MiriAdmin, 
// o ponerlos acá directamente para que funcionen en todos los dispositivos al instante.
const CLOUD_URL = "https://hugbaugzsntojbotjblz.supabase.co"; 
const CLOUD_KEY = ""; // Pegá acá tu llave larga (anon public) que copiaste de Supabase

let SUPABASE_URL = localStorage.getItem("miri_supabase_url") || CLOUD_URL;
let SUPABASE_KEY = localStorage.getItem("miri_supabase_key") || CLOUD_KEY;

const isCloudEnabled = () => SUPABASE_URL !== "" && SUPABASE_KEY !== "";

const cloudFetch = async (table) => {
  if (!isCloudEnabled()) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error("Error al cargar de la nube:", e);
    return null;
  }
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
    return response.ok;
  } catch (e) {
    console.error("Error al guardar en la nube:", e);
    return false;
  }
};

const cloudDelete = async (table, id) => {
  if (!isCloudEnabled()) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    return response.ok;
  } catch (e) {
    console.error("Error al borrar de la nube:", e);
    return false;
  }
};

const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav");
const waLinks = document.querySelectorAll(".wa-link");
const displayNumber = document.getElementById("display-number");
const sliderTrack = document.querySelector(".testimonials-track");
const sliderButtons = document.querySelectorAll(".slider-button");
const navLinks = document.querySelectorAll(".nav a[data-nav]");
const currentPage = document.body.dataset.page;

if (displayNumber) {
  // Formatear el número guardado para mostrarlo bonito
  const formatted = WHATSAPP_NUMBER.replace(/^549/, "+54 9 ");
  displayNumber.textContent = formatted;
}

const buildWaUrl = (message) => {
  const text = encodeURIComponent(message || DEFAULT_MESSAGE);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
};

waLinks.forEach((link) => {
  const message = link.dataset.waMessage || DEFAULT_MESSAGE;
  link.href = buildWaUrl(message);
});

if (menuToggle && nav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    menuToggle.classList.toggle("is-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      menuToggle.classList.remove("is-open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

if (currentPage && navLinks.length) {
  navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === currentPage);
  });
}

const revealElements = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.15
    }
  );

  revealElements.forEach((element) => revealObserver.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add("is-visible"));
}

let activeSlide = 0;

const getCardsPerView = () => {
  if (window.innerWidth <= 860) {
    return 1;
  }

  if (window.innerWidth <= 1120) {
    return 2;
  }

  return 3;
};

const updateSlider = () => {
  if (!sliderTrack) {
    return;
  }

  const cards = Array.from(sliderTrack.children);
  const cardsPerView = getCardsPerView();
  const maxIndex = Math.max(cards.length - cardsPerView, 0);

  if (activeSlide > maxIndex) {
    activeSlide = maxIndex;
  }

  const cardWidth = cards[0]?.getBoundingClientRect().width || 0;
  const gap = 16;
  const offset = activeSlide * (cardWidth + gap);

  sliderTrack.style.transform = `translateX(-${offset}px)`;
};

sliderButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!sliderTrack) {
      return;
    }

    const cards = Array.from(sliderTrack.children);
    const cardsPerView = getCardsPerView();
    const maxIndex = Math.max(cards.length - cardsPerView, 0);

    if (button.dataset.direction === "next") {
      activeSlide = activeSlide >= maxIndex ? 0 : activeSlide + 1;
    } else {
      activeSlide = activeSlide <= 0 ? maxIndex : activeSlide - 1;
    }

    updateSlider();
  });
});

window.addEventListener("resize", updateSlider);
window.addEventListener("load", updateSlider);

// --- Lógica del Calendario de Reservas ---
if (currentPage === "reservar") {
  const calendarGrid = document.getElementById("calendarGrid");
  const currentMonthElement = document.getElementById("currentMonth");
  const prevMonthBtn = document.getElementById("prevMonth");
  const nextMonthBtn = document.getElementById("nextMonth");
  const slotsContainer = document.getElementById("slotsContainer");
  const slotsGrid = document.getElementById("slotsGrid");
  const selectedDateText = document.getElementById("selectedDateText");
  const bookingSummary = document.getElementById("bookingSummary");
  const summaryDate = document.getElementById("summaryDate");
  const summaryTime = document.getElementById("summaryTime");
  const confirmBookingBtn = document.getElementById("confirmBooking");

  let currentDate = new Date();
  let selectedDate = null;
  let selectedTime = null;

  // Horarios base (se pueden personalizar)
  const availableSlots = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

  const renderCalendar = () => {
    calendarGrid.innerHTML = "";
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    currentMonthElement.textContent = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(currentDate);

    // Encabezados de días
    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    days.forEach(day => {
      const dayHead = document.createElement("div");
      dayHead.className = "calendar-day-head";
      dayHead.textContent = day;
      calendarGrid.appendChild(dayHead);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();

    // Días vacíos al inicio
    for (let i = 0; i < firstDay; i++) {
      const emptyDay = document.createElement("div");
      emptyDay.className = "calendar-day empty";
      calendarGrid.appendChild(emptyDay);
    }

    // Días del mes
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 1; i <= lastDay; i++) {
      const dayElement = document.createElement("div");
      dayElement.className = "calendar-day";
      dayElement.textContent = i;

      const dateObj = new Date(year, month, i);
      
      if (dateObj < today) {
        dayElement.classList.add("disabled");
      } else {
        if (dateObj.getTime() === today.getTime()) {
          dayElement.classList.add("today");
        }
        
        if (selectedDate && dateObj.toDateString() === selectedDate.toDateString()) {
          dayElement.classList.add("selected");
        }

        dayElement.addEventListener("click", () => selectDate(dateObj));
      }

      calendarGrid.appendChild(dayElement);
    }
  };

  const selectDate = (date) => {
    selectedDate = date;
    selectedTime = null;
    bookingSummary.style.display = "none";
    
    const formattedDate = date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
    selectedDateText.textContent = formattedDate;
    slotsContainer.style.display = "block";
    
    renderCalendar();
    renderSlots(formattedDate);
  };

  const renderSlots = (dateString) => {
    slotsGrid.innerHTML = "";
    
    // Simulación de turnos reservados (en una app real vendría de un servidor)
    const bookedSlots = JSON.parse(localStorage.getItem("bookedSlots") || "{}");
    const bookedForDate = bookedSlots[dateString] || [];

    availableSlots.forEach(time => {
      const slotBtn = document.createElement("button");
      slotBtn.className = "slot-button";
      slotBtn.textContent = time;

      if (bookedForDate.includes(time)) {
        slotBtn.classList.add("booked");
        slotBtn.disabled = true;
      } else {
        if (selectedTime === time) {
          slotBtn.classList.add("selected");
        }
        slotBtn.addEventListener("click", () => selectTime(time, dateString));
      }

      slotsGrid.appendChild(slotBtn);
    });
  };

  const selectTime = (time, dateString) => {
    selectedTime = time;
    summaryDate.textContent = dateString;
    summaryTime.textContent = time;
    bookingSummary.style.display = "block";
    
    // Re-render slots para marcar el seleccionado
    const buttons = slotsGrid.querySelectorAll(".slot-button");
    buttons.forEach(btn => {
      btn.classList.toggle("selected", btn.textContent === time);
    });
  };

  prevMonthBtn.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  nextMonthBtn.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  confirmBookingBtn.addEventListener("click", () => {
    if (!selectedDate || !selectedTime) return;

    const dateString = selectedDate.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
    
    // Obtener el servicio de la URL si existe
    const urlParams = new URLSearchParams(window.location.search);
    const servicioElegido = urlParams.get('servicio') || "servicio general";

    // 1. Guardar en localStorage como reservado (simulación de cierre de horario)
    const bookedSlots = JSON.parse(localStorage.getItem("bookedSlots") || "{}");
    if (!bookedSlots[dateString]) bookedSlots[dateString] = [];
    
    // Solo agregar si no existe ya
    if (!bookedSlots[dateString].includes(selectedTime)) {
      bookedSlots[dateString].push(selectedTime);
      localStorage.setItem("bookedSlots", JSON.stringify(bookedSlots));
      
      // Sincronizar con la nube si está habilitada
      if (isCloudEnabled()) {
        cloudUpsert("bookings", { 
          id: `${dateString}-${selectedTime}`, // ID único para evitar duplicados
          date: dateString, 
          time: selectedTime,
          service: servicioElegido
        }).then(ok => {
          if (ok) console.log("Turno guardado en la nube automáticamente.");
        });
      }
    }

    // 2. Preparar mensaje de WhatsApp con el servicio
    const message = `Hola! Quiero confirmar mi turno para ${servicioElegido} el día ${dateString} a las ${selectedTime}. Ya realicé el pago de la seña.`;
    const waUrl = buildWaUrl(message);

    // 3. Abrir Mercado Pago en una pestaña y WhatsApp en otra (o después)
    window.open(MERCADO_PAGO_LINK, "_blank");
    
    setTimeout(() => {
      window.location.href = waUrl;
    }, 1000);
  });

  renderCalendar();
}

// --- MiriAdmin: Comando Secreto y Panel ---
let adminCommandString = "";
let adminOverlay = null;

// Inyectar el HTML del Admin Panel dinámicamente
const injectAdminUI = () => {
  const adminHTML = `
    <div class="admin-overlay" id="adminOverlay">
      <div class="admin-modal">
        <span class="admin-close" id="adminClose">&times;</span>
        <h2>MiriAdmin Panel</h2>
        
        <div class="admin-section">
          <h3>Sincronización Automática (Nube Real)</h3>
          <p>Para que todo se guarde automáticamente sin descargar archivos, te recomiendo usar <strong>Supabase</strong> (es gratis). Si ponés tus llaves acá, el sistema funcionará solo.</p>
          <div class="admin-grid">
            <div class="admin-field">
              <label for="adminSupabaseUrl">URL de Supabase</label>
              <input type="text" id="adminSupabaseUrl" placeholder="https://xyz.supabase.co">
            </div>
            <div class="admin-field">
              <label for="adminSupabaseKey">Key (Anon Public Key)</label>
              <input type="text" id="adminSupabaseKey" placeholder="eyJhbGciOiJIUzI1NiI...">
            </div>
          </div>
          <button class="button button-primary" id="adminSaveCloudConfig" style="margin-top:10px; background: #4a5568;">Guardar y Activar Nube</button>
        </div>

        <div class="admin-section">
          <h3>Sincronización Manual (GitHub)</h3>
          <p>Si no usás Supabase, debés descargar y subir el archivo a GitHub manualmente cada vez que hagas un cambio importante.</p>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="button button-secondary" id="adminDownloadChanges" style="background: #d98aa7; color: white; border: none;">1. Descargar Archivo de Cambios</button>
            <button class="button button-secondary" id="adminSyncFromCloud" style="border-color: #d98aa7; color: #d98aa7;">Restaurar desde GitHub (Nube)</button>
            <button class="button" id="adminResetLocal" style="background:#e53e3e; color:white; border:none; padding: 0.8rem 1.5rem; border-radius: 12px; font-weight: bold; cursor: pointer;">Borrar TODO y Reiniciar PC</button>
          </div>
        </div>

        <div class="admin-section">
          <h3>Edición de Contenido Visual</h3>
          <p>Haz clic en el botón de abajo para activar el modo de edición. Podrás escribir directamente sobre los textos de la página y cambiar imágenes.</p>
          <button class="button button-primary btn-save-all" id="adminEnableEdit">Activar Modo Edición</button>
        </div>

        <div class="admin-section">
          <h3>Configuración General</h3>
          <div class="admin-grid">
            <div class="admin-field">
              <label for="adminWaNumber">Número WhatsApp (sin +)</label>
              <input type="text" id="adminWaNumber" placeholder="Ej: 5491144123280">
            </div>
            <div class="admin-field">
              <label for="adminMpLink">Link Mercado Pago</label>
              <input type="text" id="adminMpLink" placeholder="https://mpago.la/...">
            </div>
          </div>
          <button class="button button-primary btn-save-all" id="adminSaveConfig">Guardar Configuración</button>
        </div>

        <div class="admin-section">
          <h3>Gestión de Turnos Reservados</h3>
          <p>Haciendo clic en "Liberar" el horario volverá a estar disponible en el calendario.</p>
          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Horario</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody id="adminBookingsTable"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', adminHTML);
  
  // Asignar elementos después de inyectar
  adminOverlay = document.getElementById("adminOverlay");
  const adminClose = document.getElementById("adminClose");
  const adminSaveBtn = document.getElementById("adminSaveConfig");
  const adminEnableEditBtn = document.getElementById("adminEnableEdit");
  const adminDownloadBtn = document.getElementById("adminDownloadChanges");
  const adminSyncBtn = document.getElementById("adminSyncFromCloud");
  const adminResetBtn = document.getElementById("adminResetLocal");
  const adminSaveCloudBtn = document.getElementById("adminSaveCloudConfig");

  if (adminSaveCloudBtn) {
    adminSaveCloudBtn.addEventListener("click", () => {
      const url = document.getElementById("adminSupabaseUrl").value.trim();
      const key = document.getElementById("adminSupabaseKey").value.trim();
      if (url && key) {
        localStorage.setItem("miri_supabase_url", url);
        localStorage.setItem("miri_supabase_key", key);
        alert("Configuración de nube guardada. El sistema ahora intentará sincronizar automáticamente.");
        location.reload();
      } else {
        alert("Por favor, completa ambos campos.");
      }
    });
  }

  if (adminSyncBtn) {
    adminSyncBtn.addEventListener("click", () => {
      if (confirm("¿Quieres cargar los datos de la nube? Esto podría sobrescribir tus cambios locales si no los has descargado.")) {
        syncWithCloud(true);
      }
    });
  }

  if (adminResetBtn) {
    adminResetBtn.addEventListener("click", () => {
      if (confirm("¿Estás segura? Esto borrará todos los cambios que hiciste en esta PC y restaurará el diseño original (lo que está en GitHub).")) {
        // Borrar cambios de todas las páginas del localStorage
        ['inicio', 'servicios', 'galeria', 'opiniones', 'contacto', 'reservar', 'global'].forEach(p => {
          localStorage.removeItem(`miri_changes_${p}`);
        });
        localStorage.removeItem("miri_wa_number");
        localStorage.removeItem("miri_mp_link");
        localStorage.removeItem("bookedSlots"); 
        localStorage.removeItem("miri_supabase_url"); // También borrar la nube
        localStorage.removeItem("miri_supabase_key");
        location.reload();
      }
    });
  }

  if (adminDownloadBtn) {
    adminDownloadBtn.addEventListener("click", () => {
      // 1. Guardar cambios actuales si el usuario está en modo edición
      if (document.body.classList.contains('editing-mode')) {
        saveAllChanges();
      }

      const allData = {
        config: {
          wa: WHATSAPP_NUMBER,
          mp: MERCADO_PAGO_LINK
        },
        bookings: JSON.parse(localStorage.getItem("bookedSlots") || "{}"),
        changes: {}
      };
      
      // Recopilar todos los cambios de todas las páginas posibles
      ['inicio', 'servicios', 'galeria', 'opiniones', 'contacto', 'reservar', 'global'].forEach(p => {
        const saved = localStorage.getItem(`miri_changes_${p}`);
        if (saved) {
          try {
            allData.changes[p] = JSON.parse(saved);
          } catch (e) { console.error("Error al leer cambios de página:", p); }
        }
      });

      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "miri_data.json";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (adminClose) {
    adminClose.addEventListener("click", () => {
      adminOverlay.style.display = "none";
    });
  }

  if (adminEnableEditBtn) {
    adminEnableEditBtn.addEventListener("click", () => {
      adminOverlay.style.display = "none";
      enableVisualEditing();
    });
  }

  if (adminSaveBtn) {
    adminSaveBtn.addEventListener("click", () => {
      const adminWaInput = document.getElementById("adminWaNumber");
      const adminMpInput = document.getElementById("adminMpLink");
      const newWa = adminWaInput.value.trim();
      const newMp = adminMpInput.value.trim();
      
      if (newWa) {
        localStorage.setItem("miri_wa_number", newWa);
      }
      if (newMp) {
        localStorage.setItem("miri_mp_link", newMp);
      }
      
      // Sincronizar configuración con la nube si está habilitada
      if (isCloudEnabled()) {
        cloudUpsert("config", {
          id: 1, // Fila única de configuración
          wa: newWa || WHATSAPP_NUMBER,
          mp: newMp || MERCADO_PAGO_LINK,
          updated_at: new Date().toISOString()
        }).then(ok => {
          if (ok) {
            alert("Configuración guardada en la PC y en la Nube.");
            location.reload();
          } else {
            alert("Guardado en la PC, pero hubo un error con la Nube. Revisá tus llaves.");
          }
        });
      } else {
        alert("Configuración guardada correctamente en esta PC.");
        location.reload();
      }
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === adminOverlay) {
      adminOverlay.style.display = "none";
    }
  });
};

// Ejecutar inyección al cargar
injectAdminUI();

window.addEventListener("keydown", (e) => {
  // Ignorar si el usuario está escribiendo en un input
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  adminCommandString += e.key.toLowerCase();
  if (adminCommandString.includes("miriadmin")) {
    openAdminPanel();
    adminCommandString = "";
  }
  if (adminCommandString.length > 20) adminCommandString = "";
});

// Fallback: Click en el logo 5 veces
let logoClicks = 0;
const brandLogo = document.querySelector(".brand");
if (brandLogo) {
  brandLogo.addEventListener("click", (e) => {
    // Si es en la página de inicio, no queremos que navegue mientras hacemos los clics
    // Pero como es un link, vamos a usar un contador
    logoClicks++;
    if (logoClicks >= 5) {
      e.preventDefault();
      openAdminPanel();
      logoClicks = 0;
    }
    // Resetear clics si pasa mucho tiempo
    setTimeout(() => { logoClicks = 0; }, 3000);
  });
}

const openAdminPanel = () => {
  if (!adminOverlay) return;
  adminOverlay.style.display = "flex";
  
  // Cargar valores actuales
  document.getElementById("adminWaNumber").value = WHATSAPP_NUMBER;
  document.getElementById("adminMpLink").value = MERCADO_PAGO_LINK;
  
  if (isCloudEnabled()) {
    document.getElementById("adminSupabaseUrl").value = SUPABASE_URL;
    document.getElementById("adminSupabaseKey").value = SUPABASE_KEY;
  }
  
  renderAdminBookings();
};

// --- Edición Visual Dinámica ---
const enableVisualEditing = () => {
  document.body.classList.add('editing-mode');
  
  // Crear barra de alerta de edición
  const alertBar = document.createElement('div');
  alertBar.className = 'admin-alert';
  alertBar.innerHTML = `
    <span> MODO EDICIÓN: Haz clic en cualquier texto para editar.</span>
    <button id="adminSaveVisual" class="btn-save-visual">Guardar Todo</button>
    <button id="adminCancelVisual" class="btn-cancel-visual">Salir sin guardar</button>
  `;
  document.body.appendChild(alertBar);

  // Hacer editables textos comunes
  const tagsToEdit = 'p, h1, h2, h3, span, strong, small, figcaption, .eyebrow, .button, .service-price, .testimonial strong';
  document.querySelectorAll(tagsToEdit).forEach(el => {
    if (!el.closest('.admin-overlay') && !el.closest('.nav')) {
      el.contentEditable = "true";
    }
  });

  // Manejar imágenes normales e imágenes de fondo
  const elementsWithImages = document.querySelectorAll('img, .hero-backdrop, .collage-item, .gallery-item, .hero, .page-hero');
  
  elementsWithImages.forEach(el => {
    if (el.closest('.admin-overlay')) return;

    const isHero = el.classList.contains('hero') || el.classList.contains('page-hero');
    const backdrop = el.querySelector('.hero-backdrop');
    const collageItems = el.querySelectorAll('.collage-item');
    
    // Si es un hero con collage, el objetivo son los items
    if (isHero && collageItems.length > 0) {
      collageItems.forEach(item => {
        item.classList.add('editable-img');
        item.setAttribute('data-edit-hint', 'Cambiar foto collage');
        setupImageClick(item, true);
      });
      return;
    }

    const editTarget = (isHero && backdrop) ? backdrop : el;
    const hasBg = getComputedStyle(editTarget).backgroundImage !== 'none';
    const isImg = editTarget.tagName.toLowerCase() === 'img';
    const internalImg = editTarget.querySelector('img');

    if (isImg || hasBg || internalImg) {
      el.classList.add('editable-img');
      if (hasBg && !isImg && !internalImg) {
        el.setAttribute('data-edit-hint', 'Cambiar fondo');
      }
      setupImageClick(el, hasBg && !isImg && !internalImg, editTarget, internalImg);
    }
  });

  function setupImageClick(clickEl, isActuallyBg, editTargetArg, internalImgArg) {
    clickEl.onclick = (e) => {
      if (e.target !== clickEl && (e.target.contentEditable === "true" || e.target.closest('.button'))) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      
      let actualTarget = editTargetArg || clickEl;
      if (internalImgArg) actualTarget = internalImgArg;

      let currentSrc = "";
      const isBg = isActuallyBg || (getComputedStyle(actualTarget).backgroundImage !== 'none' && actualTarget.tagName.toLowerCase() !== 'img');

      if (isBg) {
        const bgImg = getComputedStyle(actualTarget).backgroundImage;
        const urlMatch = bgImg.match(/url\(["']?(.*?)["']?\)/);
        currentSrc = urlMatch ? urlMatch[1] : "";
      } else {
        currentSrc = actualTarget.src;
      }

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      
      fileInput.onchange = ev => {
          const file = ev.target.files[0];
          if (!file) return;

          // Aumentamos el límite a 4MB para fotos de alta calidad, pero comprimiremos si es necesario
          if (file.size > 4 * 1024 * 1024) {
            alert("La imagen es demasiado pesada (más de 4MB). Por favor, usa una imagen más liviana.");
            return;
          }

          const reader = new FileReader();
          reader.onload = event => {
            const img = new Image();
            img.onload = () => {
              // Crear un canvas para redimensionar la imagen si es muy grande
              // Esto asegura que el JSON no explote por el tamaño
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              
              // Si la imagen es más grande que 1200px, la achicamos manteniendo proporción
              const MAX_WIDTH = 1200;
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              
              // Convertir a JPEG con calidad 0.7 para ahorrar MUCHO espacio
              const newSrc = canvas.toDataURL('image/jpeg', 0.7);
              
              if (isBg) {
                const currentBg = getComputedStyle(actualTarget).backgroundImage;
                if (currentBg.includes('gradient')) {
                  const gradientPart = currentBg.split('url(')[0];
                  actualTarget.style.backgroundImage = `${gradientPart}url("${newSrc}")`;
                } else {
                  actualTarget.style.backgroundImage = `url("${newSrc}")`;
                }
                actualTarget.style.backgroundSize = 'cover';
                actualTarget.style.backgroundPosition = 'center';
              } else {
                actualTarget.src = newSrc;
              }
            };
            img.src = event.target.result;
          };
          reader.readAsDataURL(file);
        };
      
      const action = confirm("¿Subir desde PC? (Aceptar) o ¿Ingresar URL? (Cancelar)");
      if (action) {
        fileInput.click();
      } else {
        const newUrl = prompt("URL de la imagen:", currentSrc);
        if (newUrl) {
          if (isBg) {
            const currentBg = getComputedStyle(actualTarget).backgroundImage;
            if (currentBg.includes('gradient')) {
              const gradientPart = currentBg.split('url(')[0];
              actualTarget.style.backgroundImage = `${gradientPart}url("${newUrl}")`;
            } else {
              actualTarget.style.backgroundImage = `url("${newUrl}")`;
            }
          } else {
            actualTarget.src = newUrl;
          }
        }
      }
    };
  }

  document.getElementById('adminSaveVisual').addEventListener('click', () => {
    saveAllChanges();
    document.querySelectorAll('[contenteditable]').forEach(el => el.contentEditable = "false");
    alert("¡Cambios guardados localmente! Recuerda descargar el JSON para actualizar GitHub.");
    location.reload();
  });

  document.getElementById('adminCancelVisual').addEventListener('click', () => {
    location.reload();
  });
};

// --- Funciones de utilidad para edición precisa ---
const getElementPath = (el) => {
  const path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    if (el.id) {
      selector += '#' + el.id;
      path.unshift(selector);
      break;
    } else {
      let sib = el, nth = 1;
      while (sib = sib.previousElementSibling) {
        if (sib.nodeName.toLowerCase() == selector) nth++;
      }
      if (nth != 1) selector += ":nth-of-type("+nth+")";
    }
    path.unshift(selector);
    el = el.parentNode;
  }
  return path.join(" > ");
};

const saveAllChanges = () => {
  const pageId = currentPage || 'global';
  const changes = { texts: {}, images: {} };

  const tagsToEdit = 'p, h1, h2, h3, span, strong, small, figcaption, .eyebrow, .button, .service-price, .testimonial strong';
  document.querySelectorAll(tagsToEdit).forEach((el) => {
    if (!el.closest('.admin-overlay') && !el.closest('.nav')) {
      const path = getElementPath(el);
      changes.texts[path] = el.innerHTML
        .replace(/contenteditable="[^"]*?"/g, '')
        .replace(/spellcheck="[^"]*?"/g, '')
        .trim();
    }
  });

  document.querySelectorAll('.editable-img').forEach((el) => {
    // Si el elemento es un hero o page-hero, el ahorro de datos real está en sus hijos (backdrop o collage)
    // No guardamos el contenedor padre si tiene hijos editables
    const isHero = el.classList.contains('hero') || el.classList.contains('page-hero');
    const hasEditableChildren = el.querySelectorAll('.editable-img').length > 0;
    if (isHero && hasEditableChildren) return;

    const backdrop = el.querySelector('.hero-backdrop');
    let targetEl = (isHero && backdrop) ? backdrop : el;
    const internalImg = targetEl.querySelector('img');
    if (internalImg) targetEl = internalImg;

    const isBg = getComputedStyle(targetEl).backgroundImage !== 'none' && targetEl.tagName.toLowerCase() !== 'img';
    const path = getElementPath(targetEl);
    let src = "";

    if (isBg) {
      const bgImg = getComputedStyle(targetEl).backgroundImage;
      const urlMatch = bgImg.match(/url\(["']?(.*?)["']?\)/);
      src = urlMatch ? urlMatch[1] : "";
    } else {
      src = targetEl.src;
    }
    
    if (src) changes.images[path] = { src, isBg };
  });

  try {
    localStorage.setItem(`miri_changes_${pageId}`, JSON.stringify(changes));
    
    // Sincronizar cambios visuales con la nube si está habilitada
    if (isCloudEnabled()) {
      cloudUpsert("page_changes", {
        id: pageId, // Guardar cambios por página
        data: changes,
        updated_at: new Date().toISOString()
      }).then(ok => {
        if (ok) console.log(`Cambios visuales de la página ${pageId} guardados en la nube.`);
      });
    }
  } catch (e) {
    alert("Error: Las imágenes son muy pesadas. Usa imágenes más pequeñas.");
  }
};

const applySavedChanges = () => {
  const pageId = currentPage || 'global';
  const saved = localStorage.getItem(`miri_changes_${pageId}`);
  if (!saved) return;

  const data = JSON.parse(saved);

  // Aplicar textos por su camino exacto (Path)
  if (data.texts) {
    Object.keys(data.texts).forEach(path => {
      try {
        const el = document.querySelector(path);
        if (el) {
          el.innerHTML = data.texts[path];
        }
      } catch (e) { console.warn("No se pudo aplicar texto en path:", path); }
    });
  }

  // Aplicar imágenes por su camino exacto
  if (data.images) {
    Object.keys(data.images).forEach(path => {
      try {
        const el = document.querySelector(path);
        const item = data.images[path];
        if (el && item.src) {
          if (item.isBg) {
            const currentBg = getComputedStyle(el).backgroundImage;
            if (currentBg && currentBg.includes('gradient')) {
              const gradientPart = currentBg.split('url(')[0];
              el.style.backgroundImage = `${gradientPart}url("${item.src}")`;
            } else {
              el.style.backgroundImage = `url("${item.src}")`;
            }
            el.style.backgroundSize = 'cover';
            el.style.backgroundPosition = 'center';
          } else {
            // Es un img directamente (o dentro de un contenedor)
            el.src = item.src;
          }
        }
      } catch (e) { console.warn("No se pudo aplicar imagen en path:", path); }
    });
  }
};

const syncWithCloud = (force = false) => {
  // 0. Si hay una base de datos real (Supabase), priorizarla
  if (isCloudEnabled()) {
    cloudFetch("bookings").then(data => {
      if (data) {
        const cloudBookings = {};
        data.forEach(b => {
          if (!cloudBookings[b.date]) cloudBookings[b.date] = [];
          if (!cloudBookings[b.date].includes(b.time)) cloudBookings[b.date].push(b.time);
        });
        
        const localBookings = JSON.parse(localStorage.getItem("bookedSlots") || "{}");
        const merged = { ...cloudBookings };
        
        // Mezclar locales por si hay alguno nuevo
        Object.keys(localBookings).forEach(date => {
          if (!merged[date]) merged[date] = localBookings[date];
          else {
            merged[date] = Array.from(new Set([...merged[date], ...localBookings[date]]));
          }
        });
        
        localStorage.setItem("bookedSlots", JSON.stringify(merged));
        if (currentPage === "reservar") renderCalendar();
      }
    });
    
    cloudFetch("config").then(data => {
      if (data && data.length > 0) {
        const config = data[0]; // Asumimos una fila de config
        if (config.wa) {
          localStorage.setItem("miri_wa_number", config.wa);
          WHATSAPP_NUMBER = config.wa;
        }
        if (config.mp) {
          localStorage.setItem("miri_mp_link", config.mp);
          MERCADO_PAGO_LINK = config.mp;
        }
      }
    });

    // Cargar cambios visuales desde la nube
    cloudFetch("page_changes").then(data => {
      if (data && data.length > 0) {
        data.forEach(item => {
          const pageId = item.id;
          const remoteData = item.data;
          const localStr = localStorage.getItem(`miri_changes_${pageId}`);
          
          // Si no hay cambios locales, o si los remotos son más nuevos, actualizamos
          // Para simplificar, priorizaremos la nube si está habilitada
          localStorage.setItem(`miri_changes_${pageId}`, JSON.stringify(remoteData));
        });
        applySavedChanges();
      }
    });
  }

  // 1. Sincronización manual/fallback con miri_data.json
  const timestamp = new Date().getTime();
  return fetch(`miri_data.json?v=${timestamp}`)
    .then(response => {
      if (!response.ok) throw new Error("No data file");
      return response.json();
    })
    .then(data => {
      if (data) {
        let updated = false;
        
        // Sincronizar configuración general
        if (data.config) {
          const localWa = localStorage.getItem("miri_wa_number");
          const localMp = localStorage.getItem("miri_mp_link");

          // Solo actualizamos si force es true o si NO hay datos locales previos
          if (force || !localWa) {
            if (data.config.wa) {
              localStorage.setItem("miri_wa_number", data.config.wa);
              WHATSAPP_NUMBER = data.config.wa;
              updated = true;
            }
          }
          if (force || !localMp) {
            if (data.config.mp) {
              localStorage.setItem("miri_mp_link", data.config.mp);
              MERCADO_PAGO_LINK = data.config.mp;
              updated = true;
            }
          }
        }
        
        // Sincronizar turnos (MEZCLAR en lugar de sobrescribir)
        if (data.bookings) {
          const localBookings = JSON.parse(localStorage.getItem("bookedSlots") || "{}");
          const remoteBookings = data.bookings;
          
          // Mezclamos: los remotos son la base, pero mantenemos los locales que no estén en remotos
          // En una app estática, esto es lo mejor que podemos hacer para evitar que "desaparezcan"
          // turnos recién reservados antes de subirlos a GitHub.
          const mergedBookings = { ...remoteBookings };
          
          Object.keys(localBookings).forEach(date => {
            if (!mergedBookings[date]) {
              mergedBookings[date] = localBookings[date];
              updated = true;
            } else {
              // Si la fecha ya existe, mezclamos los horarios
              const localSlots = localBookings[date];
              const remoteSlots = mergedBookings[date];
              const combinedSlots = Array.from(new Set([...remoteSlots, ...localSlots]));
              
              if (combinedSlots.length > remoteSlots.length) {
                mergedBookings[date] = combinedSlots;
                updated = true;
              }
            }
          });

          localStorage.setItem("bookedSlots", JSON.stringify(mergedBookings));
        }

        // Sincronizar cambios visuales de cada página
        if (data.changes) {
          Object.keys(data.changes).forEach(p => {
            const local = localStorage.getItem(`miri_changes_${p}`);
            const remoteStr = JSON.stringify(data.changes[p]);
            
            if (force || !local) {
              localStorage.setItem(`miri_changes_${p}`, remoteStr);
              updated = true;
            }
          });
        }
        
        if (updated) {
          applySavedChanges();
          if (force) {
            alert("¡Sincronización completada con éxito!");
            location.reload();
          }
        } else if (force) {
          alert("Tu versión local ya está actualizada.");
        }
      }
    })
    .catch(err => {
      console.log("Aviso: No se cargaron cambios desde GitHub (archivo no encontrado o sin internet).");
      if (force) alert("No se pudo conectar con GitHub. Verifica que hayas subido el archivo miri_data.json.");
    });
};

// Aplicar cambios al cargar cualquier página
document.addEventListener('DOMContentLoaded', () => {
  // 1. Aplicar cambios locales inmediatamente (prioridad absoluta para el editor)
  applySavedChanges();

  // 2. Sincronizar suavemente: SOLO si no hay datos locales, cargamos los de la nube
  syncWithCloud(false);
});

const renderAdminBookings = () => {
  const adminBookingsTable = document.getElementById("adminBookingsTable");
  if (!adminBookingsTable) return;
  adminBookingsTable.innerHTML = "";
  
  const bookedSlots = JSON.parse(localStorage.getItem("bookedSlots") || "{}");
  
  Object.keys(bookedSlots).forEach(date => {
    bookedSlots[date].forEach(time => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${date}</td>
        <td>${time}</td>
        <td><button class="btn-admin btn-delete" onclick="releaseSlot('${date}', '${time}')">Liberar</button></td>
      `;
      adminBookingsTable.appendChild(row);
    });
  });

  if (Object.keys(bookedSlots).length === 0) {
    adminBookingsTable.innerHTML = "<tr><td colspan='3' style='text-align:center'>No hay turnos reservados.</td></tr>";
  }
};

window.releaseSlot = (date, time) => {
  const bookedSlots = JSON.parse(localStorage.getItem("bookedSlots") || "{}");
  if (bookedSlots[date]) {
    bookedSlots[date] = bookedSlots[date].filter(t => t !== time);
    if (bookedSlots[date].length === 0) delete bookedSlots[date];
    localStorage.setItem("bookedSlots", JSON.stringify(bookedSlots));
    
    // También borrar de la nube si está habilitada
    if (isCloudEnabled()) {
      cloudDelete("bookings", `${date}-${time}`).then(ok => {
        if (ok) console.log("Turno liberado en la nube automáticamente.");
      });
    }

    renderAdminBookings();
    
    // Actualizar el calendario si estamos en la página de reservas
    if (currentPage === "reservar") {
      renderSlots(date);
    }
  }
};
