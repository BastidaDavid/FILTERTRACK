const sqlite3 = require('sqlite3').verbose()

const db = new sqlite3.Database('./filtros.db', (err) => {
  if (err) {
    console.error('Error al conectar DB:', err.message)
  } else {
    console.log('Base de datos conectada 🚰')
  }
})

db.run(`
  CREATE TABLE IF NOT EXISTS filtros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    codigo_barra TEXT,
    fecha_instalacion TEXT,
    vida_util_dias INTEGER
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS mantenimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filtro_id INTEGER,
    fecha TEXT,
    observaciones TEXT
  )
`)

module.exports = db