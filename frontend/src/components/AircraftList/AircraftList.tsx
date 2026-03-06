import React, { useRef, useEffect } from 'react';
import type { Aircraft } from '../../types';
import { Plane, Navigation, TrendingUp, MapPin, AlertCircle } from 'lucide-react';

interface AircraftListProps {
  aircraft: Aircraft[];
  selectedAircraft: Aircraft | null;
  onSelectAircraft: (aircraft: Aircraft) => void;
  loading: boolean;
  error: string | null;
  compact?: boolean;
  displayLimit?: number;
  onDisplayLimitChange?: (value: number) => void;
}

const AircraftList: React.FC<AircraftListProps> = ({
  aircraft,
  selectedAircraft,
  onSelectAircraft,
  loading,
  error,
  compact = false,
  displayLimit,
  onDisplayLimitChange,
}) => {
  const formatAltitude = (alt: number | null) => {
    if (!alt) return 'N/A';
    const feet = Math.round(alt / 0.3048);
    return `${feet.toLocaleString()} ft`;
  };

  const formatSpeed = (speed: number | null) => {
    if (!speed) return 'N/A';
    const knots = Math.round(speed * 1.94384);
    return `${knots} kts`;
  };

  const formatVerticalRate = (rate: number | null) => {
    if (!rate) return 'N/A';
    const fpm = Math.round(rate * 196.85); // Convert m/s to ft/min
    return `${Math.abs(fpm)} ${rate > 0 ? '↑' : '↓'}`;
  };

  const getCategoryName = (category: number) => {
    const categories: { [key: number]: string } = {
      2: 'Light Aircraft',
      3: 'Small Jets',
      4: 'Large Commercial',
      6: 'Heavy Jets',
      7: 'High Performance',
      8: 'Helicopters',
      14: 'UAVs/Drones'
    };
    return categories[category] || 'Unknown';
  };

  if (loading) {
    return (
      <div className={compact ? 'p-3 text-center' : 'p-8 text-center'}>
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400 mx-auto mb-2"></div>
        {!compact && <p className="text-gray-400">Loading aircraft data...</p>}
      </div>
    );
  }

  if (error) {
    return (
      <div className={compact ? 'p-3 text-center' : 'p-6 text-center'}>
        <AlertCircle className={compact ? 'w-6 h-6 text-red-400 mx-auto mb-1' : 'w-12 h-12 text-red-400 mx-auto mb-4'} />
        {!compact && <h3 className="text-lg font-semibold text-red-300 mb-2">Error</h3>}
        <p className={compact ? 'text-gray-400 text-xs' : 'text-gray-400'}>{error}</p>
      </div>
    );
  }

  // Ref map to each list item so we can scroll the selected one into view
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Auto-scroll selected aircraft into view whenever selection changes
  useEffect(() => {
    if (!selectedAircraft) return;
    const el = itemRefs.current.get(selectedAircraft.icao24);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedAircraft]);

  const sortedAircraft = React.useMemo(() => {
    const priorityCategories = new Set([2, 3, 4, 6, 8, 14]); // Light, Small, Large, Heavy, Helicopters, UAV

    return [...aircraft].sort((a, b) => {
      const aIsPriority = priorityCategories.has(a.category);
      const bIsPriority = priorityCategories.has(b.category);

      // Priority categories come first
      if (aIsPriority && !bIsPriority) return -1;
      if (!aIsPriority && bIsPriority) return 1;

      // Within priority categories, sort by category number
      if (aIsPriority && bIsPriority) {
        return a.category - b.category;
      }

      // For non-priority categories, maintain original order
      return 0;
    });
  }, [aircraft]);

  /* ──────────────── COMPACT (mobile overlay) ───────────────── */
  if (compact) {
    return (
      <div className="h-full flex flex-col">
        {/* Compact header */}
        <div className="px-2 py-1.5 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Plane className="w-3 h-3 text-blue-400" />
            <span className="text-xs font-semibold text-white">Live Aircraft</span>
          </div>
          <span className="bg-blue-900/60 text-blue-200 text-xs px-1.5 py-0.5 rounded-full">
            {sortedAircraft.length}
          </span>
        </div>

        {/* Compact list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {sortedAircraft.map((plane) => (
            <div
              key={plane.icao24}
              ref={el => {
                if (el) itemRefs.current.set(plane.icao24, el);
                else itemRefs.current.delete(plane.icao24);
              }}
              onClick={() => onSelectAircraft(plane)}
              className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer border-b border-gray-700/40 transition ${
                selectedAircraft?.icao24 === plane.icao24
                  ? 'bg-blue-900/40 border-l-2 border-l-blue-500'
                  : 'hover:bg-gray-700/50'
              }`}
            >
              {/* Category dot */}
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                plane.category === 6 ? 'bg-purple-500' :
                plane.category === 4 ? 'bg-orange-500' :
                plane.category === 2 ? 'bg-green-500' :
                plane.category === 8 ? 'bg-yellow-400' :
                'bg-gray-400'
              }`} />

              {/* Callsign + country */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white truncate leading-tight">
                  {plane.callsign || plane.icao24}
                </div>
                <div className="text-xs text-gray-400 truncate leading-tight">
                  {plane.origin_country}
                </div>
              </div>

              {/* Altitude + speed */}
              <div className="text-right flex-shrink-0">
                <div className="text-xs font-medium text-blue-300 leading-tight">
                  {formatAltitude(plane.baro_altitude)}
                </div>
                <div className="text-xs text-gray-400 leading-tight">
                  {formatSpeed(plane.velocity)}
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Aircraft Limit slider — pinned at bottom of compact panel */}
        {onDisplayLimitChange !== undefined && displayLimit !== undefined && (
          <div className="border-t border-gray-700 px-2 py-2 flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 leading-tight">Limit</span>
              <span className="text-xs font-bold text-green-300">{displayLimit}</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="10"
              value={displayLimit}
              onChange={(e) => onDisplayLimitChange(Number(e.target.value))}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
        )}      </div>
    );
  }

  /* ──────────────── FULL (desktop sidebar) ───────────────── */
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold flex items-center">
          <Plane className="w-5 h-5 mr-2" />
          Live Aircraft
          <span className="ml-2 bg-blue-900/50 text-blue-200 px-2 py-1 rounded text-xs">
            {sortedAircraft.length}
          </span>
        </h2>
        <p className="text-sm text-gray-400 mt-1">Click on an aircraft to track it</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-3">
          {sortedAircraft.map((plane) => (
            <div
              key={plane.icao24}
              ref={el => {
                if (el) itemRefs.current.set(plane.icao24, el);
                else itemRefs.current.delete(plane.icao24);
              }}
              className={`p-4 rounded-lg cursor-pointer transition-all transform hover:scale-[1.02] ${
                selectedAircraft?.icao24 === plane.icao24
                  ? 'bg-blue-900/30 border-2 border-blue-500'
                  : 'bg-gray-800/50 hover:bg-gray-800 border border-gray-700'
              }`}
              onClick={() => onSelectAircraft(plane)}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full mr-2 ${
                      plane.category === 6 ? 'bg-purple-500' :
                      plane.category === 4 ? 'bg-orange-500' :
                      plane.category === 2 ? 'bg-green-500' :
                      'bg-gray-500'
                    }`} />
                    <div className="truncate">
                      <div className="font-semibold text-lg truncate">
                        {plane.callsign || plane.icao24}
                      </div>
                      <div className="text-sm text-gray-400 truncate">
                        {plane.origin_country}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {getCategoryName(plane.category)} • ICAO: {plane.icao24}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xl font-bold text-blue-300">
                    {formatAltitude(plane.baro_altitude)}
                  </div>
                  <div className="text-xs text-gray-400">Altitude</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Navigation className="w-4 h-4 mr-2 text-gray-400" />
                    <span className="font-medium">{formatSpeed(plane.velocity)}</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <TrendingUp className="w-4 h-4 mr-2 text-gray-400" />
                    <span className={plane.vertical_rate && plane.vertical_rate > 0 ? 'text-green-400' : 'text-red-400'}>
                      {formatVerticalRate(plane.vertical_rate)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm">
                    <div className="text-gray-400">Heading</div>
                    <div className="font-medium">
                      {plane.true_track ? `${Math.round(plane.true_track)}°` : 'N/A'}
                    </div>
                  </div>
                  <div className="text-sm">
                    <div className="text-gray-400">On Ground</div>
                    <div className={plane.on_ground ? 'text-green-400' : 'text-blue-400'}>
                      {plane.on_ground ? 'Yes' : 'No'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-700/50">
                <div className="flex items-center text-xs text-gray-400">
                  <MapPin className="w-3 h-3 mr-1" />
                  <span className="truncate">
                    {plane.latitude?.toFixed(4) || 'N/A'}, {plane.longitude?.toFixed(4) || 'N/A'}
                  </span>
                </div>
              </div>

              {plane.squawk && plane.squawk !== '0' && (
                <div className="mt-2">
                  <span className="inline-block bg-red-900/30 text-red-200 px-2 py-1 rounded text-xs">
                    Squawk: {plane.squawk}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 border-t border-gray-700 text-xs text-gray-400 text-center">
        <p>Auto-updates every 5 seconds</p>
        <p className="mt-1">Click aircraft to focus on map</p>
      </div>
    </div>
  );
};

export default AircraftList;