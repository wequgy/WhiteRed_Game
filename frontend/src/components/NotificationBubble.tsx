// src/components/NotificationBubble.tsx
import React from "react";

interface Props { open: boolean; message?: string; onClick?: () => void; }

const NotificationBubble: React.FC<Props> = ({ open, message, onClick }) => {
  if (!open) return null;
  return (
    <div onClick={onClick} className="fixed right-6 bottom-24 z-50">
      <div className="px-4 py-2 bg-[#1f1f1f] text-white rounded-full shadow-xl border border-neutral-800 animate-fade-bubble">
        <div className="text-sm max-w-xs truncate">{message}</div>
      </div>
    </div>
  );
};

export default NotificationBubble;
