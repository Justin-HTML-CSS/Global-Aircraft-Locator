import axios from 'axios';
import type { AircraftResponse } from '../../types';

export const aircraftService = {
  async getAllAircraft(limit: number = 100): Promise<AircraftResponse> {
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
    try {
      const response = await axios.get(`${apiUrl}/aircraft?limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching aircraft:', error);
      // Return empty array when backend is unavailable - no mock data
      return {
        success: false,
        timestamp: Date.now() / 1000,
        aircraft: [],
        total: 0,
        displayed: 0,
        error: 'Backend unavailable'
      };
    }
  }
};