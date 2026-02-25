import * as Notifications from "expo-notifications";

export const sendRiskNotification = async (messages: string[]) => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "⚠️ Environmental Risk Alert",
      body: messages.join("\n"),
    },
    trigger: null,
  });
};
