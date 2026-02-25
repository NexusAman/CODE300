const express = require('express')
const https = require('https')
const path = require('path')
const app = express()

app.get("/yes",(req,res)=>{
res.json("hi there")
})

app.use(express.static(path.join(__dirname, 'app/myapp')))

function getWeather(q, aqi, apiKey) {
  return new Promise((resolve, reject) => {
    const path = `/v1/current.json?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q)}&aqi=${encodeURIComponent(aqi)}`
    const options = {
      hostname: 'api.weatherapi.com',
      port: 443,
      path,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'hack300-backend' }
    }
    const request = https.request(options, (resp) => {
      let data = ''
      resp.on('data', (chunk) => { data += chunk })
      resp.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({ status: resp.statusCode || 200, json })
        } catch (e) {
          reject(new Error('Invalid JSON from upstream'))
        }
      })
    })
    request.on('error', (e) => reject(new Error('Upstream request failed')))
    request.end()
  })
}

function getForecast(q, aqi, apiKey) {
  return new Promise((resolve, reject) => {
    const path = `/v1/forecast.json?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q)}&days=1&aqi=${encodeURIComponent(aqi)}&alerts=no`
    const options = {
      hostname: 'api.weatherapi.com',
      port: 443,
      path,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'hack300-backend' }
    }
    const request = https.request(options, (resp) => {
      let data = ''
      resp.on('data', (chunk) => { data += chunk })
      resp.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({ status: resp.statusCode || 200, json })
        } catch (e) {
          reject(new Error('Invalid JSON from upstream'))
        }
      })
    })
    request.on('error', (e) => reject(new Error('Upstream request failed')))
    request.end()
  })
}

function evaluateHazards(payload) {
  const alerts = []
  const loc = payload && payload.location ? payload.location : {}
  const cur = payload && payload.current ? payload.current : {}
  const aqi = cur && cur.air_quality ? cur.air_quality : {}
  const uv = typeof cur.uv === 'number' ? cur.uv : undefined
  const feelsC = typeof cur.feelslike_c === 'number' ? cur.feelslike_c : undefined
  const heatC = typeof cur.heatindex_c === 'number' ? cur.heatindex_c : feelsC
  const heatF = typeof cur.heatindex_f === 'number' ? cur.heatindex_f : (typeof feelsC === 'number' ? (feelsC * 9/5 + 32) : undefined)
  const windChillC = typeof cur.windchill_c === 'number' ? cur.windchill_c : undefined
  const windChillF = typeof cur.windchill_f === 'number' ? cur.windchill_f : (typeof windChillC === 'number' ? (windChillC * 9/5 + 32) : undefined)
  const windKph = typeof cur.wind_kph === 'number' ? cur.wind_kph : undefined
  const windMph = typeof cur.wind_mph === 'number' ? cur.wind_mph : (typeof windKph === 'number' ? windKph / 1.609 : undefined)
  const visMiles = typeof cur.vis_miles === 'number' ? cur.vis_miles : undefined
  const visKm = typeof cur.vis_km === 'number' ? cur.vis_km : (typeof visMiles === 'number' ? visMiles * 1.609 : undefined)
  const epaIndex = aqi && (aqi['us-epa-index'] || aqi['us_epa_index'])
  const epaLevels = { 1: 'Good', 2: 'Moderate', 3: 'Unhealthy for Sensitive Groups', 4: 'Unhealthy', 5: 'Very Unhealthy', 6: 'Hazardous' }
  // AQI dangerous at 151+  -> EPA category 4+ (Unhealthy+)
  if (typeof epaIndex === 'number' && epaIndex >= 4) {
    const sev = epaIndex >= 6 ? 'hazardous' : (epaIndex >= 5 ? 'very_unhealthy' : 'unhealthy')
    const message = 'Dangerous air quality (AQI 151+). Avoid outdoor exertion; use masks/indoor air filters.'
    alerts.push({ type: 'air_quality', severity: sev, reason: `US EPA AQI ${epaIndex} (${epaLevels[epaIndex] || 'Unknown'})`, message })
  } else if (aqi && (typeof aqi.pm2_5 === 'number' || typeof aqi.pm10 === 'number')) {
    if (typeof aqi.pm2_5 === 'number' && aqi.pm2_5 >= 55) {
      alerts.push({ type: 'air_quality', severity: 'unhealthy', reason: `PM2.5 ${aqi.pm2_5}µg/m³ ≥ 55`, message: 'Dangerous particulate levels; limit outdoor activity.' })
    }
    if (typeof aqi.pm10 === 'number' && aqi.pm10 >= 150) {
      alerts.push({ type: 'air_quality', severity: 'unhealthy', reason: `PM10 ${aqi.pm10}µg/m³ ≥ 150`, message: 'Dangerous particulate levels; limit outdoor activity.' })
    }
  }
  // UV dangerous at 8+
  if (typeof uv === 'number' && uv >= 11) {
    alerts.push({ type: 'uv', severity: 'extreme', reason: `UV index ${uv} ≥ 11`, message: 'Extreme UV (11+). Seek shade, SPF 30+, protective clothing.' })
  } else if (typeof uv === 'number' && uv >= 8) {
    alerts.push({ type: 'uv', severity: 'very_high', reason: `UV index ${uv} ≥ 8`, message: 'Very high UV (8+). Limit midday sun; wear protection.' })
  }
  // Heat Index dangerous at 40°C / 104°F+
  if ((typeof heatC === 'number' && heatC >= 40) || (typeof heatF === 'number' && heatF >= 104)) {
    alerts.push({ type: 'heat', severity: 'severe', reason: `Heat index ${typeof heatC === 'number' ? `${heatC}°C` : `${heatF}°F`} ≥ 40°C/104°F`, message: 'Dangerous heat. Hydrate, rest, and avoid strenuous activity.' })
  }
  // Wind Chill dangerous at -29°C / -20°F or lower
  if ((typeof windChillC === 'number' && windChillC <= -29) || (typeof windChillF === 'number' && windChillF <= -20)) {
    alerts.push({ type: 'cold', severity: 'severe', reason: `Wind chill ${typeof windChillC === 'number' ? `${windChillC}°C` : `${windChillF}°F`} ≤ -29°C/-20°F`, message: 'Dangerous cold. Risk of frostbite/hypothermia. Limit exposure.' })
  }
  // Hurricane (Cat 3+) proxy by sustained wind ≥ 178 kph (111 mph)
  if ((typeof windKph === 'number' && windKph >= 178) || (typeof windMph === 'number' && windMph >= 111)) {
    alerts.push({ type: 'hurricane', severity: 'cat3_plus', reason: `Sustained wind ${typeof windKph === 'number' ? `${windKph} kph` : `${windMph} mph`} ≥ Cat 3 threshold`, message: 'Hurricane-force winds (Category 3+). Seek shelter and follow emergency guidance.' })
  }
  // Visibility dangerous for driving at < 0.25 mile
  if ((typeof visMiles === 'number' && visMiles < 0.25) || (typeof visKm === 'number' && visKm < 0.4)) {
    alerts.push({ type: 'visibility', severity: 'dangerous', reason: `Visibility ${typeof visMiles === 'number' ? `${visMiles} miles` : `${visKm} km`} < 1/4 mile`, message: 'Dangerous driving visibility. Delay travel if possible.' })
  }
  return {
    location: { name: loc.name, region: loc.region, country: loc.country },
    alerts,
    safe: alerts.length === 0
  }
}

app.get('/weather', (req, res) => {
  const q = req.query.q || 'bihar'
  const aqi = req.query.aqi || 'yes'
  const apiKey = process.env.WEATHER_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'WEATHER_API_KEY not set' })
    return
  }
  const path = `/v1/current.json?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q)}&aqi=${encodeURIComponent(aqi)}`
  const options = {
    hostname: 'api.weatherapi.com',
    port: 443,
    path,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'hack300-backend'
    }
  }
  const request = https.request(options, (resp) => {
    let data = ''
    resp.on('data', (chunk) => { data += chunk })
    resp.on('end', () => {
      try {
        const json = JSON.parse(data)
        res.status(resp.statusCode || 200).json(json)
      } catch (e) {
        res.status(502).json({ error: 'Invalid JSON from upstream' })
      }
    })
  })
  request.on('error', (e) => {
    res.status(502).json({ error: 'Upstream request failed' })
  })
  request.end()
})

app.get('/alerts', async (req, res) => {
  const q = req.query.q || 'bihar'
  const aqi = req.query.aqi || 'yes'
  const apiKey = process.env.WEATHER_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'WEATHER_API_KEY not set' })
    return
  }
  try {
    const { status, json } = await getWeather(q, aqi, apiKey)
    if (status >= 400) {
      res.status(status).json(json)
      return
    }
    const result = evaluateHazards(json)
    res.json(result)
  } catch (e) {
    res.status(502).json({ error: 'Upstream request failed' })
  }
})

app.get('/forecast', async (req, res) => {
  const q = req.query.q || 'bihar'
  const aqi = req.query.aqi || 'yes'
  const apiKey = process.env.WEATHER_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'WEATHER_API_KEY not set' })
    return
  }
  try {
    const { status, json } = await getForecast(q, aqi, apiKey)
    res.status(status).json(json)
  } catch (e) {
    res.status(502).json({ error: 'Upstream request failed' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT)
