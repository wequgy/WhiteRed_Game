// src/components/LoadingSpinner.tsx
import React from "react";

const LoadingSpinner: React.FC<{ size?: number }> = ({ size = 36 }) => {
  return (
    <div style={{ width: size, height: size }} className="flex items-center justify-center">
      <div className="rounded-full" style={{
        width: size, height: size,
        border: `${Math.max(3, Math.floor(size/12))}px solid rgba(255,255,255,0.06)`,
        borderTopColor: "rgba(255,45,85,0.95)",
        animation: "spin 1s linear infinite"
      }} />
    </div>
  );
};

export default LoadingSpinner;
