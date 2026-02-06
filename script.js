document.addEventListener('DOMContentLoaded', () => {

const API_URL = 'http://localhost:3001/filtros'
let filtroEditandoId = null
let filtrosCache = []
let estadoFiltroActual = 'all'

function calcularEstado(fechaInstalacion, vidaUtilDias) {
  const hoy = new Date()
  const instalacion = new Date(fechaInstalacion)
  const vencimiento = new Date(instalacion)
  vencimiento.setDate(vencimiento.getDate() + Number(vidaUtilDias))

  const diffMs = vencimiento - hoy
  const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diasRestantes <= 0) {
    return {
      texto: 'Vencido',
      clase: 'estado-rojo',
      prioridad: 0,
      dias: diasRestantes
    }
  } else if (diasRestantes <= 30) {
    return {
      texto: 'Próximo',
      clase: 'estado-amarillo',
      prioridad: 1,
      dias: diasRestantes
    }
  } else {
    return {
      texto: 'OK',
      clase: 'estado-verde',
      prioridad: 2,
      dias: diasRestantes
    }
  }
}

// Cargar filtros
async function cargarFiltros() {
  try {
    const response = await fetch(API_URL)
    const filtros = await response.json()

    // Ordenar por estado: Vencido → Próximo → OK
    filtros.sort((a, b) => {
      const estadoA = calcularEstado(a.fecha_instalacion, a.vida_util_dias)
      const estadoB = calcularEstado(b.fecha_instalacion, b.vida_util_dias)
      return estadoA.prioridad - estadoB.prioridad
    })

    // Guardar filtros en cache
    filtrosCache = filtros

    let countVencido = 0
    let countProximo = 0

    filtros.forEach(f => {
      const estado = calcularEstado(f.fecha_instalacion, f.vida_util_dias)
      if (estado.prioridad === 0) countVencido++
      else if (estado.prioridad === 1) countProximo++
    })

    document.getElementById('count-all').innerText = filtros.length
    document.getElementById('count-proximo').innerText = countProximo
    document.getElementById('count-vencido').innerText = countVencido

    const tbody = document.querySelector('#tabla-filtros tbody')
    tbody.innerHTML = ''

    const vencidos = []
    const proximos = []
    const ok = []

    filtros.forEach(filtro => {
      const estado = calcularEstado(
        filtro.fecha_instalacion,
        filtro.vida_util_dias
      )

      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td>${filtro.id}</td>
        <td>${filtro.nombre}</td>
        <td>${filtro.codigo_barra}</td>
        <td>${filtro.fecha_instalacion}</td>
        <td>${filtro.vida_util_dias}</td>
        <td>
          <span class="badge ${estado.clase}">
            ${estado.texto}
            <div class="dias-restantes">
              ${estado.dias} días
            </div>
          </span>
        </td>
        <td>
          <button onclick="editarFiltro(${filtro.id}, '${filtro.nombre}', '${filtro.codigo_barra}', '${filtro.fecha_instalacion}', ${filtro.vida_util_dias})">
            Editar
          </button>
          <button onclick="eliminarFiltro(${filtro.id})">Eliminar</button>
          <button onclick="verMantenimientos(${filtro.id})">Mantenimientos</button>
        </td>
      `

      if (
        estadoFiltroActual === 'all' ||
        (estadoFiltroActual === 'vencido' && estado.prioridad === 0) ||
        (estadoFiltroActual === 'proximo' && estado.prioridad === 1)
      ) {
        if (estado.prioridad === 0) vencidos.push(tr)
        else if (estado.prioridad === 1) proximos.push(tr)
        else ok.push(tr)
      }
    })

    // Limpiar tabla y renderizar por secciones
    tbody.innerHTML = ''
    vencidos.forEach(tr => tbody.appendChild(tr))
    proximos.forEach(tr => tbody.appendChild(tr))
    ok.forEach(tr => tbody.appendChild(tr))
  } catch (error) {
    console.error('Error cargando filtros:', error)
  }
}

// Enviar formulario
document.getElementById('form-filtro').addEventListener('submit', async (e) => {
  e.preventDefault()

  const data = {
    nombre: document.getElementById('nombre').value,
    codigo_barra: document.getElementById('codigo').value,
    fecha_instalacion: document.getElementById('fecha').value,
    vida_util_dias: document.getElementById('vida').value
  }

  if (filtroEditandoId) {
    await fetch(`${API_URL}/${filtroEditandoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    filtroEditandoId = null
  } else {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  }

  limpiarFormulario()
  cargarFiltros()
})

// Inicial
cargarFiltros()

// Eliminar filtro
async function eliminarFiltro(id) {
  const confirmar = confirm('¿Seguro que quieres eliminar este filtro?')
  if (!confirmar) return

  try {
    const res = await fetch(`http://localhost:3001/filtros/${id}`, {
      method: 'DELETE'
    })

    if (!res.ok) {
      const error = await res.json()
      alert('Error al eliminar: ' + error.error)
      return
    }

    limpiarFormulario()
    cargarFiltros()
  } catch (error) {
    console.error('Error eliminando filtro:', error)
  }
}

function editarFiltro(id, nombre, codigo, fecha, vida) {
  filtroEditandoId = id
  document.getElementById('nombre').value = nombre
  document.getElementById('codigo').value = codigo
  document.getElementById('fecha').value = fecha
  document.getElementById('vida').value = vida
}

function limpiarFormulario() {
  filtroEditandoId = null
  document.getElementById('form-filtro').reset()
}

document.getElementById('btn-limpiar').addEventListener('click', () => {
  limpiarFormulario()
})

let filtroActualId = null

function verMantenimientos(filtroId) {
  filtroActualId = filtroId

  const panel = document.querySelector('.col-mantenimientos')
  const overlay = document.getElementById('overlay')
  const seccion = document.getElementById('seccion-mantenimientos')

  if (!panel || !overlay || !seccion) {
    console.error('Panel de mantenimientos no encontrado')
    return
  }

  panel.classList.add('activo')
  overlay.classList.add('activo')
  seccion.style.display = 'block'

  document.getElementById('titulo-mantenimientos').innerText =
    `Mantenimientos del filtro ID ${filtroId}`

  fetch(`http://localhost:3001/mantenimientos/${filtroId}`)
    .then(res => res.json())
    .then(data => {
      const tbody = document.querySelector('#tabla-mantenimientos tbody')
      tbody.innerHTML = ''

      data.forEach(m => {
        const tr = document.createElement('tr')
        tr.innerHTML = `
          <td>${m.id}</td>
          <td>${m.fecha}</td>
          <td>${m.observaciones || ''}</td>
        `
        tbody.appendChild(tr)
      })
    })
}

// Guardar mantenimiento
document.getElementById('form-mantenimiento').addEventListener('submit', e => {
  e.preventDefault()

  const fecha = document.getElementById('mant-fecha').value
  const observaciones = document.getElementById('mant-observaciones').value

  fetch('http://localhost:3001/mantenimientos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filtro_id: filtroActualId,
      fecha,
      observaciones
    })
  })
    .then(res => res.json())
    .then(() => {
      document.getElementById('mant-fecha').value = ''
      document.getElementById('mant-observaciones').value = ''
      verMantenimientos(filtroActualId)
    })
})

const overlay = document.getElementById('overlay')
const btnCerrar = document.getElementById('btn-cerrar-panel')

if (overlay) {
  overlay.addEventListener('click', () => {
    document.querySelector('.col-mantenimientos').classList.remove('activo')
    overlay.classList.remove('activo')
  })
}

if (btnCerrar) {
  btnCerrar.addEventListener('click', () => {
    document.querySelector('.col-mantenimientos').classList.remove('activo')
    overlay.classList.remove('activo')
  })
}

document.querySelectorAll('.estado-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.estado-btn').forEach(b =>
      b.classList.remove('activo')
    )

    btn.classList.add('activo')
    estadoFiltroActual = btn.dataset.estado
    cargarFiltros()
  })
})

// Exponer funciones para botones inline
window.verMantenimientos = verMantenimientos
window.editarFiltro = editarFiltro
window.eliminarFiltro = eliminarFiltro
})