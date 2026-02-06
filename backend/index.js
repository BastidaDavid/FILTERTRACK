const express = require('express')
const cors = require('cors')
const db = require('./database')

const app = express()
app.use(cors())
app.use(express.json())

 // Asegurar tabla de mantenimientos
db.run(`
  CREATE TABLE IF NOT EXISTS mantenimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filtro_id INTEGER,
    fecha TEXT,
    observaciones TEXT
  )
`, (err) => {
  if (err) {
    console.error('Error creando tabla mantenimientos:', err.message)
  } else {
    console.log('Tabla mantenimientos lista')
  }
})

// Asegurar tabla de filtros
db.run(`
  CREATE TABLE IF NOT EXISTS filtros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    codigo_barra TEXT,
    fecha_instalacion TEXT,
    vida_util_dias INTEGER
  )
`, (err) => {
  if (err) {
    console.error('Error creando tabla filtros:', err.message)
  } else {
    console.log('Tabla filtros lista')
  }
})

app.get('/', (req, res) => {
  res.send('Sistema de Filtros funcionandooooo 🚀')
})

// Crear filtro
app.post('/filtros', (req, res) => {
  const { nombre, codigo_barra, fecha_instalacion, vida_util_dias } = req.body

  if (!nombre || !codigo_barra) {
    return res.status(400).json({ error: 'nombre y codigo_barra son obligatorios' })
  }

  const sql = `
    INSERT INTO filtros (nombre, codigo_barra, fecha_instalacion, vida_util_dias)
    VALUES (?, ?, ?, ?)
  `

  db.run(sql, [nombre, codigo_barra, fecha_instalacion, vida_util_dias], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message })
    }
    res.json({ message: 'Filtro agregado', id: this.lastID })
  })
})

// Listar filtros
app.get('/filtros', (req, res) => {
  db.all('SELECT * FROM filtros', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }
    res.json(rows)
  })
})

// Eliminar filtro por ID
app.delete('/filtros/:id', (req, res) => {
  const { id } = req.params
  console.log('DELETE solicitado para filtro ID:', id)

  db.run('DELETE FROM filtros WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('Error al eliminar filtro:', err.message)
      return res.status(500).json({ error: err.message })
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Filtro no encontrado' })
    }

    res.json({ message: 'Filtro eliminado correctamente' })
  })
})

// Actualizar filtro por ID
app.put('/filtros/:id', (req, res) => {
  const { id } = req.params
  const { nombre, codigo_barra, fecha_instalacion, vida_util_dias } = req.body

  const sql = `
    UPDATE filtros
    SET nombre = ?, codigo_barra = ?, fecha_instalacion = ?, vida_util_dias = ?
    WHERE id = ?
  `

  db.run(
    sql,
    [nombre, codigo_barra, fecha_instalacion, vida_util_dias, id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Filtro no encontrado' })
      }

      res.json({ message: 'Filtro actualizado correctamente' })
    }
  )
})

// ===============================
// MANTENIMIENTOS
// ===============================

// Registrar mantenimiento
app.post('/mantenimientos', (req, res) => {
  const { filtro_id, fecha, observaciones } = req.body

  if (!filtro_id || !fecha) {
    return res.status(400).json({ error: 'filtro_id y fecha son obligatorios' })
  }

  const sql = `
    INSERT INTO mantenimientos (filtro_id, fecha, observaciones)
    VALUES (?, ?, ?)
  `

  db.run(sql, [filtro_id, fecha, observaciones], function (err) {
    if (err) {
      console.error('Error al registrar mantenimiento:', err.message)
      return res.status(500).json({ error: err.message })
    }

    res.json({
      message: 'Mantenimiento registrado correctamente',
      id: this.lastID
    })
  })
})

// Obtener mantenimientos por filtro
app.get('/mantenimientos/:filtro_id', (req, res) => {
  const { filtro_id } = req.params

  const sql = `
    SELECT *
    FROM mantenimientos
    WHERE filtro_id = ?
    ORDER BY fecha DESC
  `

  db.all(sql, [filtro_id], (err, rows) => {
    if (err) {
      console.error('Error al obtener mantenimientos:', err.message)
      return res.status(500).json({ error: err.message })
    }

    res.json(rows)
  })
})

app.listen(3001, () => {
  console.log('Servidor activo en http://localhost:3001')
})