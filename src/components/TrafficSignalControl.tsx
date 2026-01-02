import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lightbulb, AlertTriangle, RefreshCw } from "lucide-react";

const TrafficSignalControl = () => {
  const [signalStatus, setSignalStatus] = useState(null);
  const [signalDecisions, setSignalDecisions] = useState([]);
  const [trafficData, setTrafficData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch signal status from backend
  const fetchSignalStatus = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/signal/status');
      const data = await response.json();
      if (data.success) {
        setSignalStatus(data.data);
      }
    } catch (err) {
      console.error('Error fetching signal status:', err);
      setError('Failed to fetch signal status');
    }
  };

  // Fetch signal decisions/alerts
  const fetchSignalDecisions = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/signal/decisions');
      const data = await response.json();
      if (data.success) {
        setSignalDecisions(data.data);
      }
    } catch (err) {
      console.error('Error fetching signal decisions:', err);
    }
  };

  // Fetch traffic data
  const fetchTrafficData = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/traffic/data');
      const data = await response.json();
      if (data.success) {
        setTrafficData(data.data);
      }
    } catch (err) {
      console.error('Error fetching traffic data:', err);
    }
  };

  // Initial data fetch and polling
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([
        fetchSignalStatus(),
        fetchSignalDecisions(),
        fetchTrafficData()
      ]);
      setLoading(false);
    };

    fetchData();

    // Poll for updates every 2 seconds
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  const getPhaseColor = (phase: string) => {
    if (phase.includes("green")) return "bg-traffic-green";
    if (phase.includes("yellow")) return "bg-traffic-yellow";
    if (phase.includes("red")) return "bg-traffic-red";
    return "bg-muted";
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "text-destructive";
      case "normal": return "text-success";
      case "low": return "text-warning";
      default: return "text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="bg-gradient-card shadow-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center">
              <RefreshCw className="h-5 w-5 mr-2 text-primary animate-spin" />
              Adaptive Signal Suggestion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="text-muted-foreground">Loading signal status...</div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Alert className="border-destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Signal Status Display */}
      <Card className="bg-gradient-card shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Lightbulb className="h-5 w-5 mr-2 text-primary" />
            Traffic Signal Control Center
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Current Signal Status */}
            <Card className="bg-secondary/30 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Main Intersection Signal</CardTitle>
                <Badge variant="secondary" className="w-fit">
            Decision Support Active
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {signalStatus && (
                  <>
                    {/* Current Signal Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-12 h-12 rounded-full ${getPhaseColor(signalStatus.phase.toLowerCase())} animate-pulse shadow-lg`} />
                        <div>
                          <div className="font-bold text-lg">
                            {signalStatus.phase.toUpperCase()}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {signalStatus.remaining_time}s remaining
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-primary">
                          {signalStatus.green_time}s
                        </div>
                        <div className="text-xs text-muted-foreground">Current Green Time</div>
                      </div>
                    </div>

                    {/* Time Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Phase Progress</span>
                        <span>{signalStatus.remaining_time}s left</span>
                      </div>
                      <Progress
                        value={((signalStatus.green_time - signalStatus.remaining_time) / signalStatus.green_time) * 100}
                        className="h-3"
                      />
                    </div>

                    {/* Congestion Level */}
                    <div className="flex items-center justify-between p-3 bg-card/50 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className={`h-4 w-4 ${
                          signalStatus.congestion_level === 'SEVERE' ? 'text-destructive' :
                          signalStatus.congestion_level === 'MODERATE' ? 'text-warning' :
                          'text-success'
                        }`} />
                        <span className="text-sm font-medium">Congestion Level</span>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`${
                          signalStatus.congestion_level === 'SEVERE' ? 'bg-destructive text-destructive-foreground' :
                          signalStatus.congestion_level === 'MODERATE' ? 'bg-warning text-warning-foreground' :
                          'bg-success text-success-foreground'
                        }`}
                      >
                        {signalStatus.congestion_level}
                      </Badge>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Traffic Data Summary */}
            <Card className="bg-secondary/30 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Traffic Conditions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {trafficData && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-card/50 rounded">
                        <div className="text-2xl font-bold text-primary">{trafficData.vehicle_count}</div>
                        <div className="text-xs text-muted-foreground">Vehicles Detected</div>
                      </div>
                      <div className="text-center p-3 bg-card/50 rounded">
                        <div className="text-2xl font-bold text-blue-600">{trafficData.average_speed?.toFixed(1)} km/h</div>
                        <div className="text-xs text-muted-foreground">Avg Speed</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Traffic Density</span>
                        <Badge variant="outline">{trafficData.traffic_density}</Badge>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Queue Length</span>
                        <span className="font-medium">{trafficData.queue_length} vehicles</span>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Signal Decisions/Alerts */}
      {signalDecisions.length > 0 && (
        <Card className="bg-gradient-card shadow-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-warning" />
              Recent Signal Decisions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {signalDecisions.slice(0, 3).map((decision, index) => (
                <Alert key={index} className="border-warning/50">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="flex justify-between items-center">
                    <span>{decision.message}</span>
                    <span className="text-xs text-muted-foreground">{decision.timestamp}</span>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}


    </div>
  );
};

export default TrafficSignalControl;