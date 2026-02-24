import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

interface EmergencyPopupProps {
  priorityDirection: string;
  roadMode: string;
}

const EmergencyPopup = ({ priorityDirection, roadMode }: EmergencyPopupProps) => {
  const [isVisible, setIsVisible] = useState(true);

  // Get direction name for display
  const getDirectionName = (dir: string) => {
    const names: Record<string, string> = {
      'NORTH': 'North',
      'SOUTH': 'South',
      'EAST': 'East',
      'WEST': 'West'
    };
    return names[dir] || dir;
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999]">
      <div className="bg-destructive text-destructive-foreground border-b-4 border-destructive-foreground shadow-2xl animate-pulse">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-4xl animate-bounce">🚑</div>
              <div>
                <h2 className="text-2xl font-bold mb-1">
                  🚨 EMERGENCY VEHICLE DETECTED
                </h2>
                <p className="text-lg">
                  Ambulance approaching from <strong>{getDirectionName(priorityDirection)}</strong> direction
                </p>
                <p className="text-sm opacity-90 mt-1">
                  Green corridor activated • Conflicting traffic halted
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold bg-destructive-foreground/20 px-4 py-2 rounded">
                System override active — Traffic Control Mode
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmergencyPopup;
