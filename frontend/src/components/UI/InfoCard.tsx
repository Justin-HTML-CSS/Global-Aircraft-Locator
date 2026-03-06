import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface InfoCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'red' | 'purple' | 'orange';
  change?: string;
}

const InfoCard: React.FC<InfoCardProps> = ({ 
  title, 
  value, 
  icon: Icon, 
  color = 'blue',
  change 
}) => {
  const colorClasses = {
    blue: 'text-blue-400 bg-blue-900/20',
    green: 'text-green-400 bg-green-900/20',
    red: 'text-red-400 bg-red-900/20',
    purple: 'text-purple-400 bg-purple-900/20',
    orange: 'text-orange-400 bg-orange-900/20'
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {change && (
          <span className={`text-xs px-2 py-1 rounded ${
            change.startsWith('+') ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
          }`}>
            {change}
          </span>
        )}
      </div>
      
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-gray-400">{title}</div>
      </div>
    </div>
  );
};

export default InfoCard;