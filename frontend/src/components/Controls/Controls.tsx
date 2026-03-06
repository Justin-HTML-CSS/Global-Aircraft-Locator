import React from 'react';
import type { Aircraft } from '../../types';
import { 
  Settings, 
  Sliders, 
  Filter, 
  Maximize2, 
  Globe,
  Eye,
  Layers,
  MapPin,
  Navigation,
  Satellite,
  Radio
} from 'lucide-react';

interface ControlsProps {
  maxDisplayCount: number;
  onMaxDisplayCountChange: (value: number) => void;
  selectedAircraft: Aircraft | null;
  onToggleLabels: () => void;
  onTogglePaths: () => void;
  showLabels: boolean;
  showPaths: boolean;
  viewMode: 'global' | 'follow' | 'cockpit' | 'approach' | 'satellite';
  onViewModeChange: (mode: 'global' | 'follow' | 'cockpit' | 'approach' | 'satellite') => void;
  enabledCategories: Set<number>;
  onToggleCategory: (category: number) => void;
  aircraft: Aircraft[];
}

const Controls: React.FC<ControlsProps> = ({
  maxDisplayCount,
  onMaxDisplayCountChange,
  selectedAircraft,
  onToggleLabels,
  onTogglePaths,
  showLabels,
  showPaths,
  viewMode,
  onViewModeChange,
  enabledCategories,
  onToggleCategory,
  aircraft
}) => {
  const aircraftCategories = [
    { id: 2, name: 'Light Aircraft', color: 'text-white' },
    { id: 3, name: 'Small Jets', color: 'text-white' },
    { id: 4, name: 'Large Commercial', color: 'text-white' },
    { id: 6, name: 'Heavy Jets', color: 'text-white' },
    { id: 7, name: 'High Performance', color: 'text-white' },
    { id: 8, name: 'Helicopters', color: 'text-white' },
    { id: 14, name: 'UAVs/Drones', color: 'text-white' },
  ];

  const categoryIconSources: { [key: number]: string } = {
    2: 'https://justinw.uk/air/Light-Aircraft.png',
    3: 'https://justinw.uk/air/Small-Jets.png',
    4: 'https://justinw.uk/air/Large-Commercial.png',
    6: 'https://justinw.uk/air/Heavy-Jets.png',
    7: 'https://justinw.uk/air/High-Performance.png',
    8: 'https://justinw.uk/air/Helicopters.png',
    14: 'https://justinw.uk/air/UAVs-Drones.png'
  };

  const renderCategoryIcon = (categoryId: number, colorClass: string) => {
    const iconClass = `w-4 h-4 ${colorClass}`;
    const iconSrc = categoryIconSources[categoryId] ?? categoryIconSources[2];

    return <img className={iconClass} src={iconSrc} alt="" aria-hidden="true" />;
  };

  // Calculate category counts
  const categoryCounts = React.useMemo(() => {
    const counts: { [key: number]: number } = {};
    aircraftCategories.forEach(cat => {
      counts[cat.id] = aircraft.filter(plane => plane.category === cat.id).length;
    });
    return counts;
  }, [aircraft, aircraftCategories]);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center">
          <Settings className="w-5 h-5 mr-2" />
          Controls
        </h2>
      </div>

      {/* Performance Controls */}
      <div className="bg-gray-900/50 p-4 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <Maximize2 className="w-4 h-4 mr-2 text-gray-400" />
            <span>Aircraft Display Limit</span>
          </div>
          <span className="font-bold text-green-300">{maxDisplayCount}</span>
        </div>

        <input
          type="range"
          min="10"
          max="100"
          step="10"
          value={maxDisplayCount}
          onChange={(e) => onMaxDisplayCountChange(Number(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-2">
          <span>Min</span>
          <span className="text-green-400 font-medium">{maxDisplayCount} (Fixed)</span>
        </div>
      </div>



      {/* View Modes — only shown when an aircraft is selected */}
      {selectedAircraft && (
        <div className="bg-gray-900/50 p-4 rounded-lg">
          <h3 className="font-medium mb-3 flex items-center">
            <Globe className="w-4 h-4 mr-2" />
            View Modes
          </h3>
          
          <div className="space-y-2">
            {[
              { id: 'follow', name: 'Follow Aircraft 3D', icon: Navigation },
              { id: 'cockpit', name: 'Cockpit View', icon: Eye },
              { id: 'approach', name: 'Follow Aircraft 2D', icon: MapPin }
            ].map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  onClick={() => onViewModeChange(mode.id as any)}
                  className={`w-full flex items-center justify-between p-3 rounded transition ${
                    viewMode === mode.id ? 'bg-blue-600 text-white' : 'hover:bg-gray-800/50 text-gray-300'
                  }`}
                >
                  <div className="flex items-center">
                    <Icon className="w-4 h-4 mr-3" />
                    <span>{mode.name}</span>
                  </div>
                  {viewMode === mode.id && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </button>
              );
            })}
          </div>
          
          {viewMode === 'follow' && (
            <p className="text-xs text-gray-400 mt-3">
              Following: {selectedAircraft.callsign || selectedAircraft.icao24}
            </p>
          )}
          
          {(viewMode === 'cockpit' || viewMode === 'approach') && (
            <p className="text-xs text-gray-400 mt-3">
              Viewing from: {selectedAircraft.callsign || selectedAircraft.icao24}
            </p>
          )}
        </div>
      )}

      {/* Aircraft Filters */}
      <div className="bg-gray-900/50 p-4 rounded-lg">
        <h3 className="font-medium mb-3 flex items-center">
          <Filter className="w-4 h-4 mr-2" />
          Aircraft Filters
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Aircraft Categories</label>
            <div className="flex flex-col gap-2">
              {aircraftCategories.map((cat) => (
                <label key={cat.id} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledCategories.has(cat.id)}
                    onChange={() => onToggleCategory(cat.id)}
                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                  />
                  {renderCategoryIcon(cat.id, cat.color)}
                  <span className="text-sm flex-1">{cat.name}</span>
                  <span className="text-xs text-gray-400 font-mono">({categoryCounts[cat.id] || 0})</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-amber-400 mt-2">
              📊 Limited: All categories (max 25 each) - Stable selection for consistent live tracking
            </p>
          </div>
        </div>
      </div>

      {/* Selected Aircraft Info */}
      {selectedAircraft && (
        <div className="bg-blue-900/20 border border-blue-800/50 p-4 rounded-lg">
          <h3 className="font-medium mb-3 flex items-center">
            <Radio className="w-4 h-4 mr-2" />
            Selected Aircraft
          </h3>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Callsign:</span>
              <span className="font-semibold">{selectedAircraft.callsign || selectedAircraft.icao24}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">ICAO24:</span>
              <span className="font-mono">{selectedAircraft.icao24}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Country:</span>
              <span>{selectedAircraft.origin_country}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Altitude:</span>
              <span className="text-blue-300">
                {selectedAircraft.baro_altitude ? 
                  `${Math.round(selectedAircraft.baro_altitude / 0.3048).toLocaleString()} ft` : 
                  'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Speed:</span>
              <span className="text-green-300">
                {selectedAircraft.velocity ? 
                  `${Math.round(selectedAircraft.velocity * 1.94384)} kts` : 
                  'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Heading:</span>
              <span>{selectedAircraft.true_track ? `${Math.round(selectedAircraft.true_track)}°` : 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Vertical Rate:</span>
              <span className={selectedAircraft.vertical_rate && selectedAircraft.vertical_rate > 0 ? 'text-green-400' : 'text-red-400'}>
                {selectedAircraft.vertical_rate ? 
                  `${Math.round(selectedAircraft.vertical_rate * 196.85)} fpm` : 
                  'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">On Ground:</span>
              <span className={selectedAircraft.on_ground ? 'text-green-400' : 'text-blue-400'}>
                {selectedAircraft.on_ground ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
          
          <button 
            onClick={() => onViewModeChange('follow')}
            className="w-full mt-4 bg-blue-600 hover:bg-blue-700 py-2 rounded text-sm font-medium transition"
          >
            Track Aircraft
          </button>
        </div>
      )}
    </div>
  );
};

export default Controls;