import React from 'react';

interface StatusBadgeProps {
  status: 'online' | 'offline' | 'warning' | 'error';
  text: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, text }) => {
  const statusConfig = {
    online: {
      bg: 'bg-green-900/30',
      text: 'text-green-400',
      dot: 'bg-green-400'
    },
    offline: {
      bg: 'bg-gray-700/30',
      text: 'text-gray-400',
      dot: 'bg-gray-400'
    },
    warning: {
      bg: 'bg-yellow-900/30',
      text: 'text-yellow-400',
      dot: 'bg-yellow-400'
    },
    error: {
      bg: 'bg-red-900/30',
      text: 'text-red-400',
      dot: 'bg-red-400'
    }
  };

  const config = statusConfig[status];

  return (
    <div className={`inline-flex items-center ${config.bg} ${config.text} px-3 py-1 rounded-full text-sm`}>
      <div className={`w-2 h-2 rounded-full ${config.dot} mr-2`}></div>
      {text}
    </div>
  );
};

export default StatusBadge;