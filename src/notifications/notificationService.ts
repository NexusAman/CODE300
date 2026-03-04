import * as Notifications from "expo-notifications";
import { RiskAlert } from "../engine/riskEngine";

// Only notifies for severe and danger conditions.
// Warnings are displayed in the UI only — no push notification sent.
// Each condition gets its own notification banner so the user
// clearly sees what is wrong and why.
export const sendRiskNotification = async (alerts: RiskAlert[]) => {
  const severeAndAbove = alerts.filter(
    (a) => a.severity === "severe" || a.severity === "danger",
  );

  for (const alert of severeAndAbove) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title:
            alert.severity === "danger"
              ? "🚨 Dangerous Condition"
              : "⚠️ Severe Condition",
          body: alert.message,
          color: alert.severity === "danger" ? "#E879F9" : "#F87171",
        },
        // TODO: When upgrading to expo-notifications v1+, change to: trigger: { type: "immediate" }
        trigger: null,
      });
    } catch (e) {
      console.warn(`Notification failed for ${alert.type}:`, e);
    }
  }
};
