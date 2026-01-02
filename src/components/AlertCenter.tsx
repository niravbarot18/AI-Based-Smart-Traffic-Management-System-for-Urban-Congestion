import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  AlertTriangle, 
  Lightbulb, 
  Car, 
  Clock, 
  MapPin,
  CheckCircle,
  X,
  Eye,
  Navigation
} from "lucide-react";

const AlertCenter = () => {
  const [alerts, setAlerts] = useState([
    {
      id: 1,
      type: "traffic_jam",
      title: "Heavy Traffic Congestion",
      description: "Significant backup on Main Street approaching 5th Avenue",
      location: "Main St & 5th Ave",
      severity: "high",
      timestamp: "2 minutes ago",
      status: "active",
      vehicleCount: 45,
      estimatedDelay: "8-12 minutes"
    },
    {
      id: 2,
      type: "illegal_parking",
      title: "Illegal Parking Detected",
      description: "Vehicle parked in no-parking zone blocking traffic flow",
      location: "Broadway & 3rd St",
      severity: "medium",
      timestamp: "5 minutes ago",
      status: "active",
      vehicleCount: null,
      estimatedDelay: "3-5 minutes"
    },
    {
      id: 3,
      type: "street_vendor",
      title: "Street Vendor Obstruction",
      description: "Mobile vendor causing lane blockage during peak hours",
      location: "Park Ave & 1st St",
      severity: "medium",
      timestamp: "8 minutes ago",
      status: "investigating",
      vehicleCount: null,
      estimatedDelay: "2-4 minutes"
    },
    {
      id: 4,
      type: "signal_malfunction",
      title: "Traffic Signal Malfunction",
      description: "Traffic light stuck on red, causing unnecessary delays",
      location: "Oak St & Center Ave",
      severity: "high",
      timestamp: "12 minutes ago",
      status: "resolved",
      vehicleCount: 28,
      estimatedDelay: "Resolved"
    },
    {
      id: 5,
      type: "event_traffic",
      title: "Event-Related Traffic",
      description: "Increased traffic due to scheduled city festival",
      location: "Downtown District",
      severity: "low",
      timestamp: "1 hour ago",
      status: "monitoring",
      vehicleCount: 156,
      estimatedDelay: "5-8 minutes"
    }
  ]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "bg-destructive text-destructive-foreground";
      case "medium": return "bg-warning text-warning-foreground";
      case "low": return "bg-success text-success-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "text-destructive";
      case "investigating": return "text-warning";
      case "monitoring": return "text-primary";
      case "resolved": return "text-success";
      default: return "text-muted-foreground";
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "traffic_jam": return <Car className="h-4 w-4" />;
      case "illegal_parking": return <Car className="h-4 w-4" />;
      case "street_vendor": return <AlertTriangle className="h-4 w-4" />;
      case "signal_malfunction": return <Lightbulb className="h-4 w-4" />;
      case "event_traffic": return <Clock className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const dismissAlert = (alertId: number) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  };

  const markAsResolved = (alertId: number) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId 
        ? { ...alert, status: "resolved", estimatedDelay: "Resolved" }
        : alert
    ));
  };

  const activeAlerts = alerts.filter(alert => alert.status !== "resolved");
  const resolvedAlerts = alerts.filter(alert => alert.status === "resolved");

  return (
    <div className="space-y-6">
      {/* Alert Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-warning/10 shadow-card border-warning/20">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-warning">
              {alerts.filter(a => a.severity === "medium" && a.status === "active").length}
            </div>
            <div className="text-sm text-warning/80">Medium Priority</div>
          </CardContent>
        </Card>

        <Card className="bg-success/10 shadow-card border-success/20">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-success">
              {alerts.filter(a => a.severity === "low" && a.status === "active").length}
            </div>
            <div className="text-sm text-success/80">Low Priority</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card shadow-card border-border/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-muted-foreground">
              {resolvedAlerts.length}
            </div>
            <div className="text-sm text-muted-foreground">Resolved Today</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Alerts */}
      <Card className="bg-gradient-card shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2 text-destructive" />
            Active Alerts ({activeAlerts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className={`p-2 rounded-lg ${getSeverityColor(alert.severity)}`}>
                      {getAlertIcon(alert.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-semibold">{alert.title}</h4>
                        <Badge 
                          variant="secondary" 
                          className={`${getSeverityColor(alert.severity)} text-xs`}
                        >
                          {alert.severity}
                        </Badge>
                        <Badge 
                          variant="outline" 
                          className={`${getStatusColor(alert.status)} border-current text-xs`}
                        >
                          {alert.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{alert.description}</p>
                      <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                        <div className="flex items-center space-x-1">
                          <MapPin className="h-3 w-3" />
                          <span>{alert.location}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>{alert.timestamp}</span>
                        </div>
                        {alert.vehicleCount && (
                          <div className="flex items-center space-x-1">
                            <Car className="h-3 w-3" />
                            <span>{alert.vehicleCount} vehicles</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button size="sm" variant="outline">
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button size="sm" variant="outline">
                      <Navigation className="h-4 w-4 mr-1" />
                      Navigate
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => markAsResolved(alert.id)}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Resolve
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => dismissAlert(alert.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {alert.estimatedDelay && alert.status !== "resolved" && (
                  <div className="bg-secondary/30 rounded-lg p-3 text-sm">
                    <div className="font-medium mb-1">Estimated Impact</div>
                    <div className="text-muted-foreground">
                      Delay: {alert.estimatedDelay} • 
                      Recommended action: Deploy traffic control unit
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {activeAlerts.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-success" />
                <h3 className="text-lg font-semibold mb-2">No Active Alerts</h3>
                <p>All traffic systems are operating normally.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Resolutions */}
      {resolvedAlerts.length > 0 && (
        <Card className="bg-gradient-card shadow-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle className="h-5 w-5 mr-2 text-success" />
              Recently Resolved ({resolvedAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {resolvedAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between border border-border/50 rounded-lg p-3 opacity-60">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-success/20">
                      {getAlertIcon(alert.type)}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{alert.title}</div>
                      <div className="text-xs text-muted-foreground">{alert.location}</div>
                    </div>
                  </div>
                  <div className="text-xs text-success font-medium">Resolved</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AlertCenter;