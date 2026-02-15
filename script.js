// ==============================
// FILTERTRACK V1 - CLEAN FRONTEND
// ==============================

document.addEventListener('DOMContentLoaded', () => {
  console.log('SCRIPT V1 CLEAN LOADED')

  // ===== PRODUCTION API CONFIG =====
  const API_BASE = 'https://filtertrack-backend.onrender.com'
  const API_URL = `${API_BASE}/filters`

  const REPORTS_URL = `${API_BASE}/reports`

  const MACHINES_URL = `${API_BASE}/machines`
  const BRANDS_URL = `${API_BASE}/machine-brands`
  const MODELS_URL = `${API_BASE}/machine-models`

  let maquinaSeleccionadaId = null

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
      if (!selectMarca) return

      selectMarca.innerHTML = '<option value="">Selecciona marca</option>'

      marcas.forEach(m => {
        const option = document.createElement('option')
        option.value = m.id
        option.textContent = m.name
        selectMarca.appendChild(option)
      })
    } catch (err) {
      console.error('Error cargando marcas:', err)
    }
  }

  async function cargarModelos(brandId) {
    try {
      const res = await secureFetch(`${MODELS_URL}?brand_id=${brandId}`)
      if (!res || !res.ok) return

      const modelos = await res.json()
      const selectModelo = document.getElementById('model')
      if (!selectModelo) return

      selectModelo.innerHTML = '<option value="">Selecciona modelo</option>'

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
    const token = localStorage.getItem('token')

    if (!token) {
      alert('Sesión expirada. Inicia sesión nuevamente.')
      window.location.href = 'login.html'
      return null
    }

    return token
  }

  // -----------------------------
  // SECURE FETCH (handles 401 auto logout)
  // -----------------------------
  async function secureFetch(url, options = {}) {
    const token = getToken()
    if (!token) return

    const headers = {
      Authorization: `Bearer ${token}`
    }

    // Only attach JSON header if body exists
    if (options.body) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(url, {
      ...options,
      headers
    })

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

  // -----------------------------
  // Helpers
  // -----------------------------
  function formatISO(date) {
    if (!date) return ''

    const d = new Date(date)
    if (isNaN(d.getTime())) return ''

    return d.toISOString().slice(0, 10)
  }

  function calcularEstado(dueDate) {
    const hoy = new Date()
    const venc = new Date(dueDate)
    const diffMs = venc - hoy
    const dias = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (dias <= 0) return { texto: 'Vencido', clase: 'estado-rojo', dias }
    if (dias <= 30) return { texto: 'Próximo', clase: 'estado-naranja', dias }
    return { texto: 'OK', clase: 'estado-verde', dias }
  }

  // -----------------------------
  // LOAD FILTERS
  // -----------------------------
  async function cargarFiltros() {
    try {
      const url = maquinaSeleccionadaId
        ? `${MACHINES_URL}/${maquinaSeleccionadaId}/filters`
        : API_URL

      const res = await secureFetch(url)
      if (!res || !res.ok) throw new Error('Error loading filters')
      const filtros = await res.json()

      const tbody = document.querySelector('#tabla-filtros tbody')
      if (!tbody) return
      tbody.innerHTML = ''

      filtros.forEach(f => {
        const estado = calcularEstado(f.due_date)

        const tr = document.createElement('tr')
        tr.innerHTML = `
          <td>${f.filter_id}</td>
          <td>${f.area}</td>
          <td>${f.equipment}</td>
          <td>${f.location}</td>
          <td>${f.brand} / ${f.model}</td>
          <td>${formatISO(f.install_date)}</td>
          <td>${formatISO(f.due_date)}</td>
          <td>
            <span class="badge ${estado.clase}">
              ${estado.texto}
              <div class="dias-restantes">${estado.dias} días</div>
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
              <button class="btn-accion archivar btn-danger" onclick="eliminarFiltro('${f.filter_id}')" title="Archivar">
                🗑
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
      const res = await secureFetch(MACHINES_URL)
      if (!res || !res.ok) return

      const maquinas = await res.json()
      console.log('Máquinas cargadas:', maquinas);

      const lista = document.getElementById('lista-maquinas')
      if (!lista) return

      lista.innerHTML = ''

      maquinas.forEach(m => {
        const item = document.createElement('div')
        item.className = 'machine-item'
        if (maquinaSeleccionadaId === m.machine_id) {
          item.classList.add('activa');
        }
        item.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:center;">
    <span>${m.machine_id} - ${m.area || ''}</span>
    <div style="display:flex; gap:6px;">
      <button 
        onclick="event.stopPropagation(); editarMaquina('${m.machine_id}')"
        style="background:none;border:none;cursor:pointer;font-size:14px;">
        ✏️
      </button>
      <button 
        onclick="event.stopPropagation(); eliminarMaquina('${m.machine_id}')"
        style="background:none;border:none;cursor:pointer;font-size:14px;color:#dc3545;">
        🗑
      </button>
    </div>
  </div>
`;

        item.addEventListener('click', () => {
          maquinaSeleccionadaId = m.machine_id;

          document.querySelectorAll('.machine-item')
            .forEach(el => el.classList.remove('activa'));

          item.classList.add('activa');

          const titulo = document.getElementById('titulo-maquina');
          if (titulo) {
            titulo.textContent = `Máquina seleccionada: ${m.machine_id}`;
          }

          cargarFiltros();
          cargarDatosMaquina(m.machine_id);
        })

        lista.appendChild(item)
      })
    } catch (err) {
      console.error('Error cargando máquinas:', err)
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

      const titulo = document.getElementById('titulo-maquina');
      if (titulo) {
        titulo.textContent = `${machine.machine_id} - ${machine.area || ''}`;
      }

      // Autocomplete base info
      const equipment = document.getElementById('equipment');
      const area = document.getElementById('area');
      const location = document.getElementById('location');

      if (equipment) equipment.value = machine.machine_id || '';
      if (area) area.value = machine.area || '';
      if (location) location.value = machine.location || '';

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
        if (suggestionDiv) suggestionDiv.style.display = 'none'
        if (filterNameDiv) filterNameDiv.textContent = ''
        return
      }

      try {
        const res = await secureFetch(`${MODELS_URL}/${modelId}/filters`)
        if (!res || !res.ok) return

        const filters = await res.json()

        if (!filters.length) {
          if (suggestionDiv) suggestionDiv.style.display = 'none'
          return
        }

        // Take first recommended filter (MVP simple logic)
        const recommended = filters[0]

        if (filterNameDiv) {
          filterNameDiv.textContent = `${recommended.filter_name} (${recommended.life_months} meses)`
        }

        if (lifeInput) {
          lifeInput.value = recommended.life_months
        }

        if (suggestionDiv) {
          suggestionDiv.style.display = 'block'
        }

      } catch (err) {
        console.error('Error cargando filtro recomendado:', err)
      }
    })
  }

  // -----------------------------
  // NUEVA MAQUINA
  // -----------------------------
  const btnNuevaMaquina = document.getElementById('btn-nueva-maquina')

  if (btnNuevaMaquina) {
    btnNuevaMaquina.addEventListener('click', async () => {
      const machineId = prompt('ID de la nueva máquina:')
      if (!machineId) return

      await secureFetch(MACHINES_URL, {
        method: 'POST',
        body: JSON.stringify({
          machine_id: machineId,
          area: 'General'
        })
      })

      cargarMaquinas()
    })
  }

  // -----------------------------
  // EDITAR MAQUINA (Enterprise)
  // -----------------------------
  window.editarMaquina = async function(machineId) {
    try {
      const res = await secureFetch(`${MACHINES_URL}/${machineId}`);
      if (!res || !res.ok) return;

      const machine = await res.json();

      const nuevaArea = prompt('Editar área:', machine.area || '');
      if (nuevaArea === null) return;

      const nuevaUbicacion = prompt('Editar ubicación:', machine.location || '');
      if (nuevaUbicacion === null) return;

      await secureFetch(`${MACHINES_URL}/${machineId}`, {
        method: 'PUT',
        body: JSON.stringify({
          area: nuevaArea,
          location: nuevaUbicacion
        })
      });

      alert('Máquina actualizada correctamente');
      cargarMaquinas();

    } catch (err) {
      console.error('Error editando máquina:', err);
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

      const data = {
        filter_id: document.getElementById('filter-id').value.trim(),
        machine_id: maquinaSeleccionadaId,
        area: document.getElementById('area').value.trim(),
        equipment: document.getElementById('equipment').value.trim(),
        location: document.getElementById('location').value.trim(),

        brand_id: document.getElementById('brand').value
          ? parseInt(document.getElementById('brand').value)
          : null,
        model_id: document.getElementById('model').value
          ? parseInt(document.getElementById('model').value)
          : null,

        install_date: document.getElementById('install-date').value,
        life_months: Number(document.getElementById('life-months').value),
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
  // EDIT
  // -----------------------------
  window.editarFiltro = async function (filterId) {
    const res = await secureFetch(`${API_URL}/${filterId}`)
    if (!res || !res.ok) return
    const f = await res.json()

    filtroEditandoId = filterId

    document.getElementById('filter-id').value = f.filter_id
    document.getElementById('area').value = f.area
    document.getElementById('equipment').value = f.equipment
    document.getElementById('location').value = f.location
    document.getElementById('brand').value = f.brand_id
    await cargarModelos(f.brand_id)
    document.getElementById('model').value = f.model_id
    document.getElementById('install-date').value = formatISO(f.install_date)
    document.getElementById('life-months').value = f.life_months
    document.getElementById('responsible').value = f.responsible
    document.getElementById('notes').value = f.notes || ''

    window.scrollTo({ top: 0, behavior: 'smooth' })
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
  // HISTORIAL
  // -----------------------------
  window.verHistorial = async function (filterId) {
    filtroActualId = filterId

    const res = await secureFetch(`${API_URL}/${filterId}/events`)
    if (!res || !res.ok) return
    const events = await res.json()

    const tbody = document.querySelector('#tabla-mantenimientos tbody')
    if (!tbody) return
    tbody.innerHTML = ''

    events.forEach(ev => {
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td>${ev.event_id || '-'}</td>
        <td>${formatISO(ev.event_date)}</td>
        <td>${ev.reason || ev.event_type || '-'}</td>
        <td>${ev.responsible || '-'}</td>
        <td>${ev.notes || '-'}</td>
      `
      tbody.appendChild(tr)
    })

    // Mostrar panel lateral
    const panel = document.querySelector('.col-mantenimientos')
    const overlay = document.getElementById('overlay')

    if (panel) {
      panel.classList.add('activo')
    }

    if (overlay) {
      overlay.classList.add('overlay-activo')
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
  const btnReporteFiltros = document.getElementById('btn-reporte-pdf')

  if (btnReporteFiltros) {
    btnReporteFiltros.addEventListener('click', async () => {
      try {
        const res = await secureFetch(`${REPORTS_URL}/executive`)
        if (!res || !res.ok) {
          alert('Error generando reporte PDF')
          return
        }

        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)

        const a = document.createElement('a')
        a.href = url
        a.download = 'FilterTrack_Reporte.pdf'
        document.body.appendChild(a)
        a.click()
        a.remove()
      } catch (err) {
        console.error('Error reporte PDF:', err)
        alert('No se pudo generar el reporte')
      }
    })
  }

  // -----------------------------
  // EXECUTIVE REPORT (EXCEL)
  // -----------------------------
  const btnReporteExcel = document.getElementById('btn-reporte-excel')

  if (btnReporteExcel) {
    btnReporteExcel.addEventListener('click', async () => {
      try {
        const res = await secureFetch(`${REPORTS_URL}/executive.xlsx`)
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
      } catch (err) {
        console.error('Error reporte Excel:', err)
        alert('No se pudo generar el reporte')
      }
    })
  }

  // -----------------------------
  // CERRAR PANEL HISTORIAL
  // -----------------------------
  const btnCerrarPanel = document.getElementById('btn-cerrar-panel')
  const overlay = document.getElementById('overlay')

  function cerrarPanel() {
    const panel = document.querySelector('.col-mantenimientos')
    if (panel) panel.classList.remove('activo')
    if (overlay) overlay.classList.remove('overlay-activo')
  }

  if (btnCerrarPanel) {
    btnCerrarPanel.addEventListener('click', cerrarPanel)
  }

  if (overlay) {
    overlay.addEventListener('click', cerrarPanel)
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

  if (localStorage.getItem('token')) {
    (async () => {
      await cargarMarcas();
      await cargarMaquinas();

      if (maquinaSeleccionadaId) {
        await cargarFiltros();
      }
    })();
  } else {
    window.location.href = 'login.html'
  }
})