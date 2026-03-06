const axios = require('axios');
const redis = require('redis');
require('dotenv').config();

class OpenSkyService {
  constructor() {
    this.clientId = process.env.OPENSKY_CLIENT_ID;
    this.clientSecret = process.env.OPENSKY_CLIENT_SECRET;
    this.baseUrl = 'https://opensky-network.org/api';
    this.redisClient = redis.createClient({
      url: process.env.REDIS_URL
    });
    
    this.redisClient.connect();
    this.accessToken = null;
    this.tokenExpiry = null;
  }
  
  async getAccessToken() {
    try {
      const response = await axios.post(
        'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      return this.accessToken;
    } catch (error) {
      console.error('Error getting OpenSky token:', error);
      throw error;
    }
  }
  
  async getAllStates(bbox = null) {
    try {
      // Check cache first
      const cacheKey = `states:${bbox ? bbox.join(':') : 'all'}`;
      const cached = await this.redisClient.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }
      
      // Get fresh token if needed
      if (!this.accessToken || Date.now() >= this.tokenExpiry) {
        await this.getAccessToken();
      }
      
      const url = `${this.baseUrl}/states/all`;
      const params = {};
      
      if (bbox) {
        params.lamin = bbox[0];
        params.lamax = bbox[1];
        params.lomin = bbox[2];
        params.lomax = bbox[3];
      }
      
      const response = await axios.get(url, {
        params,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      const data = response.data;
      
      // Cache for 5 seconds (OpenSky updates every 5-10 seconds)
      await this.redisClient.setEx(cacheKey, 5, JSON.stringify(data));
      
      return data;
    } catch (error) {
      console.error('Error fetching states:', error);
      throw error;
    }
  }
  
  // Filter and limit aircraft
  filterAndLimitAircraft(states, limit = 100, bbox = null) {
    let filtered = states.states || [];
    
    // Filter by bounding box if provided
    if (bbox) {
      filtered = filtered.filter(state => {
        const [lat, lon] = [state[6], state[5]];
        return lat >= bbox[0] && lat <= bbox[1] && 
               lon >= bbox[2] && lon <= bbox[3];
      });
    }
    
    // Limit to specified number
    if (filtered.length > limit) {
      // Simple cycling mechanism - store last index in Redis
      const cycleIndex = Math.floor(Date.now() / 10000) % Math.ceil(filtered.length / limit);
      filtered = filtered.slice(cycleIndex * limit, (cycleIndex + 1) * limit);
    }
    
    return filtered.map(state => ({
      icao24: state[0],
      callsign: state[1]?.trim() || null,
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
      category: state[17]
    }));
  }
}

module.exports = new OpenSkyService();