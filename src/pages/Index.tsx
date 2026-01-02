import { useState } from "react";
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
  Bell
} from "lucide-react";
import TrafficMap from "@/components/TrafficMap";
import VehicleDetection from "@/components/VehicleDetection";
import TrafficSignalControl from "@/components/TrafficSignalControl";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import AlertCenter from "@/components/AlertCenter";
import ErrorBoundary from "@/components/ErrorBoundary";

const Index = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [liveVehicleCount, setLiveVehicleCount] = useState(247);

  // Simulate real-time data updates
  useState(() => {
    const interval = setInterval(() => {
      setLiveVehicleCount(prev => prev + Math.floor(Math.random() * 5) - 2);
    }, 3000);
    return () => clearInterval(interval);
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
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
              <Badge variant="secondary" className="bg-success text-success-foreground">
                <Activity className="h-4 w-4 mr-2" />
                System Online
              </Badge>
              <Button variant="outline" size="sm">
                <Bell className="h-4 w-4 mr-2" />
                3 Alerts
              </Button>
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
                  className={`flex items-center space-x-2 py-4 px-2 border-b-2 transition-smooth ${
                    activeTab === tab.id 
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="bg-gradient-card shadow-md border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center">
                    <Car className="h-4 w-4 mr-2 text-primary" />
                    Live Vehicle Count
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-primary">{liveVehicleCount}</div>
                  <p className="text-muted-foreground text-sm mt-1">+12% from last hour</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card shadow-md border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center">
                    <MapPin className="h-4 w-4 mr-2 text-success" />
                    Active Intersections
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-success">24</div>
                  <p className="text-muted-foreground text-sm mt-1">All systems operational</p>
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
                  <div className="text-3xl font-bold text-warning">2.4m</div>
                  <p className="text-muted-foreground text-sm mt-1">-15% from yesterday</p>
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
                  <div className="text-3xl font-bold text-destructive">3</div>
                  <p className="text-muted-foreground text-sm mt-1">2 high priority</p>
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