const { google } = require('googleapis')

// Detectar si existen credenciales (producción vs local)
const hasSheetsEnv =
  process.env.GOOGLE_CLIENT_EMAIL &&
  process.env.GOOGLE_PRIVATE_KEY &&
  process.env.GOOGLE_SHEET_ID

let sheets = null
let SPREADSHEET_ID = null

if (hasSheetsEnv) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })

  sheets = google.sheets({ version: 'v4', auth })
  SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID
  console.log('✅ Google Sheets habilitado')
} else {
  console.log('ℹ️ Google Sheets desactivado (entorno local)')
}

async function getSheetName(preferredName) {
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID
  })
  const sheetsList = res.data.sheets.map(s => s.properties.title)

  if (sheetsList.includes(preferredName)) return preferredName

  console.warn(`⚠️ Hoja "${preferredName}" no encontrada. Usando primera hoja:`, sheetsList[0])
  return sheetsList[0]
}

async function appendFiltroRow(filtro) {
  if (!sheets) return

  const values = [[
    filtro.id,
    filtro.nombre,
    filtro.codigo_barra,
    filtro.fecha_instalacion,
    filtro.vida_util_dias,
    filtro.pressure_initial ?? '',
    filtro.presion_actual ?? '',
    filtro.estado ?? '',
    new Date().toLocaleString()
  ]]

  console.log('📤 Enviando filtro a Google Sheets', values)
  const sheetName = await getSheetName('Filtros')

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  })
}

async function appendMantenimientoRow(mantenimiento) {
  if (!sheets) return

  const values = [[
    mantenimiento.id,
    mantenimiento.filtro_id,
    mantenimiento.fecha,
    mantenimiento.presion_actual ?? '',
    mantenimiento.observaciones ?? '',
    new Date().toLocaleString()
  ]]

  console.log('📤 Enviando mantenimiento a Google Sheets', values)
  const sheetName = await getSheetName('Mantenimientos')

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  })
}

module.exports = {
  appendFiltroRow,
  appendMantenimientoRow
}