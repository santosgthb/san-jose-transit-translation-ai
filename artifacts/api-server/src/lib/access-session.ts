import { createHmac, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const ACCESS_COOKIE_NAME = "transit_report_access";
export const ACCESS_SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export type AppAccessRole = "reporter" | "reviewer" | "classroom";
export type AppAccessConfig = {
  reporterPasscode: string;
  reviewerPasscode: string | null;
  classroomPasscode: string | null;
  sessionSecret: string;
};

const isFourDigitCode = (value: string | undefined): value is string =>
  !!value && /^[0-9]{4}$/.test(value);

export function getAppAccessConfig(): AppAccessConfig | null {
  const reporterPasscode = process.env.TRANSIT_REPORT_PASSCODE;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!isFourDigitCode(reporterPasscode) || !sessionSecret) return null;

  const configuredReviewerPasscode = process.env.TRANSIT_REPORT_REVIEW_PASSCODE;
  const reviewerPasscode =
    isFourDigitCode(configuredReviewerPasscode) &&
    configuredReviewerPasscode !== reporterPasscode
      ? configuredReviewerPasscode
      : null;
  const configuredClassroomPasscode = process.env.TRANSIT_REPORT_CLASSROOM_PASSCODE;
  const classroomPasscode =
    isFourDigitCode(configuredClassroomPasscode) &&
    configuredClassroomPasscode !== reporterPasscode &&
    configuredClassroomPasscode !== reviewerPasscode
      ? configuredClassroomPasscode
      : null;

  return { reporterPasscode, reviewerPasscode, classroomPasscode, sessionSecret };
}

function hmac(value: string, sessionSecret: string): Buffer {
  return createHmac("sha256", sessionSecret).update(value).digest();
}

function roleCode(config: AppAccessConfig, role: AppAccessRole): string | null {
  if (role === "reporter") return config.reporterPasscode;
  if (role === "reviewer") return config.reviewerPasscode;
  return config.classroomPasscode;
}

export function createAccessCookieValue(
  expiresAt: number,
  config: AppAccessConfig,
  role: AppAccessRole,
): string {
  const code = roleCode(config, role);
  if (!code) throw new Error("Cannot create a session for an unconfigured access role.");
  const codeTag = hmac(`session:${role}:${code}`, config.sessionSecret).toString("base64url");
  const payload = `${expiresAt}.${role}.${codeTag}`;
  const signature = hmac(payload, config.sessionSecret).toString("base64url");
  return `${payload}.${signature}`;
}

function signatureMatches(value: string, signature: string, sessionSecret: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  const supplied = Buffer.from(signature, "base64url");
  const expected = hmac(value, sessionSecret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function getAccessSessionRole(
  cookieValue: unknown,
  config: AppAccessConfig,
  now = Date.now(),
): AppAccessRole | null {
  if (typeof cookieValue !== "string") return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 4 && parts.length !== 2) return null;

  const [expiryText, roleOrSignature, tag, signature] = parts;
  const expiresAt = Number(expiryText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;

  // Retain existing eight-hour reporter sessions during the role-gate rollout.
  if (parts.length === 2) {
    return signatureMatches(expiryText, roleOrSignature, config.sessionSecret)
      ? "reporter"
      : null;
  }

  if (
    roleOrSignature !== "reporter" &&
    roleOrSignature !== "reviewer" &&
    roleOrSignature !== "classroom"
  ) return null;
  const role = roleOrSignature;
  const code = roleCode(config, role);
  if (!code || !tag || !signature) return null;

  const payload = `${expiryText}.${role}.${tag}`;
  if (!signatureMatches(payload, signature, config.sessionSecret)) return null;
  const expectedTag = hmac(`session:${role}:${code}`, config.sessionSecret);
  const suppliedTag = Buffer.from(tag, "base64url");
  if (
    suppliedTag.length !== expectedTag.length ||
    !timingSafeEqual(suppliedTag, expectedTag)
  ) {
    return null;
  }
  return role;
}

export const canAccessRoute = (
  role: AppAccessRole,
  method: string,
  path: string,
): boolean => {
  if (path === "/healthz" && method === "GET") return true;
  if (role === "reporter" || role === "classroom") {
    return (
      (method === "POST" && path === "/submissions") ||
      (method === "POST" && path === "/transit/request") ||
      (method === "POST" && path === "/transit/classify") ||
      (method === "GET" && path === "/transit/matches")
    );
  }
  return (
    (method === "GET" && path === "/submissions") ||
    (method === "PATCH" && /^\/submissions\/[^/]+\/response-status$/.test(path))
  );
};

export const requireAppAccess: RequestHandler = (req, res, next) => {
  if (req.path === "/healthz") {
    next();
    return;
  }

  const config = getAppAccessConfig();
  if (!config) {
    res.status(503).json({ error: "App access is not configured." });
    return;
  }

  const role = getAccessSessionRole(req.cookies?.[ACCESS_COOKIE_NAME], config);
  if (!role) {
    res.status(401).json({ error: "Enter the access code for this app section." });
    return;
  }

  if (!canAccessRoute(role, req.method, req.path)) {
    res.status(403).json({ error: "This access code does not allow this action." });
    return;
  }
  res.locals.accessRole = role;
  next();
};