import fs from "fs";
import path from "path";
import crypto from "crypto";
import { promisify } from "util";

const scrypt = promisify(crypto.scrypt);

const AUTH_DIR = path.join(process.cwd(), ".datamind-auth");
const USERS_FILE = path.join(AUTH_DIR, "users.json");
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
};

type Session = {
  userId: string;
  expiresAt: number;
};

const sessions = new Map<string, Session>();

function ensureStore() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]", "utf8");
}

function readUsers(): StoredUser[] {
  ensureStore();
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    const users = JSON.parse(raw);
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  ensureStore();
  const temp = `${USERS_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(users, null, 2), "utf8");
  fs.renameSync(temp, USERS_FILE);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : crypto.randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return { salt: salt.toString("hex"), hash: derived.toString("hex") };
}

async function verifyPassword(password: string, saltHex: string, expectedHash: string) {
  const { hash } = await hashPassword(password, saltHex);
  const actual = Buffer.from(hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function signup(name: string, email: string, password: string) {
  const cleanName = name.trim().replace(/\s+/g, " ");
  const cleanEmail = normalizeEmail(email);

  if (cleanName.length < 2 || cleanName.length > 80) throw new Error("Please enter a valid name.");
  if (!validEmail(cleanEmail)) throw new Error("Please enter a valid email address.");
  if (password.length < 8) throw new Error("Password must contain at least 8 characters.");

  const users = readUsers();
  if (users.some((u) => u.email === cleanEmail)) throw new Error("An account with this email already exists.");

  const { salt, hash } = await hashPassword(password);
  const user: StoredUser = {
    id: crypto.randomUUID(),
    name: cleanName,
    email: cleanEmail,
    passwordHash: hash,
    salt,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  writeUsers(users);
  return publicUser(user);
}

export async function login(email: string, password: string) {
  const cleanEmail = normalizeEmail(email);
  const user = readUsers().find((u) => u.email === cleanEmail);
  if (!user || !(await verifyPassword(password, user.salt, user.passwordHash))) {
    throw new Error("Invalid email or password.");
  }
  return publicUser(user);
}

export function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function getSessionUser(token?: string) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = readUsers().find((u) => u.id === session.userId);
  return user ? publicUser(user) : null;
}

export function destroySession(token?: string) {
  if (token) sessions.delete(token);
}

export function getCookie(req: { headers: { cookie?: string } }, name: string) {
  const cookies = req.headers.cookie?.split(";") || [];
  const pair = cookies.find((part) => part.trim().startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.trim().slice(name.length + 1)) : undefined;
}

function publicUser(user: StoredUser) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

export const AUTH_COOKIE = "datamind_session";
export const AUTH_COOKIE_MAX_AGE = Math.floor(SESSION_TTL_MS / 1000);
