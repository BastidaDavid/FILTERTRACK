// ==============================
// FILTERTRACK V1 - CLEAN FRONTEND
// ==============================

document.addEventListener('DOMContentLoaded', () => {
  console.log('SCRIPT V1 CLEAN LOADED')

  // -----------------------------
  // I18N SYSTEM
  // -----------------------------
  const translations = {
    es: {
      addMachineInfo: "Agrega información de maquina para generar filtro automático:",
      brand: "Marca",
      model: "Modelo",
      recommendedFilter: "Filtro recomendado",
      installDate: "Fecha de instalación del filtro",
      newBtn: "Nueva",
      editBtn: "Editar",
      archiveBtn: "Archivar",
      generalGlobal: "🏢 General (GLOBAL)",
      organization: "Organización",
      buildings: "Todos los Edificios",
      floors: "Todos los Pisos",
      months: "Meses",
      days: "Días",
      responsible: "Responsable (Iniciales)",
      notes: "Notas",
      saveFilterBtn: "Guardar Filtro",
      clearFieldsBtn: "Limpiar campos"
    },
    en: {
      addMachineInfo: "Add machine information to generate automatic filter:",
      brand: "Brand",
      model: "Model",
      recommendedFilter: "Recommended filter",
      installDate: "Filter installation date",
      newBtn: "New",
      editBtn: "Edit",
      archiveBtn: "Archive",
      generalGlobal: "🏢 General (GLOBAL)",
      organization: "Organization",
      buildings: "All Buildings",
      floors: "All Floors",
      months: "Months",
      days: "Days",
      responsible: "Responsible (Initials)",
      notes: "Notes",
      saveFilterBtn: "Save Filter",
      clearFieldsBtn: "Clear Fields"
    }
  };

  function applyTranslations() {
    const lang = localStorage.getItem('lang') || 'es';
    const elements = document.querySelectorAll('[data-i18n]');

    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[lang] && translations[lang][key]) {
        el.textContent = translations[lang][key];
      }
    });

    // Sidebar static texts
    const langData = translations[lang];


    const globalItem = document.querySelector('.categoria-general');
    if (globalItem) globalItem.textContent = langData.generalGlobal;

    const orgLabel = document.querySelector('[data-org-label]');
    if (orgLabel) orgLabel.textContent = langData.organization;

    // Translate Machines action buttons (top section)
    const btnNewMachine = document.getElementById('btn-nueva-maquina');
    if (btnNewMachine) btnNewMachine.textContent = langData.newBtn;

    const btnEditMachine = document.getElementById('btn-editar-maquina');
    if (btnEditMachine) btnEditMachine.textContent = langData.editBtn;

    const btnArchiveMachine = document.getElementById('btn-archivar-maquina');
    if (btnArchiveMachine) btnArchiveMachine.textContent = langData.archiveBtn;

    // Replace sidebar select default options dynamically
    document.querySelectorAll('select').forEach(select => {
      const firstOption = select.options[0];
      if (!firstOption) return;

      if (
        firstOption.text.includes('Todos los Edificios') ||
        firstOption.text.includes('All Buildings')
      ) {
        firstOption.text = langData.buildings;
      }

      if (
        firstOption.text.includes('Todos los Pisos') ||
        firstOption.text.includes('All Floors')
      ) {
        firstOption.text = langData.floors;
      }
    });

    // Translate machine search placeholder
    const searchInput = document.getElementById('machine-search');
    if (searchInput) {
      searchInput.placeholder = lang === 'es'
        ? 'Buscar máquina...'
        : 'Search machine...';
    }

    // Translate filter form placeholders
    const lifeMonthsInput = document.getElementById('life-months');
    if (lifeMonthsInput) {
      lifeMonthsInput.placeholder = lang === 'es'
        ? translations.es.months
        : translations.en.months;
    }

    const lifeDaysInput = document.getElementById('life-days');
    if (lifeDaysInput) {
      lifeDaysInput.placeholder = lang === 'es'
        ? translations.es.days
        : translations.en.days;
    }

    const responsibleInput = document.getElementById('responsible');
    if (responsibleInput) {
      responsibleInput.placeholder = lang === 'es'
        ? translations.es.responsible
        : translations.en.responsible;
    }

    const notesInput = document.getElementById('notes');
    if (notesInput) {
      notesInput.placeholder = lang === 'es'
        ? translations.es.notes
        : translations.en.notes;
    }

    // Translate filter action buttons
    const btnSaveFilter = document.querySelector('#form-filtro button[type="submit"]');
    if (btnSaveFilter) {
      btnSaveFilter.textContent = langData.saveFilterBtn;
    }

    const btnClear = document.getElementById('btn-limpiar');
    if (btnClear) {
      btnClear.textContent = langData.clearFieldsBtn;
    }

  }

  function toggleLanguage() {
    const current = localStorage.getItem('lang') || 'es';
    const next = current === 'es' ? 'en' : 'es';
    localStorage.setItem('lang', next);
    applyTranslations();
  }

  // AUTO-DETECT API BASE (works in production & local)
  const isLocal =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  const API_BASE = isLocal
    ? 'http://localhost:3000'
    : 'https://filtracore-api.onrender.com';
  const API_URL = `${API_BASE}/filters`

  const REPORTS_URL = `${API_BASE}/reports`

  const MACHINES_URL = `${API_BASE}/machines`
  const BRANDS_URL = `${API_BASE}/machine-brands`
  const MODELS_URL = `${API_BASE}/machine-models`

  let maquinaSeleccionadaId = null
  let categoriaActiva = null
  let vistaFiltroActiva = 'all'; // all | soon | expired
  // -----------------------------
  // FILTER VIEW BUTTONS (All / Soon / Expired)
  // -----------------------------
  const btnAll = document.getElementById('btn-all');
  const btnSoon = document.getElementById('btn-soon');
  const btnExpired = document.getElementById('btn-expired');

  function activarVistaFiltro(tipo) {
    vistaFiltroActiva = tipo;

    [btnAll, btnSoon, btnExpired].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    if (tipo === 'all' && btnAll) btnAll.classList.add('active');
    if (tipo === 'soon' && btnSoon) btnSoon.classList.add('active');
    if (tipo === 'expired' && btnExpired) btnExpired.classList.add('active');

    cargarFiltros();
  }

  if (btnAll) btnAll.addEventListener('click', () => activarVistaFiltro('all'));
  if (btnSoon) btnSoon.addEventListener('click', () => activarVistaFiltro('soon'));
  if (btnExpired) btnExpired.addEventListener('click', () => activarVistaFiltro('expired'));

  // -----------------------------
  // LOAD BRANDS & MODELS (Enterprise)
  // -----------------------------
  async function cargarMarcas() {
    try {
      const res = await secureFetch(BRANDS_URL)
      if (!res || !res.ok) return

      const marcas = await res.json()
      console.log('Marcas cargadas:', marcas);
      const selectMarca = document.getElementById('brand')
      const selectMarcaNueva = document.getElementById('new-machine-brand')

      if (selectMarca) {
        selectMarca.innerHTML = '<option value="">Selecciona marca</option>'
      }

      if (selectMarcaNueva) {
        selectMarcaNueva.innerHTML = '<option value="">Selecciona marca</option>'
      }

      // Agrupar marcas por categoría
      const categorias = {}

      marcas.forEach(m => {
        const category = m.category || 'OTHER'
        if (!categorias[category]) {
          categorias[category] = []
        }
        categorias[category].push(m)
      })

      // Crear optgroup por categoría (ordenadas)
      Object.keys(categorias)
        .sort()
        .forEach(cat => {
          const optgroupMain = document.createElement('optgroup')
          optgroupMain.label = cat.replace('_', ' ')

          const optgroupNueva = document.createElement('optgroup')
          optgroupNueva.label = cat.replace('_', ' ')

          categorias[cat]
            .sort((a, b) => a.brand_name.localeCompare(b.brand_name))
            .forEach(m => {
              const optionMain = document.createElement('option')
              optionMain.value = m.brand_id
              optionMain.textContent = m.brand_name

              const optionNueva = document.createElement('option')
              optionNueva.value = m.brand_id
              optionNueva.textContent = m.brand_name

              optgroupMain.appendChild(optionMain)
              optgroupNueva.appendChild(optionNueva)
            })

          if (selectMarca) {
            selectMarca.appendChild(optgroupMain)
          }

          if (selectMarcaNueva) {
            selectMarcaNueva.appendChild(optgroupNueva)
          }
        })
    } catch (err) {
      console.error('Error cargando marcas:', err)
    }
  }

  async function cargarModelos(brandId, targetSelectId = 'model') {
    if (!brandId || brandId === 'undefined') return
    try {
      const res = await secureFetch(`${MODELS_URL}?brand_id=${brandId}`)
      if (!res || !res.ok) return

      const modelos = await res.json()
      const selectModelo = document.getElementById(targetSelectId)
      if (!selectModelo) return

      selectModelo.innerHTML = '<option value="">Selecciona modelo</option>'
      selectModelo.disabled = false

      modelos.forEach(m => {
        const option = document.createElement('option')
        option.value = m.id
        option.textContent = m.model_name
        selectModelo.appendChild(option)
      })
    } catch (err) {
      console.error('Error cargando modelos:', err)
    }
  }

  // -----------------------------
  // AUTH TOKEN HELPER
  // -----------------------------
  function getToken() {
    // Try common storage keys in case login saved it differently
    let token =
      localStorage.getItem('token') ||
      localStorage.getItem('authToken') ||
      localStorage.getItem('access_token');

    // If token was saved as JSON, parse it
    try {
      if (token && token.startsWith('{')) {
        const parsed = JSON.parse(token);
        token = parsed.token || parsed.access_token || null;
      }
    } catch (e) {
      console.warn('Token parse warning:', e);
    }

    if (!token) {
      console.warn('No auth token found in localStorage');
      alert('Sesión expirada. Inicia sesión nuevamente.');
      window.location.href = 'login.html';
      return null;
    }

    return token;
  }

  // -----------------------------
  // SECURE FETCH (handles 401 auto logout)
  // -----------------------------
  async function secureFetch(url, options = {}) {
    const token = getToken()
    if (!token) return

    const currentLang = localStorage.getItem('lang') || 'es'

    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      'Accept-Language': currentLang
    };

    // Only attach JSON header if body exists
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401) {
      localStorage.removeItem('token')
      alert('Sesión expirada. Inicia sesión nuevamente.')
      window.location.href = 'login.html'
      return
    }

    return response
  }

  let filtroEditandoId = null
  let filtroActualId = null
  let recommendedModelFilterId = null

  // -----------------------------
  // Helpers
  // -----------------------------
  function formatISO(date) {
    if (!date) return ''

    const d = new Date(date)
    if (isNaN(d.getTime())) return ''

    return d.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  function calcularEstado(dueDate) {
    const hoy = new Date()
    const venc = new Date(dueDate)
    const diffMs = venc - hoy
    const dias = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    const lang = localStorage.getItem('lang') || 'es';

    // 🔴 Expired
    if (dias <= 0) {
      return { texto: lang === 'es' ? 'Vencido' : 'Expired', clase: 'estado-rojo', dias }
    }

    // 🟠 Critical (1 month or less)
    if (dias <= 30) {
      return { texto: lang === 'es' ? 'Crítico' : 'Critical', clase: 'estado-naranja', dias }
    }

    // 🟡 Soon (3 months or less)
    if (dias <= 90) {
      return { texto: lang === 'es' ? 'Próximo' : 'Soon', clase: 'estado-amarillo', dias }
    }

    // 🟢 OK
    return { texto: 'OK', clase: 'estado-verde', dias }
  }


  // -----------------------------
  // LOAD FILTERS
  // -----------------------------
  async function cargarFiltros() {
    try {
      let url;

      if (window.modoFundadorActivo) {
        url = `${API_URL}?includeArchived=true`;
      } else {
        if (!maquinaSeleccionadaId || maquinaSeleccionadaId === 'GENERAL') {
          url = API_URL; // GENERAL → show all filters
        } else {
          url = `${MACHINES_URL}/${maquinaSeleccionadaId}/filters`;
        }
      }

      const res = await secureFetch(url)

      if (!res) {
        console.error('No response from server (possibly 401)')
        return
      }

      if (!res.ok) {
        const errorText = await res.text()
        console.error('Error loading filters →', res.status, errorText)
        alert(`Error cargando filtros (${res.status}). Revisa consola.`)
        return
      }

      const filtros = await res.json()

      // ==============================
      // WATER CAPACITY CARD UPDATE
      // ==============================
      const waterCard = document.getElementById('machine-water-status');
      const waterValueEl = document.getElementById('water-current-value');
      const waterStateEl = document.getElementById('water-current-state');
      const waterLastEl = document.getElementById('water-last-reading');

      if (waterCard && waterValueEl && waterStateEl) {
        if (filtros.length > 0) {
          const firstFilter = filtros[0];

          // Priority: local manual value → backend value → 0
          const localUsed = Number(localStorage.getItem(`last_water_${maquinaSeleccionadaId}`));
          const used = Number.isFinite(localUsed) && localUsed > 0
            ? localUsed
            : Number(firstFilter.water_used_gallons || 0);

          // Priority: manual max from localStorage → backend capacity → 0
          let capacity = 0;
          const manualMax = localStorage.getItem(`water_max_${maquinaSeleccionadaId}`);
          if (manualMax && Number(manualMax) > 0) {
            capacity = Number(manualMax);
          } else {
            capacity = Number(firstFilter.water_capacity_gallons || 0);
          }

          if (!capacity || capacity <= 0) {
            waterValueEl.textContent = '-- / -- GAL';
            waterStateEl.textContent = 'No technical data';
            waterCard.classList.remove('psi-normal','psi-warning','psi-critical');
            if (waterLastEl) waterLastEl.textContent = '';
          } else {
            const remaining = Math.max(0, capacity - used);
            const percentRemaining = Math.round((remaining / capacity) * 100);

            waterValueEl.textContent = `${used} / ${capacity} GAL`;
            waterStateEl.textContent = `${percentRemaining}% Remaining`;

            const lastUpdate = localStorage.getItem(`last_water_update_${maquinaSeleccionadaId}`);
            if (waterLastEl && lastUpdate) {
              waterLastEl.textContent = new Date(lastUpdate).toLocaleString();
            }

            waterCard.classList.remove('psi-normal','psi-warning','psi-critical');

            if (percentRemaining > 60) {
              waterCard.classList.add('psi-normal');
            } else if (percentRemaining > 30) {
              waterCard.classList.add('psi-warning');
            } else {
              waterCard.classList.add('psi-critical');
            }
          }
        } else {
          waterValueEl.textContent = '-- / -- GAL';
          waterStateEl.textContent = 'No filters';
          waterCard.classList.remove('psi-normal','psi-warning','psi-critical');
          if (waterLastEl) waterLastEl.textContent = '';
        }
      }

      // Apply global category filter if selected
      let filtrosFiltrados = filtros

      if (categoriaActiva && !maquinaSeleccionadaId) {
        filtrosFiltrados = filtros.filter(f =>
          f.machine_id && f.machine_id.startsWith(categoriaActiva)
        )
      }

      // ==============================
      // PRIORITY SORT (Expired → Soon → OK)
      // ==============================
      filtrosFiltrados.sort((a, b) => {

        const estadoA = calcularEstado(a.due_date);
        const estadoB = calcularEstado(b.due_date);

        const getPriority = (estado) => {
          if (estado.clase === 'estado-rojo') return 1;     // Expired
          if (estado.clase === 'estado-naranja') return 2;  // Upcoming
          return 3;                                         // OK
        };

        const diff = getPriority(estadoA) - getPriority(estadoB);

        if (diff !== 0) return diff;

        // If same priority → sort by closest due date
        return new Date(a.due_date) - new Date(b.due_date);
      });

      // ==============================
      // KPI CALCULATION (Dashboard Cards)
      // ==============================

      let total = filtrosFiltrados.length
      let proximos = 0
      let criticos = 0
      let sumaVida = 0

      filtrosFiltrados.forEach(f => {
        const estado = calcularEstado(f.due_date)

        // KPI classification aligned with UI badges
        if (estado.clase === 'estado-amarillo') proximos++      // Soon (<=90 days)
        if (estado.clase === 'estado-naranja') criticos++       // Critical (<=30 days)
        if (estado.clase === 'estado-rojo') criticos++          // Expired

        const install = new Date(f.install_date)
        const due = new Date(f.due_date)
        const hoy = new Date()

        const totalVida = due - install
        const vidaRestante = due - hoy

        if (totalVida > 0) {
          const porcentaje = Math.max(
            0,
            Math.min(100, (vidaRestante / totalVida) * 100)
          )
          sumaVida += porcentaje
        }
      })

      const promedioVida = total > 0
        ? Math.round(sumaVida / total)
        : 0

      const kpiTotal = document.getElementById('kpi-total')
      const kpiWarning = document.getElementById('kpi-warning')
      const kpiCritical = document.getElementById('kpi-critical')
      const kpiAverage = document.getElementById('kpi-average')

      if (kpiTotal) kpiTotal.textContent = total
      if (kpiWarning) kpiWarning.textContent = proximos
      if (kpiCritical) kpiCritical.textContent = criticos
      if (kpiAverage) kpiAverage.textContent = promedioVida + '%'

      // ==============================
      // FILTER VIEW COUNTERS (Todos / Próximos / Vencidos)
      // ==============================
      const countAll = document.getElementById('count-all')
      const countProximo = document.getElementById('count-proximo')
      const countVencido = document.getElementById('count-vencido')

      if (countAll) countAll.textContent = total
      if (countProximo) countProximo.textContent = proximos
      if (countVencido) countVencido.textContent = criticos

      // ==============================
      // APPLY VIEW FILTER (UI only)
      // ==============================
      let filtrosRender = [...filtrosFiltrados];

      if (vistaFiltroActiva === 'soon') {
        filtrosRender = filtrosRender.filter(f => {
          const estado = calcularEstado(f.due_date);
          return estado.clase === 'estado-naranja';
        });
      }

      if (vistaFiltroActiva === 'expired') {
        filtrosRender = filtrosRender.filter(f => {
          const estado = calcularEstado(f.due_date);
          return estado.clase === 'estado-rojo';
        });
      }

      const tbody = document.querySelector('#tabla-filtros tbody')
      if (!tbody) return
      tbody.innerHTML = ''

      filtrosRender.forEach(f => {
        const estado = calcularEstado(f.due_date)

        const tr = document.createElement('tr')
        // make row clickable to jump to its machine
        tr.dataset.machineId = f.machine_id
        tr.style.cursor = 'pointer'

        tr.addEventListener('click', (e) => {

          // ignore clicks on action buttons
          if (e.target.closest('.btn-accion')) return

          const machineId = tr.dataset.machineId

          console.log('Go to machine:', machineId)

          // set selected machine
          maquinaSeleccionadaId = machineId

          // load machine data
          if (typeof cargarDatosMaquina === 'function') {
            cargarDatosMaquina(machineId)
          }

          // reload filters for that machine
          if (typeof cargarFiltros === 'function') {
            cargarFiltros()
          }

          // highlight machine in sidebar
          document.querySelectorAll('.machine-item').forEach(el => {
            el.classList.remove('activa')

            if (el.dataset.machineId === machineId) {
              el.classList.add('activa')
            }
          })

        })
        tr.innerHTML = `
          <td>${f.filter_id}</td>
          <td>${f.machine_id || '-'}</td>
          <td>${f.area || '-'}</td>
          <td>${f.serial_number || '-'}</td>
          <td>${f.location || '-'}</td>
          <td>${f.brand || '-'}</td>
          <td>${f.model || '-'}</td>
          <td>${f.filter_name || '-'}</td>
          <td>
            <div class="fecha-install">${formatISO(f.install_date)}</div>
          </td>
          <td>
            <div class="fecha-due">${formatISO(f.due_date)}</div>
          </td>
          <td>
            <span class="badge ${estado.clase}">
              ${estado.texto}
              <div class="dias-restantes">
                ${estado.dias} ${localStorage.getItem('lang') === 'es' ? 'días' : 'days'}
              </div>
            </span>
          </td>
          <td class="acciones-cell">
            <div class="acciones-top">
              <button class="btn-accion editar" onclick="editarFiltro('${f.filter_id}')" title="Editar">
                ✏️
              </button>
              <button class="btn-accion historial" onclick="verHistorial('${f.filter_id}')" title="Historial">
                🕘
              </button>
            </div>
            <div class="acciones-bottom">
              <button class="btn-accion gestionar" onclick="gestionarFiltro('${f.filter_id}')" title="Manage / Replace">
                🔄
              </button>
            </div>
          </td>
        `
        tbody.appendChild(tr)
      })
    } catch (err) {
      console.error('Error cargando filtros:', err)
      alert('No se pudo conectar con el servidor.')
    }
  }

  // -----------------------------
  // LOAD MACHINES (SIDEBAR)
  // -----------------------------
  async function cargarMaquinas() {
    try {
      const url = window.modoFundadorActivo
        ? `${MACHINES_URL}?includeArchived=true`
        : MACHINES_URL;

      const res = await secureFetch(url)
      if (!res || !res.ok) return

      const maquinas = await res.json()
      console.log('Máquinas cargadas:', maquinas);

      const lista = document.getElementById('lista-maquinas')
      if (!lista) return
      lista.innerHTML = ''

      // ==============================
      // TOP GLOBAL BUTTONS (SIMPLE STYLE)
      // ==============================

      // GENERAL GLOBAL
      const globalItem = document.createElement('div')
      globalItem.className = 'machine-item categoria-general'
      const lang = localStorage.getItem('lang') || 'es';
      globalItem.textContent = translations[lang].generalGlobal;

      globalItem.addEventListener('click', () => {
        categoriaActiva = null
        maquinaSeleccionadaId = null

        const formFiltro = document.getElementById('form-filtro');
        if (formFiltro) {
          formFiltro.style.display = 'none';
        }

        // Hide PSI section when GLOBAL selected
        const psiCard = document.getElementById('machine-psi-status');
        const psiTitle = document.querySelector('.psi-section-title');
        const psiGauge = document.getElementById('machine-psi-gauge');

        if (psiCard) psiCard.style.display = 'none';
        if (psiTitle) psiTitle.style.display = 'none';
        if (psiGauge) psiGauge.style.display = 'none';

        // Hide WATER section when GLOBAL selected
        const waterCard = document.getElementById('machine-water-status');
        const waterTitle = document.querySelector('.water-section-title');

        if (waterCard) waterCard.style.display = 'none';
        if (waterTitle) waterTitle.style.display = 'none';

        document.querySelectorAll('.machine-item')
          .forEach(el => el.classList.remove('activa'))

        globalItem.classList.add('activa')

        const btnEditar = document.getElementById('btn-editar-maquina')
        const btnArchivar = document.getElementById('btn-archivar-maquina')

        if (btnEditar) btnEditar.disabled = true
        if (btnArchivar) btnArchivar.disabled = true

        const gaugeContainer = document.getElementById('machine-psi-gauge');
        if (gaugeContainer) gaugeContainer.style.display = 'none';

        cargarFiltros()
      })

      lista.appendChild(globalItem)


      // Agrupar por categoría
      const grouped = maquinas.reduce((acc, m) => {
        const category = m.category || 'OTHER'
        if (!acc[category]) {
          acc[category] = []
        }
        acc[category].push(m)
        return acc
      }, {})

      Object.keys(grouped).forEach(category => {

        // Crear título de sección
        const sectionTitle = document.createElement('div')
        sectionTitle.className = 'machine-category-title'
        sectionTitle.textContent = category
        lista.appendChild(sectionTitle)

        grouped[category]
          .filter(m => m.machine_id !== 'GENERAL')
          .forEach(m => {
            const item = document.createElement('div')
            item.className = 'machine-item'

            // Only use machine_id
            const machineKey = m.machine_id

            item.dataset.machineId = machineKey

            if (maquinaSeleccionadaId === machineKey) {
              item.classList.add('activa')
            }

            item.innerHTML = `
              <div>
                <span>${machineKey}</span>
                <span>${m.area || ''}</span>
              </div>
            `

            item.addEventListener('click', () => {
              if (machineKey === 'GENERAL') {
                maquinaSeleccionadaId = null;
              } else {
                maquinaSeleccionadaId = machineKey;
              }

              const formFiltro = document.getElementById('form-filtro');
              if (formFiltro) {
                formFiltro.style.display = maquinaSeleccionadaId ? 'block' : 'none';
              }

              // Show PSI section when real machine selected
              const psiCard = document.getElementById('machine-psi-status');
              const psiTitle = document.querySelector('.psi-section-title');
              const psiGauge = document.getElementById('machine-psi-gauge');

              if (psiCard) psiCard.style.display = 'block';
              if (psiTitle) psiTitle.style.display = 'block';
              if (psiGauge) psiGauge.style.display = 'block';

              // Show WATER section when real machine selected
              const waterCard = document.getElementById('machine-water-status');
              const waterTitle = document.querySelector('.water-section-title');

              if (waterCard) waterCard.style.display = 'block';
              if (waterTitle) waterTitle.style.display = 'block';

              document.querySelectorAll('.machine-item')
                .forEach(el => el.classList.remove('activa'))

              item.classList.add('activa')

              // Enable external action buttons when machine selected
              const btnEditar = document.getElementById('btn-editar-maquina')
              const btnArchivar = document.getElementById('btn-archivar-maquina')

              if (btnEditar) {
                if (machineKey === 'GENERAL') {
                  btnEditar.disabled = true;
                } else {
                  btnEditar.disabled = false;
                  btnEditar.onclick = () => editarMaquina(machineKey);
                }
              }

              if (btnArchivar) {
                if (machineKey === 'GENERAL') {
                  btnArchivar.disabled = true;
                } else {
                  btnArchivar.disabled = false;
                  btnArchivar.onclick = () => eliminarMaquina(machineKey);
                }
              }

              const titulo = document.getElementById('titulo-maquina')
              if (titulo) {
                titulo.textContent = `Máquina seleccionada: ${machineKey}`
              }

              cargarFiltros()
              cargarDatosMaquina(machineKey)
            })

            lista.appendChild(item)
          })
      })

      // Auto-select first REAL machine (skip GLOBAL)
      if (!maquinaSeleccionadaId && maquinas.length > 0) {
        const firstRealMachine = Array.from(document.querySelectorAll('.machine-item'))
          .find(el => !el.classList.contains('categoria-general'));

        if (firstRealMachine) {
          firstRealMachine.click();
        }
      }
    } catch (err) {
      console.error('Error cargando máquinas:', err)
    }

    // -----------------------------
    // SIDEBAR LIVE SEARCH
    // -----------------------------
    const searchInput = document.getElementById('machine-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        const searchValue = this.value.toLowerCase();
        const machineItems = document.querySelectorAll('.machine-item');

        machineItems.forEach(item => {
          const text = item.textContent.toLowerCase();
          item.style.display = text.includes(searchValue) ? 'block' : 'none';
        });
      });
    }
  }

  // -----------------------------
  // LOAD MACHINE DATA (Auto-fill form)
  // -----------------------------
  async function cargarDatosMaquina(machineId) {
    try {
      const res = await secureFetch(`${MACHINES_URL}/${machineId}`);
      if (!res || !res.ok) return;

      const machine = await res.json();
      // ===== PSI WITH MAX LIMIT =====
      const psiCard = document.getElementById('machine-psi-status');
      const psiValueEl = document.getElementById('psi-current-value');
      const psiStateEl = document.getElementById('psi-current-state');
      const psiLastEl = document.getElementById('psi-last-reading');

      // ===== PSI HISTORY LOGGER =====
      function logPSIEvent(machineId, psi, max, type = 'MANUAL_CHECK', note = '') {
        try {
          const key = `psi_history_${machineId}`
          const history = JSON.parse(localStorage.getItem(key) || '[]')

          const percent = max ? Math.round((psi / max) * 100) : null

          history.unshift({
            psi: Number(psi),
            max: Number(max),
            percent,
            date: new Date().toISOString(),
            type,
            note
          })

          // keep last 50
          localStorage.setItem(key, JSON.stringify(history.slice(0, 50)))

          // store last PSI reading
          localStorage.setItem(`last_psi_${machineId}`, String(Number(psi)))


        } catch (e) {
          console.error('PSI log error', e)
        }
      }

      function getMaxPSI(machineId) {
        const key = `max_psi_${machineId || 'GLOBAL'}`;
        const stored = localStorage.getItem(key);

        if (stored === null) {
          return 100;
        }

        const value = Number(stored);

        if (!Number.isFinite(value) || value <= 0) {
          return 100;
        }

        return value;
      }

      // ===== OPEN / CLOSE MAX PSI MODAL =====
      const btnPsiMax = document.getElementById('btn-psi-max');
      const modalPsiMax = document.getElementById('modal-psi-max');
      const btnCancelMaxPsi = document.getElementById('btn-cancel-max-psi');

      if (btnPsiMax && modalPsiMax) {
        btnPsiMax.onclick = () => {
          if (!machine.machine_id) return;
          modalPsiMax.classList.remove('hidden');
        };
      }

      if (btnCancelMaxPsi && modalPsiMax) {
        btnCancelMaxPsi.onclick = () => {
          modalPsiMax.classList.add('hidden');
        };
      }

      const saveMaxBtn = document.getElementById('btn-save-max-psi');
      const maxPsiInput = document.getElementById('max-psi-input');

      if (saveMaxBtn && maxPsiInput) {
        const key = `max_psi_${machine.machine_id || 'GLOBAL'}`;
        const currentMax = getMaxPSI(machine.machine_id);
        maxPsiInput.value = currentMax;

        saveMaxBtn.onclick = () => {
          const value = Number(maxPsiInput.value);

          if (!Number.isFinite(value) || value <= 0) {
            alert('PSI inválido');
            return;
          }

          localStorage.setItem(key, value);
          document.getElementById('modal-psi-max')?.classList.add('hidden');
          // Log PSI event after saving new max PSI
          logPSIEvent(machine.machine_id, machine.psi_current || 0, value);

          // update UI immediately without duplicating listeners
          cargarDatosMaquina(machine.machine_id);
        };
      }

      function classifyPSI(psi, max) {
        const lang = localStorage.getItem('lang') || 'es';

        if (!max || max <= 0) max = 100;

        let percent = psi / max;
        if (!Number.isFinite(percent)) percent = 0;
        percent = Math.max(0, Math.min(percent, 1));

        if (percent >= 0.75) {
          return { label: 'NORMAL', className: 'psi-normal' };
        }

        if (percent >= 0.5) {
          return { label: lang === 'es' ? 'REVISAR' : 'CHECK', className: 'psi-warning' };
        }

        return { label: lang === 'es' ? 'CRÍTICO' : 'CRITICAL', className: 'psi-critical' };
      }

      // ==============================
      // PSI HISTORY MODAL
      // ==============================
      const btnPsiHistory = document.getElementById('btn-psi-history');
      const psiHistoryModal = document.getElementById('modal-psi-history');
      const psiHistoryContainer = document.getElementById('psi-history-container');
      const btnCloseHistory = document.getElementById('btn-close-history');
      const btnPrintHistory = document.getElementById('btn-print-history');
      const btnDownloadHistory = document.getElementById('btn-download-history');
      const btnShareHistory = document.getElementById('btn-share-history');

      function getPSIHistory(machineId) {
        const key = `psi_history_${machineId || 'GLOBAL'}`;
        return JSON.parse(localStorage.getItem(key) || '[]');
      }

      function renderPSIHistory(machineId) {
        if (!psiHistoryContainer) return;

        const data = getPSIHistory(machineId);

        if (!data.length) {
          psiHistoryContainer.innerHTML = '<div style="opacity:.6">No hay registros</div>';
          return;
        }

        psiHistoryContainer.innerHTML = data.map(row => {

          const percent = row.percent ?? 0;

          let status = 'CRÍTICO';
          let statusClass = 'psi-critical';

          if (percent >= 75) {
            status = 'NORMAL';
            statusClass = 'psi-normal';
          } else if (percent >= 50) {
            status = 'REVISAR';
            statusClass = 'psi-warning';
          }

          return `
            <div class="psi-history-row">
              <div class="psi-history-left">
                <div class="psi-history-value">
                  ${row.psi} <span>PSI</span>
                </div>
                <div class="psi-history-meta">
                  ${new Date(row.date).toLocaleString()}
                </div>
              </div>

              <div class="psi-history-right">
                <div class="psi-history-percent">
                  ${percent}%
                </div>
                <div class="psi-history-status ${statusClass}">
                  ${status}
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

      if (btnPsiHistory) {
        btnPsiHistory.onclick = () => {
          renderPSIHistory(maquinaSeleccionadaId);
          if (psiHistoryModal) psiHistoryModal.classList.remove('hidden');
        };
      }

      if (btnCloseHistory) {
        btnCloseHistory.onclick = () => {
          if (psiHistoryModal) psiHistoryModal.classList.add('hidden');
        };
      }

      if (btnPrintHistory) {
        btnPrintHistory.onclick = () => {
          window.print();
        };
      }

      if (btnDownloadHistory) {
        btnDownloadHistory.onclick = () => {
          const data = getPSIHistory(maquinaSeleccionadaId);

          let csv = 'PSI,MAX,Percent,Date\n';
          data.forEach(r => {
            csv += `${r.psi},${r.max},${r.percent},${r.date}\n`;
          });

          const blob = new Blob([csv], { type: 'text/csv' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'psi-history.csv';
          a.click();
        };
      }

      if (btnShareHistory) {
        btnShareHistory.onclick = async () => {
          const data = getPSIHistory(maquinaSeleccionadaId);

          const text = data
            .slice(0,10)
            .map(r => `${r.psi}/${r.max} PSI - ${r.percent}%`)
            .join('\n');

          if (navigator.share) {
            try {
              await navigator.share({
                title: 'FiltraCore PSI Report',
                text
              });
            } catch (e) {
              console.log('Share cancelado');
            }
          } else {
            alert('Sharing no disponible en este dispositivo');
          }
        };
      }

      if (psiCard) {
        psiCard.style.display = 'block';

        const max = getMaxPSI(machine.machine_id);


        if (machine.psi_current != null) {
          const psi = Number(machine.psi_current);

          psiValueEl.textContent = `${psi} / ${max} PSI`;

          // Log automatic sensor reading
          logPSIEvent(machine.machine_id, psi, max, 'AUTO_SENSOR');

          const state = classifyPSI(psi, max);
          psiStateEl.textContent = state.label;

          psiCard.classList.remove('psi-normal','psi-warning','psi-critical');
          psiStateEl.classList.remove('psi-normal','psi-warning','psi-critical');

          // Apply same state to both elements so CSS colors stay consistent
          psiCard.classList.add(state.className);
          psiStateEl.classList.add(state.className);

        } else {
          psiValueEl.textContent = `-- / ${max} PSI`;
          psiStateEl.textContent = 'ACTIVE';
        }

        psiLastEl.textContent = '';
      }
      // If machine has no brand/model, try to infer from its filters
      if (!machine.brand_id || !machine.model_id) {
        const filtrosRes = await secureFetch(`${MACHINES_URL}/${machineId}/filters`);
        if (filtrosRes && filtrosRes.ok) {
          const filtros = await filtrosRes.json();
          if (filtros.length > 0) {
            machine.brand_id = filtros[0].brand_id || null;
            machine.model_id = filtros[0].model_id || null;
          }
        }
      }

      const titulo = document.getElementById('titulo-maquina');
      if (titulo) {
        titulo.textContent = `${machine.machine_id} - ${machine.area || ''}`;
      }

      // Autocomplete base info
      const machineIdInput = document.getElementById('machine-id');
      const area = document.getElementById('area');
      const location = document.getElementById('location');
      const serial = document.getElementById('serial-number');
      const building = document.getElementById('machine-building');
      const floor = document.getElementById('machine-floor');
      const zone = document.getElementById('machine-zone');

      if (machineIdInput) machineIdInput.value = machine.machine_id || '';
      
      if (area) area.value = machine.area || '';
      if (location) location.value = machine.location || '';
      if (serial) serial.value = machine.serial_number || '';
      if (building) building.value = machine.building || '';
      if (floor) floor.value = machine.floor || '';
      if (zone) zone.value = machine.zone || '';

      // Auto-open machine form panel when machine is selected
      const formPanel = document.getElementById('machine-form-collapsible');
      if (formPanel) {
        formPanel.style.display = 'block';
      }

      // Load brand + model if exist
      if (machine.brand_id) {
        const selectMarca = document.getElementById('brand');
        if (selectMarca) {
          selectMarca.value = machine.brand_id;
          await cargarModelos(machine.brand_id);
        }
      }

      if (machine.model_id) {
        const selectModelo = document.getElementById('model');
        if (selectModelo) {
          selectModelo.value = machine.model_id;

          // Trigger change event to auto-load recommended filters
          selectModelo.dispatchEvent(new Event('change'));
        }
      }



    } catch (err) {
      console.error('Error loading machine data:', err);
    }
  }


  // -----------------------------
  // BRAND CHANGE EVENT
  // -----------------------------
  const selectMarca = document.getElementById('brand')
  if (selectMarca) {
    selectMarca.addEventListener('change', (e) => {
      const brandId = e.target.value
      if (brandId) {
        cargarModelos(brandId)
      }
    })
  }

  const selectMarcaNueva = document.getElementById('new-machine-brand')
  if (selectMarcaNueva) {
    selectMarcaNueva.addEventListener('change', (e) => {
      const brandId = e.target.value
      if (brandId) {
        cargarModelos(brandId, 'new-machine-model')
      }
    })
  }

  // -----------------------------
  // MODEL CHANGE EVENT (Show Recommended Filter)
  // -----------------------------
  const selectModelo = document.getElementById('model')
  if (selectModelo) {
    selectModelo.addEventListener('change', async (e) => {
      const modelId = e.target.value

      const suggestionDiv = document.getElementById('filter-suggestion')
      const filterNameDiv = document.getElementById('filter-name')
      const lifeInput = document.getElementById('life-months')

      if (!modelId) {
        recommendedModelFilterId = null
        if (suggestionDiv) suggestionDiv.style.display = 'none'
        if (filterNameDiv) filterNameDiv.textContent = ''

        // Reset MAIN technical sheet
        const resetIds = [
          'main-tech-filter-name',
          'main-tech-filter-life',
          'main-tech-filter-capacity',
          'main-tech-filter-micron',
          'main-tech-filter-chlorine',
          'main-tech-filter-flow',
          'main-tech-filter-psi'
        ];

        resetIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '—';
        });

        const notesReset = document.getElementById('main-tech-filter-notes');
        if (notesReset) {
          notesReset.textContent = 'Select a model to see full technical specifications.';
        }

        return
      }

      try {
        const res = await secureFetch(`${MODELS_URL}/${modelId}/filters`)
        if (!res || !res.ok) return

        const filters = await res.json()
        console.log("FILTER RECIBIDO:", filters);

        if (!filters.length) {
          recommendedModelFilterId = null
          if (suggestionDiv) suggestionDiv.style.display = 'none'
          return
        }

        // Take first recommended filter with technical data, else fallback to first
        const recommended = filters.find(f =>
          f.water_capacity_gallons ||
          f.micron_rating ||
          f.chlorine_capacity_gallons ||
          f.max_flow_rate_gpm
        ) || filters[0];
        recommendedModelFilterId = recommended.id || null

        if (filterNameDiv) {
          const lang = localStorage.getItem('lang') || 'es';
          const monthWord = lang === 'es' ? 'meses' : 'months';
          filterNameDiv.textContent = `${recommended.filter_name} (${recommended.life_months} ${monthWord})`;
        }

        if (lifeInput) {
          lifeInput.value = recommended.life_months
        }

        if (suggestionDiv) {
          suggestionDiv.style.display = 'block'
        }

        // ===============================
        // FILL MAIN FILTER TECHNICAL SHEET (RIGHT PANEL)
        // ===============================
        const nameElMain = document.getElementById('main-tech-filter-name');
        const lifeElMain = document.getElementById('main-tech-filter-life');
        const capacityElMain = document.getElementById('main-tech-filter-capacity');
        const micronElMain = document.getElementById('main-tech-filter-micron');
        const chlorineElMain = document.getElementById('main-tech-filter-chlorine');
        const flowElMain = document.getElementById('main-tech-filter-flow');
        const psiElMain = document.getElementById('main-tech-filter-psi');
        const notesElMain = document.getElementById('main-tech-filter-notes');

        if (nameElMain) nameElMain.textContent = recommended.filter_name || '—';
        if (lifeElMain) lifeElMain.textContent = recommended.life_months ? `${recommended.life_months} months` : '—';
        if (capacityElMain) capacityElMain.textContent = recommended.water_capacity_gallons ? `${recommended.water_capacity_gallons} GAL` : '—';
        if (micronElMain) micronElMain.textContent = recommended.micron_rating ? `${recommended.micron_rating} µm` : '—';
        if (chlorineElMain) chlorineElMain.textContent = recommended.chlorine_capacity_gallons ? `${recommended.chlorine_capacity_gallons} GAL` : '—';
        if (flowElMain) flowElMain.textContent = recommended.max_flow_rate_gpm ? `${recommended.max_flow_rate_gpm} GPM` : '—';
        if (psiElMain) psiElMain.textContent =
          (recommended.recommended_psi_min && recommended.recommended_psi_max)
            ? `${recommended.recommended_psi_min} - ${recommended.recommended_psi_max} PSI`
            : '—';
        if (notesElMain) notesElMain.textContent = recommended.notes || 'No additional notes.';

      } catch (err) {
        console.error('Error cargando filtro recomendado:', err)
      }
    })
  }

  // -----------------------------
  // NUEVA MAQUINA (MODAL PROFESIONAL)
  // -----------------------------
  const btnNuevaMaquina = document.getElementById('btn-nueva-maquina')
  const modalMachine = document.getElementById('modal-machine')
  const btnCancelMachine = document.getElementById('btn-cancel-machine')
  const formMachine = document.getElementById('form-machine')

  if (btnNuevaMaquina && modalMachine && formMachine) {

    // ==============================
    // AUTO-FILL FILTER TECH SHEET (Nueva Máquina Modal)
    // ==============================
    const selectModeloNuevoLocal = document.getElementById('new-machine-model');

    if (selectModeloNuevoLocal) {
      selectModeloNuevoLocal.addEventListener('change', async () => {
        const modelId = selectModeloNuevoLocal.value;

        const nameEl = document.getElementById('modal-tech-filter-name');
        const lifeEl = document.getElementById('modal-tech-filter-life');
        const capacityEl = document.getElementById('modal-tech-filter-capacity');
        const micronEl = document.getElementById('modal-tech-filter-micron');
        const chlorineEl = document.getElementById('modal-tech-filter-chlorine');
        const flowEl = document.getElementById('modal-tech-filter-flow');
        const psiEl = document.getElementById('modal-tech-filter-psi');
        const notesEl = document.getElementById('modal-tech-filter-notes');

        if (!modelId) {
          if (nameEl) nameEl.textContent = '—';
          if (lifeEl) lifeEl.textContent = '—';
          if (capacityEl) capacityEl.textContent = '—';
          if (micronEl) micronEl.textContent = '—';
          if (chlorineEl) chlorineEl.textContent = '—';
          if (flowEl) flowEl.textContent = '—';
          if (psiEl) psiEl.textContent = '—';
          if (notesEl) notesEl.textContent = 'Select a model to see technical specifications.';
          return;
        }

        try {
          const res = await secureFetch(`${MODELS_URL}/${modelId}/filters`);
          if (!res || !res.ok) return;

          const filters = await res.json();
          if (!filters.length) return;

          const f = filters.find(f =>
            f.water_capacity_gallons ||
            f.micron_rating ||
            f.chlorine_capacity_gallons ||
            f.max_flow_rate_gpm
          ) || filters[0];

          if (nameEl) nameEl.textContent = f.filter_name || '—';
          if (lifeEl) lifeEl.textContent = f.life_months ? `${f.life_months} months` : '—';
          if (capacityEl) capacityEl.textContent = f.water_capacity_gallons ? `${f.water_capacity_gallons} GAL` : '—';
          if (micronEl) micronEl.textContent = f.micron_rating ? `${f.micron_rating} µm` : '—';
          if (chlorineEl) chlorineEl.textContent = f.chlorine_capacity_gallons ? `${f.chlorine_capacity_gallons} GAL` : '—';
          if (flowEl) flowEl.textContent = f.max_flow_rate_gpm ? `${f.max_flow_rate_gpm} GPM` : '—';
          if (psiEl) psiEl.textContent =
            (f.recommended_psi_min && f.recommended_psi_max)
              ? `${f.recommended_psi_min} - ${f.recommended_psi_max} PSI`
              : '—';
          if (notesEl) notesEl.textContent = f.notes || 'No additional notes.';

        } catch (err) {
          console.error('Error loading filter technical sheet:', err);
        }
      });
    }

    // Abrir modal
    btnNuevaMaquina.addEventListener('click', () => {
      modalMachine.classList.remove('hidden')
    })

    // Cerrar modal
    if (btnCancelMachine) {
      btnCancelMachine.addEventListener('click', () => {
        modalMachine.classList.add('hidden')
      })
    }

    // Crear máquina
    formMachine.addEventListener('submit', async (e) => {
      e.preventDefault()
      // ==============================
      // COMPANY MACHINE LIMIT VALIDATION
      // ==============================
      try {
        const companyData = JSON.parse(localStorage.getItem('company') || 'null');

        if (companyData && companyData.machine_limit != null) {

          // Get current machines count
          const machinesRes = await secureFetch(MACHINES_URL);
          if (machinesRes && machinesRes.ok) {
            const machinesList = await machinesRes.json();
            const currentCount = machinesList.length;

            if (currentCount >= companyData.machine_limit) {
              alert(
                `Machine limit reached (${companyData.machine_limit}).\n` +
                `Upgrade your plan to add more machines.`
              );
              return;
            }
          }
        }
      } catch (limitError) {
        console.error('Machine limit validation error:', limitError);
      }

      const machineId = document.getElementById('new-machine-id')?.value.trim().toUpperCase()
      const area = document.getElementById('new-machine-area')?.value.trim()
      const location = document.getElementById('new-machine-location')?.value.trim()
      const serial = document.getElementById('new-machine-serial')?.value.trim()
      const building = document.getElementById('new-machine-building')?.value.trim()
      const floor = document.getElementById('new-machine-floor')?.value.trim()
      const zone = document.getElementById('new-machine-zone')?.value.trim()

      if (!machineId) {
        alert('El ID de la máquina es obligatorio')
        return
      }

      try {
        const res = await secureFetch(MACHINES_URL, {
          method: 'POST',
          body: JSON.stringify({
            machine_id: machineId,
            area: area || 'General',
            location: location || 'N/A',
            serial_number: serial || null,
            building: building || null,
            floor: floor || null,
            zone: zone || null,
            brand_id: document.getElementById('new-machine-brand')?.value
              ? parseInt(document.getElementById('new-machine-brand').value)
              : null,
            model_id: document.getElementById('new-machine-model')?.value
              ? parseInt(document.getElementById('new-machine-model').value)
              : null
          })
        })

        if (!res) return

        if (res.status === 409) {
          alert('Ya existe una máquina con ese ID.')
          return
        }

        if (!res.ok) {
          const errorText = await res.text()
          console.error('Error creando máquina:', errorText)
          alert('Error creando máquina. Revisa la consola.')
          return
        }

        modalMachine.classList.add('hidden')
        formMachine.reset()

        // Auto-select the newly created machine
        maquinaSeleccionadaId = machineId

        await cargarMaquinas()
        await cargarDatosMaquina(machineId)
        await cargarFiltros()

      } catch (err) {
        console.error('Error en creación de máquina:', err)
        alert('Error inesperado creando máquina.')
      }
    })
  }

  // -----------------------------
  // EDITAR MAQUINA (Enterprise)
  // -----------------------------
  window.editarMaquina = async function(machineId) {
    try {
      const res = await secureFetch(`${MACHINES_URL}/${encodeURIComponent(machineId)}`)
      if (!res || !res.ok) return

      const machine = await res.json()

      // Rellenar modal con datos actuales
      document.getElementById('new-machine-id').value = machine.machine_id
      document.getElementById('new-machine-id').disabled = true

      document.getElementById('new-machine-area').value = machine.area || ''
      document.getElementById('new-machine-location').value = machine.location || ''
      document.getElementById('new-machine-serial').value = machine.serial_number || ''
      document.getElementById('new-machine-building').value = machine.building || ''
      document.getElementById('new-machine-floor').value = machine.floor || ''
      document.getElementById('new-machine-zone').value = machine.zone || ''

      modalMachine.classList.remove('hidden')

      formMachine.onsubmit = async function(e) {
        e.preventDefault()

        const updateRes = await secureFetch(`${MACHINES_URL}/${machineId}`, {
          method: 'PUT',
          body: JSON.stringify({
            area: document.getElementById('new-machine-area').value,
            location: document.getElementById('new-machine-location').value,
            serial_number: document.getElementById('new-machine-serial').value,
            building: document.getElementById('new-machine-building').value,
            floor: document.getElementById('new-machine-floor').value,
            zone: document.getElementById('new-machine-zone').value
          })
        })

        if (!updateRes || !updateRes.ok) {
          alert('Error actualizando máquina')
          return
        }

        modalMachine.classList.add('hidden')
        document.getElementById('new-machine-id').disabled = false
        formMachine.reset()

        await cargarMaquinas()
        await cargarFiltros()
      }

    } catch (err) {
      console.error('Error editando máquina:', err)
    }
  };

  // -----------------------------
  // ELIMINAR MAQUINA (Enterprise)
  // -----------------------------
  window.eliminarMaquina = async function(machineId) {
    try {
      const confirmacion = confirm('¿Eliminar máquina? Esta acción no se puede deshacer.');
      if (!confirmacion) return;

      await secureFetch(`${MACHINES_URL}/${machineId}`, {
        method: 'DELETE'
      });

      if (maquinaSeleccionadaId === machineId) {
        maquinaSeleccionadaId = null;
      }

      // Disable external action buttons if machine deleted
      const btnEditar = document.getElementById('btn-editar-maquina')
      const btnArchivar = document.getElementById('btn-archivar-maquina')

      if (btnEditar) btnEditar.disabled = true
      if (btnArchivar) btnArchivar.disabled = true

      alert('Máquina eliminada correctamente');
      cargarMaquinas();
      cargarFiltros();

    } catch (err) {
      console.error('Error eliminando máquina:', err);
    }
  };

  // -----------------------------
  // CREATE / UPDATE FILTER
  // -----------------------------
  const formFiltro = document.getElementById('form-filtro')
  if (formFiltro) {
    formFiltro.addEventListener('submit', async (e) => {
      e.preventDefault()

      if (!maquinaSeleccionadaId) {
        alert('Selecciona una máquina antes de agregar un filtro')
        return
      }

      if (!recommendedModelFilterId) {
        alert('Selecciona un modelo para asignar el filtro recomendado.')
        return
      }

      // Auto-generate filter ID if empty (Machine-centric logic)
      const inputFilterId = document.getElementById('filter-id')?.value.trim() || ''
      const generatedFilterId = inputFilterId
        ? inputFilterId
        : `${maquinaSeleccionadaId}-${Date.now()}`

      const months = Number(document.getElementById('life-months').value) || 0;
      const days = Number(document.getElementById('life-days')?.value) || 0;

      // Send months and days separately so backend calculates exact lifespan
      const totalLifeMonths = months;

      const data = {
        filter_id: generatedFilterId,
        machine_id: maquinaSeleccionadaId,
        model_filter_id: recommendedModelFilterId,
        install_date: document.getElementById('install-date').value,
        life_months: months,
        life_days: days,
        responsible: document.getElementById('responsible').value.trim(),
        notes: document.getElementById('notes').value.trim()
      }

      let res;

      if (filtroEditandoId) {
        res = await secureFetch(`${API_URL}/${filtroEditandoId}`, {
          method: 'PUT',
          body: JSON.stringify(data)
        });
        filtroEditandoId = null;
      } else {
        res = await secureFetch(API_URL, {
          method: 'POST',
          body: JSON.stringify(data)
        });
      }

      if (!res || !res.ok) {
        const errorText = res ? await res.text() : 'No response from server';
        console.error('Error guardando filtro:', errorText);
        alert('Error al guardar el filtro. Revisa la consola.');
        return;
      }

      formFiltro.reset()
      cargarFiltros()
    })
  }

  // -----------------------------
  // EDIT (Right Panel Mode)
  // -----------------------------
  window.editarFiltro = async function (filterId) {

    const res = await secureFetch(`${API_URL}/${filterId}`);
    if (!res || !res.ok) return;

    const f = await res.json();

    const panel = document.getElementById('editFilterPanel');
    const historyPanel = document.getElementById('machineHistoryPanel');

    if (historyPanel) historyPanel.classList.remove('open');

    if (!panel) return;

    // Fill panel inputs
    const installInput = document.getElementById('edit-install-date');
    const monthsInput = document.getElementById('edit-life-months');
    const daysInput = document.getElementById('edit-life-days');
    const responsibleInput = document.getElementById('edit-responsible');
    const notesInput = document.getElementById('edit-notes');

    if (installInput) {
      installInput.value = f.install_date
        ? f.install_date.split('T')[0]
        : '';
    }

    const monthsPart = Number(f.life_months) || 0;
    const daysPart = Number(f.life_days) || 0;

    if (monthsInput) monthsInput.value = monthsPart;
    if (daysInput) daysInput.value = daysPart;

    if (responsibleInput) responsibleInput.value = f.responsible || '';
    if (notesInput) notesInput.value = f.notes || '';

    panel.classList.add('open');

    // Save handler (override each time safely)
    const btnSave = document.getElementById('btn-save-edit');
    if (btnSave) {
      btnSave.onclick = async function () {

        const updatedMonths = Number(monthsInput?.value) || 0;
        const updatedDays = Number(daysInput?.value) || 0;

        const updateRes = await secureFetch(`${API_URL}/${filterId}`, {
          method: 'PUT',
          body: JSON.stringify({
            install_date: installInput?.value,
            life_months: updatedMonths,
            life_days: updatedDays,
            responsible: responsibleInput?.value || '',
            notes: notesInput?.value || ''
          })
        });

        if (!updateRes || !updateRes.ok) {
          alert('Error updating filter');
          return;
        }

        panel.classList.remove('open');
        await cargarFiltros();
      };
    }
  };

  const btnCerrarEdit = document.getElementById('btn-cerrar-edit');
  if (btnCerrarEdit) {
    btnCerrarEdit.addEventListener('click', () => {
      const panel = document.getElementById('editFilterPanel');
      if (panel) panel.classList.remove('open');
    });
  }

  // -----------------------------
  // ARCHIVE
  // -----------------------------
  window.eliminarFiltro = async function (filterId) {
    if (!confirm('¿Archivar filtro?')) return

    await secureFetch(`${API_URL}/${filterId}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ responsible: 'UI', notes: 'Archived from UI' })
    })

    cargarFiltros()
  }

  // -----------------------------
  // MANAGE FILTER (Replace / Archive Panel Trigger)
  // -----------------------------
  window.gestionarFiltro = async function(filterId) {

    const replace = confirm('¿Deseas REEMPLAZAR el filtro actual?');

    if (replace) {
      await secureFetch(`${API_URL}/${filterId}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ responsible: 'UI', notes: 'Replaced from UI' })
      });

      filtroEditandoId = null;
      const form = document.getElementById('form-filtro');
      if (form) form.scrollIntoView({ behavior: 'smooth' });

      alert('Filtro archivado. Ahora instala el nuevo filtro.');
      return;
    }

    const archive = confirm('¿Deseas ARCHIVAR el filtro sin reemplazarlo?');

    if (archive) {
      await secureFetch(`${API_URL}/${filterId}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ responsible: 'UI', notes: 'Archived manually from Manage' })
      });

      await cargarFiltros();
      return;
    }

    // If user cancels both → do nothing
  }

  // -----------------------------
  // HISTORIAL
  // -----------------------------
  window.verHistorial = async function (filterId) {
    filtroActualId = filterId
    try {
      const res = await secureFetch(`${API_URL}/${filterId}/events`)
      if (!res || !res.ok) return

      const events = await res.json()

      const panel = document.getElementById('machineHistoryPanel')
      const content = document.getElementById('historyContent')

      if (!panel || !content) return

      content.innerHTML = ''

      events.forEach(ev => {
        const div = document.createElement('div')
        div.className = 'history-item'

        div.innerHTML = `
          <strong>${ev.event_type || 'EVENT'}</strong>
          <div>${formatISO(ev.event_date)}</div>
          <div>${ev.reason || '-'}</div>
          <small>${ev.responsible || '-'}</small>
        `

        content.appendChild(div)
      })

      panel.classList.add('open')

    } catch (err) {
      console.error('Error cargando historial:', err)
    }
  }

  // -----------------------------
  // ADD MANUAL EVENT
  // -----------------------------
  const formMantenimiento = document.getElementById('form-mantenimiento')
  if (formMantenimiento) {
    formMantenimiento.addEventListener('submit', async (e) => {
      e.preventDefault()

      if (!filtroActualId) {
        alert('Selecciona un filtro primero')
        return
      }

      await secureFetch(`${API_URL}/${filtroActualId}/events`, {
        method: 'POST',
        body: JSON.stringify({
          event_type: document.getElementById('mant-motivo').value || 'SERVICE',
          event_date: document.getElementById('mant-fecha').value,
          reason: document.getElementById('mant-motivo').value,
          responsible: document.getElementById('mant-responsable').value,
          notes: document.getElementById('mant-observaciones').value
        })
      })

      formMantenimiento.reset()
      verHistorial(filtroActualId)
      cargarFiltros()
    })
  }

  // -----------------------------
  // EXECUTIVE REPORT (PDF)
  // -----------------------------
  const btnReporteFiltros = document.getElementById('btn-export-pdf')

  if (btnReporteFiltros) {
    btnReporteFiltros.addEventListener('click', async () => {
      try {

        const res = await secureFetch(`${REPORTS_URL}/executive`, {
          method: 'GET'
        })

        if (!res || !res.ok) {
          alert('Error generando reporte PDF')
          return
        }

        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)

        const a = document.createElement('a')
        a.href = url
        a.download = 'FilterTrack_Report.pdf'
        document.body.appendChild(a)
        a.click()
        a.remove()

        window.URL.revokeObjectURL(url)

      } catch (err) {
        console.error('Error reporte PDF:', err)
        alert('No se pudo generar el reporte')
      }
    })
  }

  // -----------------------------
  // EXECUTIVE REPORT (EXCEL)
  // -----------------------------
  const btnReporteExcel = document.getElementById('btn-export-excel')

  if (btnReporteExcel) {
    btnReporteExcel.addEventListener('click', async () => {
      try {
        const res = await secureFetch(`${REPORTS_URL}/executive.xlsx`, {
          method: 'GET'
        })
        if (!res || !res.ok) {
          alert('Error generando reporte Excel')
          return
        }

        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)

        const a = document.createElement('a')
        a.href = url
        a.download = 'FilterTrack_Reporte.xlsx'
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
      } catch (err) {
        console.error('Error reporte Excel:', err)
        alert('No se pudo generar el reporte')
      }
    })
  }

  // -----------------------------
  // CERRAR PANEL HISTORIAL (NEW PANEL)
  // -----------------------------
  const btnCerrarHistory = document.getElementById('btn-cerrar-history')

  function cerrarHistory() {
    const panel = document.getElementById('machineHistoryPanel')
    if (panel) panel.classList.remove('open')
  }

  if (btnCerrarHistory) {
    btnCerrarHistory.addEventListener('click', cerrarHistory)
  }

  // -----------------------------
  // SHOW ORGANIZATION NAME
  // -----------------------------
  const orgName = localStorage.getItem("org_name");
  const orgElement = document.getElementById("organizationName");

  if (orgElement && orgName) {
    orgElement.textContent = orgName;
  }

  // -----------------------------
  // LOGOUT
  // -----------------------------
  const btnLogout = document.getElementById('btn-logout')

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('token')
      window.location.href = 'login.html'
    })
  }


  // -----------------------------
  // INIT SYSTEM
  // -----------------------------

  applyTranslations();
  cargarMarcas();
  cargarMaquinas();
  cargarFiltros();

  console.log("SYSTEM INITIALIZED");

  // -----------------------------
  // ADD BRAND (From Nueva Máquina Modal)
  // -----------------------------
  const btnAddBrand = document.getElementById('btn-add-brand');
  const addBrandForm = document.getElementById('add-brand-form');
  const btnSaveBrand = document.getElementById('btn-save-brand');

  if (btnAddBrand && addBrandForm) {
    btnAddBrand.addEventListener('click', () => {
      addBrandForm.style.display = addBrandForm.style.display === 'none' ? 'block' : 'none';
    });
  }

  if (btnSaveBrand) {
    btnSaveBrand.addEventListener('click', async () => {
      const name = document.getElementById('new-brand-name')?.value.trim();
      const category = document.getElementById('new-brand-category')?.value.trim();

      if (!name) {
        alert('Nombre de marca requerido');
        return;
      }

      const res = await secureFetch(BRANDS_URL, {
        method: 'POST',
        body: JSON.stringify({ brand_name: name, category: category || 'OTHER' })
      });

      if (!res || !res.ok) {
        alert('Error creando marca');
        return;
      }

      await cargarMarcas();
      document.getElementById('new-machine-brand').value = '';
      addBrandForm.style.display = 'none';
      document.getElementById('new-brand-name').value = '';
      document.getElementById('new-brand-category').value = '';
    });
  }

  // -----------------------------
  // ADD MODEL (From Nueva Máquina Modal)
  // -----------------------------
  const btnAddModel = document.getElementById('btn-add-model');
  const addModelForm = document.getElementById('add-model-form');
  const btnSaveModel = document.getElementById('btn-save-model');

  if (btnAddModel && addModelForm) {
    btnAddModel.addEventListener('click', () => {
      addModelForm.style.display = addModelForm.style.display === 'none' ? 'block' : 'none';
    });
  }

  if (btnSaveModel) {
    btnSaveModel.addEventListener('click', async () => {
      const modelName = document.getElementById('new-model-name')?.value.trim();
      const brandId = document.getElementById('new-machine-brand')?.value;

      if (!modelName || !brandId) {
        alert('Selecciona marca y escribe nombre del modelo');
        return;
      }

      const res = await secureFetch(MODELS_URL, {
        method: 'POST',
        body: JSON.stringify({ model_name: modelName, brand_id: parseInt(brandId) })
      });

      if (!res || !res.ok) {
        alert('Error creando modelo');
        return;
      }

      await cargarModelos(brandId, 'new-machine-model');
      addModelForm.style.display = 'none';
      document.getElementById('new-model-name').value = '';
    });
  }

  // -----------------------------
  // CONFIGURAR FILTROS RECOMENDADOS (Nueva Máquina Modal)
  // -----------------------------
  const selectModeloNuevo = document.getElementById('new-machine-model');
  const configSection = document.getElementById('model-config-section');
  const btnConfigModel = document.getElementById('btn-config-model');
  const configPanel = document.getElementById('model-filters-panel');
  const btnSaveConfigFilter = document.getElementById('btn-save-config-filter');
  const existingFiltersDiv = document.getElementById('existing-model-filters');

  // Mostrar botón config cuando haya modelo seleccionado
  if (selectModeloNuevo && configSection) {
    selectModeloNuevo.addEventListener('change', () => {
      if (selectModeloNuevo.value) {
        configSection.style.display = 'block';
      } else {
        configSection.style.display = 'none';
        if (configPanel) configPanel.style.display = 'none';
      }
    });
  }


  // Abrir / cerrar panel
  if (btnConfigModel && configPanel) {
    btnConfigModel.addEventListener('click', async () => {
      const modelId = selectModeloNuevo?.value;
      if (!modelId) return;

      configPanel.style.display = configPanel.style.display === 'none' ? 'block' : 'none';

      if (configPanel.style.display === 'block') {
        await cargarFiltrosModeloConfig(modelId);
      }
    });
  }

  // Guardar filtro recomendado
  if (btnSaveConfigFilter) {
    btnSaveConfigFilter.addEventListener('click', async () => {
      const modelId = selectModeloNuevo?.value;
      const name = document.getElementById('config-filter-name')?.value.trim();
      const life = document.getElementById('config-life-months')?.value;
      const notes = document.getElementById('config-filter-notes')?.value.trim();

      if (!modelId || !name || !life) {
        alert('Completa nombre y vida útil del filtro');
        return;
      }

      const res = await secureFetch(`${MODELS_URL}/${modelId}/filters`, {
        method: 'POST',
        body: JSON.stringify({
          filter_name: name,
          life_months: Number(life),
          notes: notes || null,
          water_capacity_gallons: document.getElementById('config-water-capacity')?.value
            ? Number(document.getElementById('config-water-capacity').value)
            : null,
          micron_rating: document.getElementById('config-micron-rating')?.value
            ? Number(document.getElementById('config-micron-rating').value)
            : null,
          chlorine_capacity_gallons: document.getElementById('config-chlorine-capacity')?.value
            ? Number(document.getElementById('config-chlorine-capacity').value)
            : null,
          max_flow_rate_gpm: document.getElementById('config-flow-rate')?.value
            ? Number(document.getElementById('config-flow-rate').value)
            : null,
          recommended_psi_min: document.getElementById('config-psi-min')?.value
            ? Number(document.getElementById('config-psi-min').value)
            : null,
          recommended_psi_max: document.getElementById('config-psi-max')?.value
            ? Number(document.getElementById('config-psi-max').value)
            : null
        })
      });

      if (!res || !res.ok) {
        alert('Error guardando filtro recomendado');
        return;
      }

      document.getElementById('config-filter-name').value = '';
      document.getElementById('config-life-months').value = '';
      document.getElementById('config-filter-notes').value = '';

      await cargarFiltrosModeloConfig(modelId);
    });
  }

  // Cargar filtros existentes del modelo
  async function cargarFiltrosModeloConfig(modelId) {
    if (!existingFiltersDiv) return;

    const res = await secureFetch(`${MODELS_URL}/${modelId}/filters`);
    if (!res || !res.ok) return;

    const filters = await res.json();
    existingFiltersDiv.innerHTML = '';

    if (!filters.length) {
      existingFiltersDiv.innerHTML = '<small>No hay filtros recomendados aún.</small>';
      return;
    }

    filters.forEach(f => {
      const div = document.createElement('div');
      div.style.padding = '6px 0';
      div.innerHTML = `
        <strong>${f.filter_name}</strong>
        <div>${f.life_months} meses</div>
        <small>${f.notes || ''}</small>
      `;
      existingFiltersDiv.appendChild(div);
    });
  }

  // -----------------------------
  // PSI MANUAL SAVE (BACKEND CONNECTED)
  // -----------------------------
  const btnPsiManual = document.getElementById('btn-psi-manual');
  const modalPsiManual = document.getElementById('modal-psi-manual');
  const btnSaveManualPsi = document.getElementById('save-manual-psi');
  const btnCancelManualPsi = document.getElementById('cancel-manual-psi');
  const manualPsiInput = document.getElementById('manual-psi-input');

  if (btnPsiManual && modalPsiManual) {
    btnPsiManual.addEventListener('click', () => {
      if (!maquinaSeleccionadaId) {
        alert('Selecciona una máquina primero');
        return;
      }
      modalPsiManual.classList.remove('hidden');
    });
  }

  if (btnCancelManualPsi && modalPsiManual) {
    btnCancelManualPsi.addEventListener('click', () => {
      modalPsiManual.classList.add('hidden');
    });
  }

  if (btnSaveManualPsi) {
    btnSaveManualPsi.addEventListener('click', async () => {

      if (!maquinaSeleccionadaId) {
        alert('No hay máquina seleccionada');
        return;
      }

      const psiValue = Number(manualPsiInput?.value);

      if (!Number.isFinite(psiValue) || psiValue <= 0) {
        alert('PSI inválido');
        return;
      }

      try {
        const res = await secureFetch(`${MACHINES_URL}/${encodeURIComponent(maquinaSeleccionadaId)}/psi`, {
          method: 'POST',
          body: JSON.stringify({
            psi_value: psiValue,
            responsible: 'MANUAL_UI',
            source: 'MANUAL'
          })
        });

        if (!res || !res.ok) {
          const errText = res ? await res.text() : 'No response';
          console.error('Error saving PSI:', errText);
          alert('Error guardando PSI');
          return;
        }

        modalPsiManual.classList.add('hidden');
        manualPsiInput.value = '';

        // Reload machine data (refresh gauge + status)
        await cargarDatosMaquina(maquinaSeleccionadaId);

      } catch (err) {
        console.error('PSI manual error:', err);
        alert('Error inesperado guardando PSI');
      }

    });
  }


  // -----------------------------
  // WATER SYSTEM (Manual / Max / History)
  // -----------------------------
  const btnWaterManual = document.getElementById('btn-water-manual');
  const btnWaterMax = document.getElementById('btn-water-max');
  const btnWaterHistory = document.getElementById('btn-water-history');

  const modalWaterManual = document.getElementById('modal-water-manual');
  const modalWaterMax = document.getElementById('modal-water-max');
  const modalWaterHistory = document.getElementById('modal-water-history');

  const inputWaterManual = document.getElementById('water-manual-input');
  const inputWaterMax = document.getElementById('max-water-input');

  const btnSaveWaterManual = document.getElementById('save-water-manual');
  const btnCancelWaterManual = document.getElementById('cancel-water-manual');

  const btnSaveWaterMax = document.getElementById('btn-save-max-water');
  const btnCancelWaterMax = document.getElementById('btn-cancel-max-water');

  const waterHistoryContainer = document.getElementById('water-history-container');

  function getWaterHistory(machineId) {
    const key = `water_history_${machineId}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  }

  function logWaterEvent(machineId, gallons, capacity) {
    const key = `water_history_${machineId}`;
    const history = getWaterHistory(machineId);

    const percent = capacity
      ? Math.round(((capacity - gallons) / capacity) * 100)
      : null;

    history.unshift({
      gallons,
      capacity,
      percent,
      date: new Date().toISOString()
    });

    localStorage.setItem(key, JSON.stringify(history.slice(0, 50)));
    localStorage.setItem(`last_water_${machineId}`, String(gallons));
    localStorage.setItem(`last_water_update_${machineId}`, new Date().toISOString());
  }

  if (btnWaterManual && modalWaterManual) {
    btnWaterManual.onclick = () => {
      if (!maquinaSeleccionadaId) {
        alert('Selecciona una máquina primero');
        return;
      }
      modalWaterManual.classList.remove('hidden');
    };
  }

  if (btnCancelWaterManual && modalWaterManual) {
    btnCancelWaterManual.onclick = () => {
      modalWaterManual.classList.add('hidden');
    };
  }

  if (btnSaveWaterManual) {
    btnSaveWaterManual.onclick = async () => {

      if (!maquinaSeleccionadaId) {
        alert('Selecciona una máquina primero');
        return;
      }

      const gallons = Number(inputWaterManual?.value);

      if (!Number.isFinite(gallons) || gallons <= 0) {
        alert('Valor inválido');
        return;
      }

      const capacity =
        Number(localStorage.getItem(`water_max_${maquinaSeleccionadaId}`)) || 0;

      const res = await secureFetch(
        `${MACHINES_URL}/${encodeURIComponent(maquinaSeleccionadaId)}/water`,
        {
          method: 'POST',
          body: JSON.stringify({ gallons, responsible: 'MANUAL_UI' })
        }
      );

      if (!res || !res.ok) {
        alert('Error actualizando consumo de agua');
        return;
      }

      // Save history locally (like PSI system)
      logWaterEvent(
        maquinaSeleccionadaId,
        gallons,
        capacity
      );

      // ===== UPDATE WATER CARD LIKE PSI (NO DEPENDENCY ON FILTERS) =====
      const waterCard = document.getElementById('machine-water-status');
      const waterValueEl = document.getElementById('water-current-value');
      const waterStateEl = document.getElementById('water-current-state');

      if (waterCard && waterValueEl && waterStateEl) {

        if (capacity > 0) {
          const remaining = Math.max(0, capacity - gallons);
          const percentRemaining = Math.round((remaining / capacity) * 100);

          waterValueEl.textContent = `${gallons} / ${capacity} GAL`;
          waterStateEl.textContent = `${percentRemaining}% Remaining`;

          waterCard.classList.remove('psi-normal','psi-warning','psi-critical');

          if (percentRemaining > 60) {
            waterCard.classList.add('psi-normal');
          } else if (percentRemaining > 30) {
            waterCard.classList.add('psi-warning');
          } else {
            waterCard.classList.add('psi-critical');
          }

        } else {
          waterValueEl.textContent = `${gallons} GAL`;
          waterStateEl.textContent = 'No Max Set';
          waterCard.classList.remove('psi-normal','psi-warning','psi-critical');
        }
      }

      modalWaterManual.classList.add('hidden');
      inputWaterManual.value = '';

    };
  }

  if (btnWaterMax && modalWaterMax) {
    btnWaterMax.onclick = () => {
      if (!maquinaSeleccionadaId) return;
      modalWaterMax.classList.remove('hidden');
    };
  }

  if (btnCancelWaterMax && modalWaterMax) {
    btnCancelWaterMax.onclick = () => {
      modalWaterMax.classList.add('hidden');
    };
  }

  if (btnSaveWaterMax) {
    btnSaveWaterMax.onclick = () => {
      if (!maquinaSeleccionadaId) return;

      const value = Number(inputWaterMax?.value);
      if (!Number.isFinite(value) || value <= 0) {
        alert('Capacidad inválida');
        return;
      }

      localStorage.setItem(`water_max_${maquinaSeleccionadaId}`, value);
      modalWaterMax.classList.add('hidden');
      cargarDatosMaquina(maquinaSeleccionadaId);
      cargarFiltros();
    };
  }


  if (btnWaterHistory && modalWaterHistory) {
    btnWaterHistory.onclick = () => {
      if (!maquinaSeleccionadaId) return;

      const history = getWaterHistory(maquinaSeleccionadaId);

      if (!waterHistoryContainer) return;

      if (!history.length) {
        waterHistoryContainer.innerHTML = '<div style="opacity:.6">No records</div>';
      } else {
        waterHistoryContainer.innerHTML = history.map(row => `
          <div class="psi-history-row">
            <div>
              <strong>${row.gallons} GAL</strong>
              <div>${new Date(row.date).toLocaleString()}</div>
            </div>
            <div>${row.percent ?? '--'}%</div>
          </div>
        `).join('');
      }

      modalWaterHistory.classList.remove('hidden');
    };
  }

  // CLOSE WATER HISTORY MODAL
  const btnCloseWaterHistory = document.getElementById('btn-close-water-history');

  if (btnCloseWaterHistory) {
    btnCloseWaterHistory.addEventListener('click', function (e) {
      e.preventDefault();
      const modal = document.getElementById('modal-water-history');
      if (modal) {
        modal.classList.add('hidden');
      }
    });
  }

  const btnLang = document.getElementById('btn-lang-toggle');

  function updateLangButton() {
    if (!btnLang) return;
    const current = localStorage.getItem('lang') || 'es';
    btnLang.textContent = current === 'es' ? 'EN' : 'ES';
  }

  if (btnLang) {
    btnLang.addEventListener('click', () => {
      toggleLanguage();
      updateLangButton();
    });
  }

  // Apply translations on load
  applyTranslations();

  if (localStorage.getItem('token')) {
    (async () => {
      await cargarMarcas();
      await cargarMaquinas();
      await cargarFiltros();
    })();
  } else {
    window.location.href = 'login.html'
  }
})