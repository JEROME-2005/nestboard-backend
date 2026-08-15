import type {
  RequestHandler,
} from "express";
import * as notificationService from "../services/notification-service.js";

export const list: RequestHandler =
  async (req, res, next) => {
    try {
      const notifications =
        await notificationService.listMyNotifications(
          req.user!.id,
        );

      res.json(notifications);
    } catch (err) {
      next(err);
    }
  };

export const markRead: RequestHandler =
  async (req, res, next) => {
    try {
      const notification =
        await notificationService.markNotificationRead(
          req.user!.id,
          String(req.params.id),
        );

      res.json(notification);
    } catch (err) {
      next(err);
    }
  };

export const markAllRead: RequestHandler =
  async (req, res, next) => {
    try {
      const result =
        await notificationService.markAllNotificationsRead(
          req.user!.id,
        );

      res.json({
        updated: result.count,
      });
    } catch (err) {
      next(err);
    }
  };