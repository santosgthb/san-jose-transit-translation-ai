import { Router, type IRouter, type Request } from "express";
import { timingSafeEqual } from "node:crypto";
import {
  GetAccessStatusResponse,
  UnlockAccessBody,
  UnlockAccessResponse,
} from "@workspace/api-zod";
import {
  type AppAccessConfig,
  ACCESS_COOKIE_NAME,
  ACCESS_SESSION_DURATION_MS,
  createAccessCookieValue,
  getAppAccessConfig,
  getAccessSessionRole,
} from "../lib/access-session";

const router: IRouter = Router();
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const failuresByIp = new Map<string, { failures: number; resetAt: number }>();
let attemptsSinceCleanup = 0;

function constantTimePasscodeMatch(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  return candidateBytes.length === expectedBytes.length
    && timingSafeEqual(candidateBytes, expectedBytes);
}

function getStatus(req: Request, config: AppAccessConfig) {
  const role = getAccessSessionRole(req.cookies?.[ACCESS_COOKIE_NAME], config);
  return {
    unlocked: role !== null,
    role,
    reviewerAvailable: config.reviewerPasscode !== null,
    classroomAvailable: config.classroomPasscode !== null,
  };
}

function getFailureWindow(ip: string, now: number): { failures: number; resetAt: number } {
  const current = failuresByIp.get(ip);
  if (current && current.resetAt > now) return current;

  const fresh = { failures: 0, resetAt: now + ATTEMPT_WINDOW_MS };
  failuresByIp.set(ip, fresh);
  return fresh;
}

function cleanExpiredFailureWindows(now: number): void {
  attemptsSinceCleanup += 1;
  if (attemptsSinceCleanup < 256) return;
  attemptsSinceCleanup = 0;

  for (const [ip, window] of failuresByIp) {
    if (window.resetAt <= now) failuresByIp.delete(ip);
  }
}

router.get("/status", (req, res): void => {
  const config = getAppAccessConfig();
  if (!config) {
    res.status(503).json({ error: "App access is not configured." });
    return;
  }

  res.json(GetAccessStatusResponse.parse(getStatus(req, config)));
});

router.post("/unlock", (req, res): void => {
  const config = getAppAccessConfig();
  if (!config) {
    res.status(503).json({ error: "App access is not configured." });
    return;
  }

  const parsed = UnlockAccessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a four-digit numeric code." });
    return;
  }

  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  cleanExpiredFailureWindows(now);

  const failureWindow = getFailureWindow(ip, now);
  if (failureWindow.failures >= MAX_FAILED_ATTEMPTS) {
    res.setHeader("Retry-After", String(Math.ceil((failureWindow.resetAt - now) / 1000)));
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }

  const role = parsed.data.role ?? "reporter";
  const expectedPasscode = role === "reporter"
    ? config.reporterPasscode
    : role === "reviewer"
      ? config.reviewerPasscode
      : config.classroomPasscode;
  if (!expectedPasscode || !constantTimePasscodeMatch(parsed.data.passcode, expectedPasscode)) {
    failureWindow.failures += 1;
    res.status(failureWindow.failures >= MAX_FAILED_ATTEMPTS ? 429 : 401)
      .json({ error: "The access code was not accepted." });
    return;
  }

  failuresByIp.delete(ip);
  const expiresAt = now + ACCESS_SESSION_DURATION_MS;
  res.cookie(
    ACCESS_COOKIE_NAME,
    createAccessCookieValue(expiresAt, config, role),
    {
      httpOnly: true,
      secure: req.secure,
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_SESSION_DURATION_MS,
    },
  );
  res.json(UnlockAccessResponse.parse({
    unlocked: true,
    role,
    reviewerAvailable: config.reviewerPasscode !== null,
    classroomAvailable: config.classroomPasscode !== null,
  }));
});

router.post("/logout", (req, res): void => {
  const config = getAppAccessConfig();
  res.clearCookie(ACCESS_COOKIE_NAME, {
    secure: req.secure,
    sameSite: "lax",
    path: "/",
  });
  res.json(GetAccessStatusResponse.parse({
    unlocked: false,
    role: null,
    reviewerAvailable: config !== null && config.reviewerPasscode !== null,
    classroomAvailable: config !== null && config.classroomPasscode !== null,
  }));
});

export default router;