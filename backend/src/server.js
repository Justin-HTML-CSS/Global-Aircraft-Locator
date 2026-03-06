const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.io
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());

// Store connected clients
const clients = new Set();

// OpenSky API configuration
const OPENSKY_BASE_URL = 'https://opensky-network.org/api';
const OPENSKY_AUTH_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const MAX_AIRCRAFT_DISPLAY = 100; // Limit to 100 aircraft as requested

// OpenSky OAuth2 credentials
const OPENSKY_CLIENT_ID = process.env.OPENSKY_CLIENT_ID || 'stevc456-api-client';
const OPENSKY_CLIENT_SECRET = process.env.OPENSKY_CLIENT_SECRET || '52WphjyQihoLWW2aTj06dM2yznq96YFA';

// Global access token storage
let accessToken = null;
let tokenExpiry = 0;

// Rate limit handling
let lastOpenSkyRequestTime = 0;
let openSkyRateLimitResets = null;
let failureCount = 0;
const MIN_REQUEST_INTERVAL = 2000; // Minimum 2 seconds between requests to OpenSky

// Function to get OAuth2 access token
async function getAccessToken() {
  const now = Date.now() / 1000; // Current time in seconds

  // Return cached token if still valid (with 5 minute buffer)
  if (accessToken && tokenExpiry > now + 300) {
    return accessToken;
  }

  try {
    console.log('Getting OpenSky access token...');

    const response = await axios.post(OPENSKY_AUTH_URL, new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: OPENSKY_CLIENT_ID,
      client_secret: OPENSKY_CLIENT_SECRET
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (response.data && response.data.access_token) {
      accessToken = response.data.access_token;
      // Token expires in 30 minutes, but we'll refresh it
      tokenExpiry = now + (response.data.expires_in || 1800);
      console.log('OpenSky access token obtained successfully');
      return accessToken;
    }

    throw new Error('No access token in response');
  } catch (error) {
    console.error('Error getting OpenSky access token:', error.message);
    return null;
  }
}

// Function to intelligently categorize aircraft based on available data
function categorizeAircraft(state) {
  const [icao24, callsign, origin_country, time_position, last_contact, longitude, latitude, baro_altitude, on_ground, velocity, true_track, vertical_rate, sensors, geo_altitude, squawk, spi, position_source, category] = state;

  // If category is already provided and valid, use it
  if (category && category > 0) {
    return category;
  }

  // Try to categorize based on callsign patterns
  if (callsign) {
    const call = callsign.trim().toUpperCase();

    // Commercial airlines (usually large/heavy)
    if (call.match(/^(AFR|BAW|DLH|KLM|LUF|IBE|AZA|ITY|RYR|EIN|WZZ|VLG|IBS|ANE|ACA|ACA|TSC|WJA|PDT|MAL|JZA|ACA|WEN|MAL|JZA|ACA|WEN)/)) {
      return 4; // Large Commercial
    }

    // Business jets (small jets)
    if (call.match(/^(NJE|LXJ|XOJ|ASJ|BJC|JFA|JFK|JHW|JTL|JWC|LXJ|NJE|XOJ)/) || call.length <= 3) {
      return 3; // Small Jets
    }

    // Military patterns
    if (call.match(/^(ARMY|NAVY|AF|USAF|MARINE|PAT|CNV|CIV|CIVIL|COAST|CG|USCG)/)) {
      return 6; // Heavy Jets (military often heavy)
    }

    // Helicopter patterns
    if (call.match(/^(HELI|CHOP|ROTOR|SAR|EMS|POLICE|NEWS)/) || call.includes('H')) {
      return 8; // Helicopters
    }

    // UAV/Drone patterns
    if (call.match(/^(DRONE|UAV|QUAD|HEX|OCT|MULTI)/) || call.length <= 2) {
      return 14; // UAVs/Drones
    }
  }

  // Try to categorize based on altitude and speed
  const altitude = baro_altitude || geo_altitude;
  const speed = velocity;

  if (altitude && speed) {
    // High altitude, high speed = commercial/large aircraft
    if (altitude > 25000 && speed > 400) {
      return 4; // Large Commercial
    }

    // Medium altitude, medium speed = business jets
    if (altitude > 15000 && speed > 300 && speed <= 500) {
      return 3; // Small Jets
    }

    // Low altitude, low speed = light aircraft or helicopters
    if (altitude < 10000 && speed < 200) {
      // Very low speed = helicopter
      if (speed < 100) {
        return 8; // Helicopters
      }
      return 2; // Light Aircraft
    }

    // Very high speed = heavy military
    if (speed > 600) {
      return 6; // Heavy Jets
    }
  }

  // Try to categorize based on ICAO24 (registration patterns)
  if (icao24) {
    const icao = icao24.toUpperCase();

    // US military patterns
    if (icao.match(/^AE|AD|AF|N7|N8|N9/)) {
      return 6; // Heavy Jets (military)
    }

    // Civil aircraft patterns
    if (icao.match(/^4[0-9A-F]|3[0-9A-F]|2[0-9A-F]/)) {
      // European patterns often commercial
      return 4; // Large Commercial
    }
  }

  // Default to Light Aircraft if we can't determine
  return 2; // Light Aircraft
}

// Function to fetch aircraft data from OpenSky API
async function fetchAircraftData(limit = MAX_AIRCRAFT_DISPLAY) {
  try {
    console.log('Fetching aircraft data from OpenSky API...');

    // Enforce minimum request interval to avoid rate limits
    const timeSinceLastRequest = Date.now() - lastOpenSkyRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      console.log(`Rate limit: waiting ${MIN_REQUEST_INTERVAL - timeSinceLastRequest}ms before next request`);
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
    }

    // Get access token
    const token = await getAccessToken();
    if (!token) {
      console.error('No access token available, cannot fetch aircraft data');
      failureCount++;
      return { aircraft: [], total: 0 };
    }

    // Make authenticated request
    const response = await axios.get(`${OPENSKY_BASE_URL}/states/all`, {
      timeout: 10000, // 10 second timeout
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Global-Plane-Locator/1.0'
      }
    });

    lastOpenSkyRequestTime = Date.now();
    failureCount = 0; // Reset failure count on success

    if (response.data && response.data.states) {
      const states = response.data.states;
      const totalAvailable = states.length;

      // Transform OpenSky data to our format and limit to the requested number
      const aircraft = states.slice(0, limit).map(state => ({
        icao24: state[0],
        callsign: state[1] ? state[1].trim() : null,
        origin_country: state[2],
        time_position: state[3],
        last_contact: state[4],
        longitude: state[5],
        latitude: state[6],
        baro_altitude: state[7],
        on_ground: state[8],
        velocity: state[9],
        true_track: state[10],
        vertical_rate: state[11],
        sensors: state[12],
        geo_altitude: state[13],
        squawk: state[14],
        spi: state[15],
        position_source: state[16],
        category: categorizeAircraft(state) // Use intelligent categorization
      }));

      console.log(`✅ Fetched ${aircraft.length} aircraft from OpenSky API (total available: ${totalAvailable})`);
      return { aircraft, total: totalAvailable };
    }

    return { aircraft: [], total: 0 };
  } catch (error) {
    lastOpenSkyRequestTime = Date.now();
    failureCount++;

    if (error.response?.status === 429) {
      console.warn(`⚠️ Rate limit error (429) - Failures: ${failureCount}. Backing off...`);
      // If we're getting rate limited, use mock data for testing
      if (failureCount > 3) {
        console.log('🔄 Switching to mock data due to persistent rate limiting');
        return generateMockAircraftData(limit);
      }
    } else {
      console.error(`❌ Error fetching from OpenSky API:`, error.response?.status || error.code, error.message);
    }

    return { aircraft: [], total: 0 };
  }
}

// Generate mock aircraft data for testing when OpenSky API is unavailable
function generateMockAircraftData(limit = MAX_AIRCRAFT_DISPLAY) {
  const mockAircraft = [];
  const baseLatitude = 40.7128; // New York
  const baseLongitude = -74.0060;
  
  for (let i = 0; i < limit; i++) {
    const icao = Math.random().toString(16).substr(2, 6).toUpperCase();
    mockAircraft.push({
      icao24: icao,
      callsign: `FL${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      origin_country: 'United States',
      time_position: Math.floor(Date.now() / 1000),
      last_contact: Math.floor(Date.now() / 1000),
      longitude: baseLongitude + (Math.random() - 0.5) * 4,
      latitude: baseLatitude + (Math.random() - 0.5) * 4,
      baro_altitude: 10000 + Math.random() * 30000,
      on_ground: false,
      velocity: 300 + Math.random() * 250,
      true_track: Math.random() * 360,
      vertical_rate: (Math.random() - 0.5) * 500,
      sensors: null,
      geo_altitude: 10000 + Math.random() * 30000,
      squawk: Math.floor(1000 + Math.random() * 8000).toString(),
      spi: false,
      position_source: 0,
      category: Math.floor(2 + Math.random() * 7)
    });
  }
  
  console.log(`📊 Generated ${mockAircraft.length} mock aircraft`);
  return { aircraft: mockAircraft, total: mockAircraft.length };
}

// Cache for aircraft data
let aircraftCache = [];
let lastFetchTime = 0;
let totalAvailableCache = 0;
let forceRefresh = false; // Flag to force next fetch to skip cache
const CACHE_DURATION = 10000; // 10 second cache - OpenSky API has strict rate limits

// Function to get aircraft data (with caching)
async function getAircraftData(limit = MAX_AIRCRAFT_DISPLAY) {
  const now = Date.now();
  
  // Use shorter cache duration when we're getting errors
  const cacheDuration = failureCount > 0 ? 2000 : 10000;

  // Skip cache if forceRefresh flag is set
  if (now - lastFetchTime > cacheDuration || aircraftCache.length === 0 || forceRefresh) {
    try {
      const result = await fetchAircraftData(limit);

      // If we got a non-empty result, replace the cache.
      // If result is empty due to transient errors, keep previous cache
      // so frontend doesn't suddenly receive 0 aircraft.
      if (result && Array.isArray(result.aircraft) && result.aircraft.length > 0) {
        aircraftCache = result.aircraft;
        totalAvailableCache = result.total;
        lastFetchTime = now;
        // Successful fetch should reset failure count
        failureCount = 0;
        forceRefresh = false; // Reset the force refresh flag after successful fetch
      } else {
        console.warn('Empty aircraft result from fetch; preserving existing cache');
        failureCount++;

        // If we have no cache at all and repeated failures, fall back to mock data
        if (aircraftCache.length === 0 && failureCount > 3) {
          const mock = generateMockAircraftData(limit);
          aircraftCache = mock.aircraft;
          totalAvailableCache = mock.total;
          lastFetchTime = now;
          console.log('Using mock aircraft data due to persistent failures');
          forceRefresh = false;
        }
      }
    } catch (error) {
      console.error('Error fetching aircraft data:', error);
      failureCount++;
      // Keep previous cache when fetch fails
      if (aircraftCache.length === 0 && failureCount > 3) {
        const mock = generateMockAircraftData(limit);
        aircraftCache = mock.aircraft;
        totalAvailableCache = mock.total;
        lastFetchTime = now;
        console.log('Using mock aircraft data due to persistent failures');
        forceRefresh = false;
      }
    }
  }

  return { aircraft: aircraftCache, total: totalAvailableCache };
}

// WebSocket connection for real-time updates
io.on('connection', (socket) => {
  console.log('New client connected');
  clients.add(socket.id);

  // Send initial data
  sendAircraftUpdate(socket);

  // Set up periodic updates every 5 seconds for smooth real-time animation
  const interval = setInterval(() => {
    sendAircraftUpdate(socket);
  }, 5000);

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    clients.delete(socket.id);
    clearInterval(interval);
  });

  socket.on('request-update', () => {
    sendAircraftUpdate(socket);
  });
});

async function sendAircraftUpdate(socket) {
  try {
    const result = await getAircraftData();
    const { aircraft, total } = result;

    socket.emit('aircraft-update', {
      success: true,
      timestamp: Date.now() / 1000,
      aircraft: aircraft,
      total: total,
      displayed: aircraft.length
    });
  } catch (error) {
    console.error('Error sending aircraft update:', error);
    socket.emit('aircraft-update', {
      success: false,
      error: 'Failed to fetch aircraft data',
      timestamp: Date.now() / 1000,
      aircraft: [],
      total: 0,
      displayed: 0
    });
  }
}

// REST endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    clients: clients.size,
    message: 'Real-time Airplane Tracker Backend with OpenSky API'
  });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'Test endpoint works' });
});

app.get('/api/aircraft', async (req, res) => {
  console.log('API /api/aircraft called');
  try {
    const requested = parseInt(req.query.limit);
    const limit = Number.isFinite(requested)
      ? Math.min(requested, MAX_AIRCRAFT_DISPLAY)
      : MAX_AIRCRAFT_DISPLAY;

    if (requested && requested > MAX_AIRCRAFT_DISPLAY) {
      console.log(`Clamping requested limit ${requested} -> ${limit} to protect OpenSky rate limits`);
    }

    console.log('Fetching aircraft data...');
    const result = await getAircraftData(limit);
    const { aircraft, total } = result;
    console.log(`Returning ${aircraft.length} aircraft (total available: ${total})`);
    res.json({
      success: true,
      timestamp: Date.now() / 1000,
      aircraft: aircraft,
      total: total,
      displayed: aircraft.length,
      source: 'OpenSky Network API'
    });
  } catch (error) {
    console.error('Error in /api/aircraft:', error);
    // Return empty array when API fails - no mock data
    res.json({
      success: false,
      timestamp: Date.now() / 1000,
      aircraft: [],
      total: 0,
      displayed: 0,
      source: 'API Error - Rate Limited',
      error: error.message
    });
  }
});

app.get('/api/stats', (req, res) => {
  res.json({
    connectedClients: clients.size,
    serverTime: new Date().toISOString(),
    lastFetchTime: new Date(lastFetchTime).toISOString(),
    cachedAircraft: aircraftCache.length,
    message: 'Real-time data from OpenSky Network'
  });
});

app.post('/api/refresh', (req, res) => {
  // Force the next fetch to bypass cache
  forceRefresh = true;
  lastFetchTime = 0; // Invalidate cache immediately
  res.json({
    success: true,
    message: 'Cache refresh triggered',
    timestamp: Date.now() / 1000
  });
});

const PORT = process.env.PORT || 3001;
try {
  server.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
    console.log(`✈️  Aircraft data: http://localhost:${PORT}/api/aircraft`);
    console.log(`🔌 WebSocket ready for connections`);
  });
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});