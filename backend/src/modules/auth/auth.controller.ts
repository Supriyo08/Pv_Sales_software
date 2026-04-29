import type { RequestHandler } from "express";
import { z } from "zod";
import { USER_ROLES } from "../users/user.model";
import * as authService from "./auth.service";
import { HttpError } from "../../middleware/error";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  role: z.enum(USER_ROLES),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const register: RequestHandler = async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const tokens = await authService.register(body);
    res.status(201).json(tokens);
  } catch (err) {
    next(err);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const tokens = await authService.login(body.email, body.password);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
};

export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const body = refreshSchema.parse(req.body);
    const tokens = await authService.refresh(body.refreshToken);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
};

export const logout: RequestHandler = async (req, res, next) => {
  try {
    const body = refreshSchema.parse(req.body);
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    await authService.logout(req.user.sub, body.refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
