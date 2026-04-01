let WHATSAPP_NUMBER = localStorage.getItem("miri_wa_number") || "5491144123280";
const DEFAULT_MESSAGE = "Hola, quiero reservar un turno para extensiones de pestañas";
let MERCADO_PAGO_LINK = localStorage.getItem("miri_mp_link") || "https://mpago.la/1iJbsQy";

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
    
    // 1. Guardar en localStorage como reservado (simulación de cierre de horario)
    const bookedSlots = JSON.parse(localStorage.getItem("bookedSlots") || "{}");
    if (!bookedSlots[dateString]) bookedSlots[dateString] = [];
    bookedSlots[dateString].push(selectedTime);
    localStorage.setItem("bookedSlots", JSON.stringify(bookedSlots));

    // 2. Preparar mensaje de WhatsApp
    const message = `Hola! Quiero confirmar mi turno para el día ${dateString} a las ${selectedTime}. Ya realicé el pago de la seña.`;
    const waUrl = buildWaUrl(message);

    // 3. Abrir Mercado Pago en una pestaña y WhatsApp en otra (o después)
    // Para una mejor experiencia, primero abrimos MP y luego redirigimos a WA
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
          <h3>Sincronización con GitHub</h3>
          <p>Para que tus cambios (textos, fotos, configuración) se vean en internet para todos, debes descargar el archivo de cambios y subirlo a tu repositorio de GitHub.</p>
          <button class="button button-secondary btn-save-all" id="adminDownloadChanges">Descargar Archivo de Cambios</button>
          <p style="font-size:0.8rem; margin-top:10px;">⚠️ Nota: Luego sube este archivo a GitHub con el nombre <code>miri_data.json</code> en la misma carpeta que tus otros archivos.</p>
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

  if (adminDownloadBtn) {
    adminDownloadBtn.addEventListener("click", () => {
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
        if (saved) allData.changes[p] = JSON.parse(saved);
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
      
      alert("Configuración guardada correctamente.");
      location.reload();
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
  const tagsToEdit = 'p, h1, h2, h3, span, strong, small, .eyebrow, .button, .service-price, .testimonial strong';
  document.querySelectorAll(tagsToEdit).forEach(el => {
    // No hacer editables elementos del panel admin ni links de navegación
    if (!el.closest('.admin-overlay') && !el.closest('.nav')) {
      el.contentEditable = "true";
    }
  });

  // Manejar imágenes normales e imágenes de fondo
  const elementsWithImages = document.querySelectorAll('img, .hero-backdrop, .gallery-item');
  
  elementsWithImages.forEach(el => {
    if (!el.closest('.admin-overlay')) {
      el.classList.add('editable-img');
      el.addEventListener('click', function changeImg(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Determinar qué estamos editando: el elemento mismo, un img interno, o un fondo
        let targetEl = this;
        let isBg = false;
        
        const internalImg = this.querySelector('img');
        if (this.tagName.toLowerCase() === 'img') {
          targetEl = this;
        } else if (internalImg) {
          targetEl = internalImg;
        } else {
          isBg = true;
        }

        const currentSrc = isBg ? 
          getComputedStyle(targetEl).backgroundImage.slice(5, -2).replace(/"/g, "") : 
          targetEl.src;

        // Crear un input de archivo oculto para permitir subir desde la PC
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        
        fileInput.onchange = ev => {
          const file = ev.target.files[0];
          if (!file) return;

          // Validar tamaño (localStorage tiene límite de ~5MB total)
          if (file.size > 1.5 * 1024 * 1024) {
            alert("La imagen es muy pesada. Por favor elige una de menos de 1.5MB para que se pueda guardar correctamente.");
            return;
          }

          const reader = new FileReader();
          reader.onload = event => {
            const newSrc = event.target.result;
            if (isBg) {
              targetEl.style.backgroundImage = `url("${newSrc}")`;
              targetEl.style.backgroundSize = 'cover';
              targetEl.style.backgroundPosition = 'center';
            } else {
              targetEl.src = newSrc;
            }
          };
          reader.readAsDataURL(file);
        };
        
        const action = confirm("¿Quieres subir una imagen desde tu PC? (Aceptar) o ingresar una URL de internet? (Cancelar)");
        if (action) {
          fileInput.click();
        } else {
          const newUrl = prompt("Ingresa la URL de la nueva imagen:", currentSrc);
          if (newUrl) {
            if (isBg) {
              targetEl.style.backgroundImage = `url("${newUrl}")`;
              targetEl.style.backgroundSize = 'cover';
              targetEl.style.backgroundPosition = 'center';
            } else {
              targetEl.src = newUrl;
            }
          }
        }
      });
    }
  });

  document.getElementById('adminSaveVisual').addEventListener('click', () => {
    saveAllChanges();
    alert("¡Cambios guardados con éxito!");
    location.reload();
  });

  document.getElementById('adminCancelVisual').addEventListener('click', () => {
    location.reload();
  });
};

const saveAllChanges = () => {
  const pageId = currentPage || 'global';
  const changes = {
    texts: [],
    images: []
  };

  // Guardar textos
  document.querySelectorAll('[contenteditable="true"]').forEach((el, index) => {
    // Clonar para limpiar sin afectar el DOM actual
    const clone = el.cloneNode(true);
    // Remover contenteditable de sí mismo y de cualquier hijo
    clone.removeAttribute('contenteditable');
    clone.querySelectorAll('[contenteditable]').forEach(child => child.removeAttribute('contenteditable'));
    
    changes.texts.push({
      id: index,
      content: clone.innerHTML
    });
  });

  // Guardar imágenes
  const imagePromises = [];
  document.querySelectorAll('.editable-img').forEach((el, index) => {
    let targetEl = el;
    let isBg = false;
    
    const internalImg = el.querySelector('img');
    if (el.tagName.toLowerCase() === 'img') {
      targetEl = el;
    } else if (internalImg) {
      targetEl = internalImg;
    } else {
      isBg = true;
    }

    const src = isBg ? getComputedStyle(targetEl).backgroundImage.slice(5, -2).replace(/"/g, "") : targetEl.src;
    
    changes.images.push({
      id: index,
      src: src,
      isBg: isBg
    });
  });

  localStorage.setItem(`miri_changes_${pageId}`, JSON.stringify(changes));
};

const applySavedChanges = () => {
  const pageId = currentPage || 'global';
  const saved = localStorage.getItem(`miri_changes_${pageId}`);
  if (!saved) return;

  const changes = JSON.parse(saved);

  // Aplicar textos (mismo orden)
  const tagsToEdit = 'p, h1, h2, h3, span, strong, small, .eyebrow, .button, .service-price, .testimonial strong';
  const textElements = Array.from(document.querySelectorAll(tagsToEdit))
    .filter(el => !el.closest('.admin-overlay') && !el.closest('.nav'));
  
  changes.texts.forEach(item => {
    if (textElements[item.id]) {
      // Limpiar por seguridad cualquier contenteditable que se haya colado
      let content = item.content;
      if (typeof content === 'string') {
        content = content.replace(/contenteditable="true"/g, '').replace(/contenteditable/g, '');
      }
      textElements[item.id].innerHTML = content;
    }
  });

  // Aplicar imágenes (incluyendo fondos e imágenes internas)
  const elementsWithImages = Array.from(document.querySelectorAll('img, .hero-backdrop, .gallery-item'))
    .filter(el => !el.closest('.admin-overlay'));
    
  changes.images.forEach(item => {
    const el = elementsWithImages[item.id];
    if (el) {
      const internalImg = el.querySelector('img');
      if (item.isBg) {
        el.style.backgroundImage = `url("${item.src}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
      } else {
        if (el.tagName.toLowerCase() === 'img') {
          el.src = item.src;
        } else if (internalImg) {
          internalImg.src = item.src;
        }
      }
    }
  });
};

// Aplicar cambios al cargar cualquier página
document.addEventListener('DOMContentLoaded', () => {
  // Primero intentar cargar desde archivo JSON externo (GitHub)
  fetch('miri_data.json')
    .then(response => response.json())
    .then(data => {
      if (data) {
        // Sincronizar localStorage con los datos del archivo si son más recientes o no existen
        if (data.config) {
          if (data.config.wa) localStorage.setItem("miri_wa_number", data.config.wa);
          if (data.config.mp) localStorage.setItem("miri_mp_link", data.config.mp);
        }
        if (data.bookings) {
          localStorage.setItem("bookedSlots", JSON.stringify(data.bookings));
        }
        if (data.changes) {
          Object.keys(data.changes).forEach(p => {
            localStorage.setItem(`miri_changes_${p}`, JSON.stringify(data.changes[p]));
          });
        }
        // Aplicar los cambios después de sincronizar
        applySavedChanges();
      }
    })
    .catch(err => {
      console.log("No se encontró miri_data.json o error al cargar, usando datos locales.");
      applySavedChanges();
    });
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
    renderAdminBookings();
    
    // Actualizar el calendario si estamos en la página de reservas
    if (currentPage === "reservar") {
      renderSlots(date);
    }
  }
};
