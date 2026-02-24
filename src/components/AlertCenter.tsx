import { useState, useEffect } from "react";
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
  Navigation,
  Siren,
  Activity
} from "lucide-react";
import { detectionAPI, Alert } from "@/lib/api";

const AlertCenter = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await detectionAPI.getAlerts();
        if (response.success && response.data) {
          setAlerts(response.data);
        }
      } catch (error) {
        console.error("Failed to fetch alerts:", error);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchAlerts();

    // Poll every 1 second for real-time updates
    const interval = setInterval(fetchAlerts, 1000);
    return () => clearInterval(interval);
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "HIGH": return "bg-destructive text-destructive-foreground animate-pulse";
      case "MEDIUM": return "bg-warning text-warning-foreground";
      case "LOW": return "bg-success text-success-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE": return "text-destructive font-bold";
      case "RESOLVED": return "text-success";
      default: return "text-muted-foreground";
    }
  };

  const getAlertIcon = (id: string, priority: string) => {
    if (id === "EMERGENCY") return <Siren className="h-5 w-5 animate-bounce text-white" />;
    if (id === "SIGNAL_OPTIMIZATION") return <Lightbulb className="h-5 w-5" />;
    if (priority === "HIGH") return <AlertTriangle className="h-5 w-5" />;
    return <Car className="h-5 w-5" />;
  };

  // Group alerts by status
  const activeAlerts = alerts.filter(a => a.status === "ACTIVE");
  const resolvedAlerts = alerts.filter(a => a.status === "RESOLVED");

  // Strict Sort for Active Alerts: HIGH > MEDIUM > LOW
  activeAlerts.sort((a, b) => {
    const priorityOrder: Record<string, number> = { "HIGH": 0, "MEDIUM": 1, "LOW": 2 };
    return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
  });

  return (
    <div className="space-y-6">
      {/* Alert Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-destructive/10 shadow-card border-destructive/20">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-destructive">
              {alerts.filter(a => a.priority === "HIGH" && a.status === "ACTIVE").length}
            </div>
            <div className="text-sm text-destructive/80">High Priority</div>
          </CardContent>
        </Card>

        <Card className="bg-warning/10 shadow-card border-warning/20">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-warning">
              {alerts.filter(a => a.priority === "MEDIUM" && a.status === "ACTIVE").length}
            </div>
            <div className="text-sm text-warning/80">Medium Priority</div>
          </CardContent>
        </Card>

        <Card className="bg-success/10 shadow-card border-success/20">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-success">
              {alerts.filter(a => a.priority === "LOW" && a.status === "ACTIVE").length}
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

      {/* Active Alerts Grouped by Priority */}
      <div className="space-y-6">
        {/* High Priority */}
        {activeAlerts.some(a => a.priority === "HIGH") && (
          <Card className="bg-destructive/5 shadow-card border-destructive/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-destructive">
                <Siren className="h-5 w-5 mr-2 animate-pulse" />
                High Priority Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeAlerts.filter(a => a.priority === "HIGH").map((alert) => (
                  <div
                    key={alert.id}
                    className="border border-destructive/50 bg-destructive/10 rounded-lg p-4 space-y-3 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 w-full">
                        <div className={`p-2 rounded-lg ${getSeverityColor(alert.priority)}`}>
                          {getAlertIcon(alert.id, alert.priority)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-bold text-lg text-foreground">{alert.title}</h4>
                            <Badge variant="destructive" className="animate-pulse">HIGH</Badge>
                          </div>

                          <p className="text-sm text-muted-foreground mb-3 font-medium">{alert.message}</p>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            {alert.action && (
                              <div className="col-span-1 md:col-span-2 flex items-center space-x-2 text-foreground font-semibold bg-background/50 p-2 rounded border border-destructive/30">
                                <CheckCircle className="h-4 w-4 text-destructive" />
                                <span>Action: {alert.action}</span>
                              </div>
                            )}
                            <div className="flex items-center space-x-2 text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span>{alert.formatted_time}</span>
                            </div>
                          </div>

                          <div className="mt-3 flex justify-end">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => { }} // No implementation yet for direct resolve from UI
                              className="opacity-90 hover:opacity-100"
                            >
                              Acknowledge
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Medium Priority */}
        {activeAlerts.some(a => a.priority === "MEDIUM") && (
          <Card className="bg-warning/5 shadow-card border-warning/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-warning">
                <AlertTriangle className="h-5 w-5 mr-2" />
                Medium Priority Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeAlerts.filter(a => a.priority === "MEDIUM").map((alert) => (
                  <div key={alert.id} className="border border-warning/30 bg-warning/5 rounded-lg p-4 space-y-2">
                    <div className="flex items-start space-x-3">
                      <div className="p-2 rounded-lg bg-warning/20 text-warning-foreground">
                        {getAlertIcon(alert.id, alert.priority)}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h4 className="font-semibold text-foreground">{alert.title}</h4>
                          <Badge variant="outline" className="text-warning border-warning">MEDIUM</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground my-1">{alert.message}</p>
                        <div className="flex items-center text-xs text-muted-foreground mt-2 space-x-3">
                          <span className="flex items-center"><Clock className="h-3 w-3 mr-1" /> {alert.formatted_time}</span>
                          {alert.impact && <span className="flex items-center"><Activity className="h-3 w-3 mr-1" /> {alert.impact}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Low Priority */}
        {activeAlerts.some(a => a.priority === "LOW") && (
          <Card className="bg-gradient-card shadow-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-muted-foreground">
                <Navigation className="h-5 w-5 mr-2" />
                Low Priority Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeAlerts.filter(a => a.priority === "LOW").map((alert) => (
                  <div key={alert.id} className="border border-border/50 rounded-lg p-3 flex space-x-3 items-center">
                    <div className="p-2 rounded-lg bg-secondary text-muted-foreground">
                      {getAlertIcon(alert.id, alert.priority)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <h4 className="font-medium text-sm">{alert.title}</h4>
                        <span className="text-xs text-muted-foreground">{alert.formatted_time}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{alert.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {activeAlerts.length === 0 && (
          <div className="text-center py-12 text-muted-foreground bg-gradient-card rounded-lg border border-border/50 p-8">
            <CheckCircle className="h-16 w-16 mx-auto mb-4 text-success opacity-50" />
            <h3 className="text-xl font-semibold mb-2">System Nominal</h3>
            <p>No active traffic alerts. Traffic flow is optimal.</p>
          </div>
        )}
      </div>

      {/* Recent Resolutions */}
      {resolvedAlerts.length > 0 && (
        <Card className="bg-gradient-card shadow-card border-border/50 opacity-80">
          <CardHeader>
            <CardTitle className="flex items-center text-muted-foreground">
              <CheckCircle className="h-5 w-5 mr-2" />
              Recently Resolved ({resolvedAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {resolvedAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between border border-border/50 rounded-lg p-3 bg-secondary/10 grayscale hover:grayscale-0 transition-all">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-muted">
                      {getAlertIcon(alert.id, alert.priority)}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{alert.title}</div>
                      <div className="text-xs text-muted-foreground">{alert.message}</div>
                    </div>
                  </div>
                  <div className="text-xs text-success font-medium flex items-center">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Resolved {alert.formatted_time}
                  </div>
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