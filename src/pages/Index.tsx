import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Zap,
  Camera,
  AlertTriangle,
  Car,
  MapPin,
  Activity,
  Clock,
  Users,
  BarChart3,
  Settings,
  Bell,
  Cloud,
  CloudRain,
  Sun,
  CloudFog,
  Siren,
  TrendingUp
} from "lucide-react";
import TrafficMap from "@/components/TrafficMap";
import VehicleDetection from "@/components/VehicleDetection";
import TrafficSignalControl from "@/components/TrafficSignalControl";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import AlertCenter from "@/components/AlertCenter";
import ErrorBoundary from "@/components/ErrorBoundary";
import EmergencyPopup from "@/components/EmergencyPopup";
import { detectionAPI, DetectionStats } from "@/lib/api";

const Index = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [metrics, setMetrics] = useState<{
    efficiency_improvement: number;
    average_wait_time: number | null;
    vehicle_throughput_last_min: number;
  }>({
    efficiency_improvement: 0,
    average_wait_time: null,
    vehicle_throughput_last_min: 0
  });

  const [alertStats, setAlertStats] = useState({
    total: 0,
    high: 0,
    medium: 0,
    low: 0,
    loading: true
  });
  const [detectionStats, setDetectionStats] = useState({
    speed_stats: {
      average_speed: 0
    }
  });
  const [weatherData, setWeatherData] = useState({
    condition: 'Unknown',
    visibility: 'Good',
    time_of_day: 'Day',
    confidence: 0.0
  });
  const [emergencyStatus, setEmergencyStatus] = useState({
    emergency: false,
    priority_direction: null as string | null,
    road_mode: 'FOUR_WAY',
    signal_states: {} as Record<string, string>,
    ambulance_detected: false
  });

  // Fetch metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await detectionAPI.getMetrics();
        if (response.success && response.data) {
          setMetrics(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Alerts for count
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await detectionAPI.getAlerts();
        if (response.success && response.data) {
          const active = response.data.filter((a: any) => a.status === 'ACTIVE');
          setAlertStats({
            total: active.length,
            high: active.filter((a: any) => a.priority === 'HIGH').length,
            medium: active.filter((a: any) => a.priority === 'MEDIUM').length,
            low: active.filter((a: any) => a.priority === 'LOW').length,
            loading: false
          });
        }
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 1000); // 1s sync with AlertCenter
    return () => clearInterval(interval);
  }, []);

  // Fetch detection stats for real-time data
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await detectionAPI.getStats();
        if (response.success && response.data) {
          setDetectionStats(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch detection stats:', error);
      }
    };

    // Initial fetch
    fetchStats();

    // Poll every 2 seconds
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, []);

  // Fetch weather data
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const response = await detectionAPI.getWeather();
        if (response.success && response.data) {
          setWeatherData(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch weather:', error);
      }
    };

    // Initial fetch
    fetchWeather();

    // Update every 10 seconds
    const interval = setInterval(fetchWeather, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch emergency status
  useEffect(() => {
    const fetchEmergencyStatus = async () => {
      try {
        const response = await detectionAPI.getEmergencyStatus();
        if (response.success && response.data) {
          setEmergencyStatus(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch emergency status:', error);
      }
    };

    // Initial fetch
    fetchEmergencyStatus();

    // Poll every 2-3 seconds for emergency status
    const interval = setInterval(fetchEmergencyStatus, 2500);
    return () => clearInterval(interval);
  }, []);

  // Get weather icon based on condition
  const getWeatherIcon = () => {
    const condition = weatherData.condition.toLowerCase();
    if (condition.includes('sunny') || condition.includes('clear')) {
      return Sun;
    } else if (condition.includes('rain')) {
      return CloudRain;
    } else if (condition.includes('fog')) {
      return CloudFog;
    } else {
      return Cloud;
    }
  };

  // Get weather color based on condition
  const getWeatherColor = () => {
    const condition = weatherData.condition.toLowerCase();
    if (condition.includes('sunny') || condition.includes('clear')) {
      return 'text-warning';
    } else if (condition.includes('rain')) {
      return 'text-primary';
    } else if (condition.includes('fog')) {
      return 'text-muted-foreground';
    } else {
      return 'text-success';
    }
  };

  return (
    <div className={`min-h-screen bg-background text-foreground ${emergencyStatus.emergency ? 'opacity-90' : ''}`}>
      {/* Emergency Popup */}
      {emergencyStatus.emergency && emergencyStatus.priority_direction && (
        <EmergencyPopup
          priorityDirection={emergencyStatus.priority_direction}
          roadMode={emergencyStatus.road_mode}
        />
      )}

      {/* Header */}
      <header className="border-b border-border bg-card/70 backdrop-blur shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img src="/traffic.ico" alt="Logo" className="h-9 w-9 rounded" />
              <div>
                <h1 className="text-3xl font-bold">AI Traffic Management</h1>
                <p className="text-muted-foreground text-sm">Real-time traffic monitoring & optimization</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="secondary" className="bg-success text-success-foreground px-4 py-1.5 flex items-center shadow-sm">
                <Activity className="h-4 w-4 mr-2 animate-pulse" />
                System Online
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="border-b border-border bg-card/30">
        <div className="container mx-auto px-6">
          <div className="flex space-x-8">
            {[
              { id: "overview", label: "Overview", icon: BarChart3 },
              { id: "monitoring", label: "Live Monitoring", icon: Camera },
              { id: "analytics", label: "Analytics", icon: Activity },
              { id: "alerts", label: "Alerts", icon: AlertTriangle }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-4 px-2 border-b-2 transition-smooth ${activeTab === tab.id
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              <Card className="bg-gradient-card shadow-md border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center">
                    {(() => {
                      const WeatherIcon = getWeatherIcon();
                      return <WeatherIcon className={`h-4 w-4 mr-2 ${getWeatherColor()}`} />;
                    })()}
                    Weather Condition
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold mb-1">{weatherData.condition}</div>
                  <p className="text-muted-foreground text-sm mt-1">
                    {weatherData.visibility} visibility • {weatherData.time_of_day}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Confidence: {Math.round(weatherData.confidence * 100)}%
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card shadow-md border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center">
                    <Clock className="h-4 w-4 mr-2 text-warning" />
                    Avg Wait Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Calculate wait time from average speed: distance (assume 1km) / speed */}
                  {/* Heuristic: Lower speed = Higher wait time. Base: 60/speed if speed > 5, else high wait */}
                  <div className="text-3xl font-bold text-warning">
                    {(() => {
                      const speed = detectionStats.speed_stats?.average_speed || 0;
                      // Avoid infinity; assumption: if speed is very low (<5 km/h), wait time is high
                      const waitTime = speed > 5 ? (60 / speed) : (speed > 0 ? 10 : 0);
                      return waitTime > 0 ? `${waitTime.toFixed(1)}m` : "--";
                    })()}
                  </div>
                  <p className="text-muted-foreground text-sm mt-1">Real-time estimate</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card shadow-md border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-2 text-destructive" />
                    Active Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-destructive">
                    {alertStats.total}
                  </div>
                  <div className="text-muted-foreground text-xs mt-1 space-x-2">
                    {alertStats.high > 0 && <span className="text-destructive font-medium">{alertStats.high} High</span>}
                    {alertStats.medium > 0 && <span className="text-warning">{alertStats.medium} Medium</span>}
                    {alertStats.low > 0 && <span className="text-success">{alertStats.low} Low</span>}
                  </div>
                  <Button
                    variant="link"
                    className="px-0 h-auto text-xs mt-2 text-primary"
                    onClick={() => setActiveTab("alerts")}
                  >
                    View Alerts &rarr;
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Vehicle Detection and Signal Suggestion */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <ErrorBoundary>
                <VehicleDetection />
              </ErrorBoundary>
              <ErrorBoundary>
                <TrafficSignalControl />
              </ErrorBoundary>
            </div>
          </div>
        )}

        {activeTab === "monitoring" && <TrafficMap fullScreen />}
        {activeTab === "analytics" && <AnalyticsDashboard />}
        {activeTab === "alerts" && <AlertCenter />}
      </main>
    </div>
  );
};

export default Index;