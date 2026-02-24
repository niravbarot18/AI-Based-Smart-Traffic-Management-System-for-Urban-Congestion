import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Lightbulb, Activity, Signal } from "lucide-react";
import { detectionAPI } from "@/lib/api";

// ----------------------------------------------------------------------
// Subcomponent: TrafficLight (Visual Only)
// ----------------------------------------------------------------------
const TrafficLight = ({ status }: { status: "RED" | "YELLOW" | "GREEN" | "OFF" }) => {
  return (
    <div className="bg-zinc-950 p-2 rounded-xl border border-zinc-800 shadow-xl inline-flex flex-col gap-2 relative">
      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-zinc-900 transition-all duration-200 ${status === 'RED' ? 'bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.6)] animate-pulse-subtle' : 'bg-red-950/20 opacity-30'}`} />
      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-zinc-900 transition-all duration-200 ${status === 'YELLOW' ? 'bg-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.6)]' : 'bg-amber-950/20 opacity-30'}`} />
      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-zinc-900 transition-all duration-200 ${status === 'GREEN' ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.6)]' : 'bg-emerald-950/20 opacity-30'}`} />
    </div>
  );
};

// ----------------------------------------------------------------------
// Subcomponent: SignalBlock (Container for Light, Timer, Load)
// ----------------------------------------------------------------------
const SignalBlock = ({
  direction,
  status,
  seconds,
  congestion,
  positionClass // CSS class for positioning in grid
}: {
  direction: string;
  status: "RED" | "YELLOW" | "GREEN" | "OFF";
  seconds?: number;
  congestion: number;
  positionClass?: string;
}) => {

  const getLoadColor = (level: number) => {
    if (status === 'OFF') return 'bg-zinc-800';
    if (level < 40) return 'bg-emerald-500';
    if (level < 70) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className={`flex flex-col items-center justify-center p-2 min-w-[140px] min-h-[160px] transition-all ${positionClass}`}>

      {/* Header: Label & Timer */}
      <div className="flex items-center justify-between w-full mb-2 bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800/50 backdrop-blur-sm">
        <span className="text-zinc-400 text-[10px] font-bold tracking-widest uppercase">{direction}</span>
        {seconds !== undefined && status !== 'OFF' ? (
          <span className={`font-mono font-bold text-lg ${seconds < 5 ? 'text-red-500 animate-pulse' : 'text-amber-400'}`}>
            {seconds}s
          </span>
        ) : <span className="text-zinc-700 text-xs">--</span>}
      </div>

      {/* Main Visuals: Light + Load */}
      <div className="flex flex-row items-center gap-3">

        {/* Signal Light */}
        <TrafficLight status={status} />

        {/* Load Bar (Vertical or Horizontal?) - Horizontal request */}
        <div className="flex flex-col gap-1 w-[12px] h-[100px] bg-zinc-900 rounded-full border border-zinc-800 relative overflow-hidden" title={`Load: ${Math.round(congestion)}%`}>
          <div
            className={`w-full absolute bottom-0 transition-all duration-700 ${getLoadColor(congestion)}`}
            style={{ height: `${status === 'OFF' ? 0 : congestion}%` }}
          />
        </div>
      </div>

      {/* Load Text */}
      <div className="mt-2 text-[10px] text-zinc-500 font-mono">
        LOAD: <span className={congestion > 80 ? 'text-red-400' : 'text-zinc-300'}>{Math.round(congestion)}%</span>
      </div>

    </div>
  );
};

// ----------------------------------------------------------------------
// Main Component: TrafficSignalControl
// ----------------------------------------------------------------------
const TrafficSignalControl = () => {
  const [signalStatus, setSignalStatus] = useState<any>(null);
  const [signalDecisions, setSignalDecisions] = useState<any[]>([]);
  const [trafficData, setTrafficData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [emergencyStatus, setEmergencyStatus] = useState<any>(null);
  const [isOffline, setIsOffline] = useState(true);

  // Fetch all data
  const fetchAllData = async () => {
    try {
      const [signalRes, decisionRes, trafficRes, emergencyRes] = await Promise.all([
        fetch('http://localhost:5000/api/signal/status').then(r => r.json()).catch(() => ({ success: false })),
        fetch('http://localhost:5000/api/signal/decisions').then(r => r.json()).catch(() => ({ success: false })),
        fetch('http://localhost:5000/api/traffic/data').then(r => r.json()).catch(() => ({ success: false })),
        detectionAPI.getEmergencyStatus()
      ]);

      if (signalRes.success) {
        setSignalStatus(signalRes.data);
        setIsOffline(false);
      } else {
        setSignalStatus(null);
        setIsOffline(true);
      }
      if (decisionRes.success) setSignalDecisions(decisionRes.data);
      if (trafficRes.success) setTrafficData(trafficRes.data);
      if (emergencyRes.success && emergencyRes.data) setEmergencyStatus(emergencyRes.data);

    } catch (err) {
      console.error("Error fetching traffic control data", err);
      setSignalStatus(null);
      setIsOffline(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 2000);
    return () => clearInterval(interval);
  }, []);

  const signals = signalStatus?.signals || { NORTH: { state: "OFF" }, SOUTH: { state: "OFF" }, EAST: { state: "OFF" }, WEST: { state: "OFF" } };
  const congestion = { NORTH: 0, SOUTH: 0, EAST: 0, WEST: 0 };
  const isEmergency = !!emergencyStatus?.emergency;

  return (
    <div className="space-y-6">
      <Card className="bg-zinc-950 shadow-2xl border-zinc-800 overflow-hidden">
        <CardHeader className="border-b border-zinc-900 bg-zinc-950 pb-4 pt-5 px-6">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-900/20 rounded-lg">
                <Signal className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Main Intersection Control</h2>
                <div className="text-zinc-500 text-xs font-mono uppercase tracking-widest mt-0.5">SYSTEM ID: TSC-4022 • ZONE A</div>
              </div>
            </div>
            {isOffline ? (
              <Badge variant="outline" className="border-zinc-700 text-zinc-500 px-4 py-1.5 font-mono uppercase tracking-widest">Signal Offline</Badge>
            ) : isEmergency ? (
              <Badge variant="destructive" className="bg-red-600 animate-pulse px-4 py-1.5 font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(220,38,38,0.5)]">Emergency Override</Badge>
            ) : (
              <Badge className="bg-emerald-600/10 text-emerald-500 border border-emerald-500/20 px-4 py-1.5 font-mono uppercase tracking-widest">Adaptive Running</Badge>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div className="flex flex-col h-full">

            {/* TOP: Intersection Layout (Robust Grid) */}
            <div className={`relative bg-black min-h-[500px] flex items-center justify-center p-8 overflow-hidden transition-all duration-700 ${isOffline ? 'grayscale opacity-50' : ''}`}>

              {/* Background Markings */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                <div className="w-[120px] h-full bg-zinc-800/30"></div>
                <div className="absolute h-[120px] w-full bg-zinc-800/30"></div>
                <div className="absolute w-[2px] h-full bg-dashed-zinc border-l border-dashed border-zinc-600/50"></div>
                <div className="absolute h-[2px] w-full bg-dashed-zinc border-t border-dashed border-zinc-600/50"></div>
              </div>

              {/* Center Hub */}
              <div className="absolute z-0 w-24 h-24 rounded-2xl bg-zinc-900/80 border border-zinc-800/50 shadow-2xl flex items-center justify-center">
                <div className={`w-3 h-3 rounded-full ${isEmergency ? 'bg-red-500 animate-ping' : 'bg-blue-500 animate-pulse'}`}></div>
              </div>

              {/* INTERSECTION GRID CONTAINER */}
              {/* Using a 3x3 Grid for layout stability */}
              <div className="w-full max-w-[800px] aspect-square relative grid grid-cols-3 grid-rows-3 gap-4 z-10 pointer-events-none">

                {/* NORTH */}
                <div className="col-start-2 row-start-1 flex justify-center items-end pointer-events-auto">
                  <SignalBlock
                    direction="NORTH"
                    status={signals.NORTH?.state as any}
                    seconds={isOffline ? undefined : signals.NORTH?.remaining}
                    congestion={congestion.NORTH}
                  />
                </div>

                {/* SOUTH */}
                <div className="col-start-2 row-start-3 flex justify-center items-start pointer-events-auto">
                  <SignalBlock
                    direction="SOUTH"
                    status={signals.SOUTH?.state as any}
                    seconds={isOffline ? undefined : signals.SOUTH?.remaining}
                    congestion={congestion.SOUTH}
                  />
                </div>

                {/* WEST */}
                <div className="col-start-1 row-start-2 flex justify-end items-center pointer-events-auto">
                  <SignalBlock
                    direction="WEST"
                    status={signals.WEST?.state as any}
                    seconds={isOffline ? undefined : signals.WEST?.remaining}
                    congestion={congestion.WEST}
                  />
                </div>

                {/* EAST */}
                <div className="col-start-3 row-start-2 flex justify-start items-center pointer-events-auto">
                  <SignalBlock
                    direction="EAST"
                    status={signals.EAST?.state as any}
                    seconds={isOffline ? undefined : signals.EAST?.remaining}
                    congestion={congestion.EAST}
                  />
                </div>
              </div>
            </div>

            {/* BOTTOM: Metrics Panel */}
            <div className="bg-zinc-950 border-t border-zinc-900 p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-zinc-900/30 p-4 rounded border border-zinc-800/50 flex items-center justify-between">
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Vehicles Detected</div>
                  <div className="text-3xl font-mono text-white font-medium">
                    {isOffline ? '--' : trafficData?.vehicle_count || 0}
                  </div>
                </div>
                <Activity className="h-8 w-8 text-zinc-800" />
              </div>
              <div className="bg-zinc-900/30 p-4 rounded border border-zinc-800/50 flex items-center justify-between">
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Avg Flow Speed</div>
                  <div className="text-3xl font-mono text-blue-400 font-medium">
                    {isOffline ? '--' : trafficData?.average_speed?.toFixed(1) || 0} <span className="text-sm text-zinc-600">km/h</span>
                  </div>
                </div>
                <Activity className="h-8 w-8 text-zinc-800" />
              </div>
              <div className="flex flex-col h-full justify-between">
                <h4 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-3 flex items-center">
                  <Lightbulb className="w-3 h-3 mr-2" />
                  Live Logic Stream
                </h4>
                <div className="space-y-2 relative h-full overflow-hidden">
                  <div className="absolute left-1.5 top-2 bottom-2 w-[1px] bg-zinc-800"></div>
                  {signalDecisions.length > 0 ? (
                    signalDecisions.slice(0, 2).map((decision, idx) => (
                      <div key={idx} className="relative pl-6 py-1">
                        <div className={`absolute left-0 top-3 w-3 h-3 rounded-full border-2 border-zinc-950 ${idx === 0 ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-700'}`}></div>
                        <div className={`text-xs ${idx === 0 ? 'text-zinc-300' : 'text-zinc-500'} truncate`}>
                          {decision.message}
                        </div>
                        <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                          {decision.timestamp}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-zinc-600 italic pl-6">System initializing...</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TrafficSignalControl;
