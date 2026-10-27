import { Notification } from "../models/Notification";
import { getIO } from "../sockets/socket";

type NotificationType =
  | "appointment"
  | "queue"
  | "consultation"
  | "system";

interface CreateNotificationData {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
}

export const createNotification = async (
  data: CreateNotificationData
) => {
  const notification = await Notification.create({
    userId: data.userId,
    title: data.title,
    message: data.message,
    type: data.type,
    isRead: false,
  });

  try {
    getIO()
      .to(`user:${data.userId}`)
      .emit("notification", notification);
  } catch (error) {
    console.error("Socket notification error:", error);
  }

  return notification;
};