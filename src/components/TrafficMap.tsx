import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Camera, AlertTriangle, Car, RefreshCw } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface TrafficMapProps {
  fullScreen?: boolean;
}

const TrafficMap = ({ fullScreen = false }: TrafficMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [selectedIntersection, setSelectedIntersection] = useState<string | null>(null);
  const [liveData, setLiveData] = useState({
    intersections: [
      { id: "int-1", name: "Main St & 5th Ave", vehicles: 12, status: "green", lat: 40.7128, lng: -74.0060 },
      { id: "int-2", name: "Broadway & 3rd St", vehicles: 8, status: "yellow", lat: 40.7130, lng: -74.0070 },
      { id: "int-3", name: "Park Ave & 1st St", vehicles: 15, status: "red", lat: 40.7125, lng: -74.0055 },
      { id: "int-4", name: "Center St & Oak Ave", vehicles: 6, status: "green", lat: 40.7135, lng: -74.0065 },
    ]
  });

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveData(prev => ({
        intersections: prev.intersections.map(int => ({
          ...int,
          vehicles: Math.max(0, int.vehicles + Math.floor(Math.random() * 6) - 3),
          status: Math.random() > 0.8 ? 
            (Math.random() > 0.5 ? "red" : "yellow") : 
            int.status
        }))
      }));
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "green": return "bg-traffic-green";
      case "yellow": return "bg-traffic-yellow";
      case "red": return "bg-traffic-red";
      default: return "bg-muted";
    }
  };

  const cardClasses = fullScreen 
    ? "h-[calc(100vh-200px)]" 
    : "h-96";

  return (
    <Card className="bg-gradient-card shadow-card border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <MapPin className="h-5 w-5 mr-2 text-primary" />
            Live Traffic Map
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary" className="text-xs">
              <RefreshCw className="h-3 w-3 mr-1" />
              Live
            </Badge>
            <Button variant="outline" size="sm">
              <Camera className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className={`relative ${cardClasses}`}>
          <MapContainer
            center={[40.7128, -74.0060]}
            zoom={15}
            style={{ height: '100%', width: '100%' }}
            className="rounded-b-lg"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {liveData.intersections.map((intersection) => {
              const statusColor = intersection.status === 'green' ? '#22c55e' :
                                 intersection.status === 'yellow' ? '#eab308' : '#ef4444';

              const customIcon = L.divIcon({
                className: 'custom-marker',
                html: `
                  <div style="
                    background-color: ${statusColor};
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    border: 2px solid white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    animation: pulse 2s infinite;
                  "></div>
                  <div style="
                    position: absolute;
                    top: -28px;
                    left: -12px;
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 4px;
                    padding: 2px 6px;
                    font-size: 10px;
                    font-weight: 500;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    white-space: nowrap;
                  ">
                    🚗 ${intersection.vehicles}
                  </div>
                `,
                iconSize: [16, 16],
                iconAnchor: [8, 8],
              });

              return (
                <Marker
                  key={intersection.id}
                  position={[intersection.lat, intersection.lng]}
                  icon={customIcon}
                  eventHandlers={{
                    click: () => setSelectedIntersection(intersection.id),
                  }}
                >
                  <Popup>
                    <div className="p-2 min-w-48">
                      <h4 className="font-semibold text-sm mb-2">{intersection.name}</h4>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span>Vehicles:</span>
                          <span className="font-medium">{intersection.vehicles}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Status:</span>
                          <Badge
                            variant="secondary"
                            className={`${getStatusColor(intersection.status)} text-white text-xs px-2 py-0`}
                          >
                            {intersection.status}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>Wait Time:</span>
                          <span className="font-medium">2.1m</span>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-3 text-xs z-[1000]">
            <div className="font-medium mb-2">Traffic Status</div>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-traffic-green" />
                <span>Clear</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-traffic-yellow" />
                <span>Moderate</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-traffic-red" />
                <span>Congested</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TrafficMap;