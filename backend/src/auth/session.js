// Signed-in state lives in an httpOnly cookie holding a signed token:
//   base64url(JSON { sub: userId, exp }) + "." + base64url(HMAC-SHA256)
// The server keeps no session records. Signing out clears the cookie; a
// token copied before that stays valid until it expires (7 days).
const crypto = require("node:crypto");

const COOKIE = "ht2_session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

let devSecret;
function secret() {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
    if (process.env.NODE_ENV === "production") {
        throw new Error("SESSION_SECRET is not set. Add a long random value to the environment.");
    }
    // Development only: a new random secret each time the server starts,
    // so restarting signs everyone out.
    devSecret ??= crypto.randomBytes(32).toString("base64url");
    return devSecret;
}

const sign = (data) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

function createToken(userId, now = Date.now()) {
    const payload = Buffer.from(JSON.stringify({ sub: String(userId), exp: Math.floor(now / 1000) + MAX_AGE_SECONDS })).toString("base64url");
    return `${payload}.${sign(payload)}`;
}

// The user id inside a valid, unexpired token, or null.
function readToken(token, now = Date.now()) {
    if (typeof token !== "string") return null;
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra !== undefined) return null;

    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;

    try {
        const { sub, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (typeof sub !== "string" || typeof exp !== "number" || exp * 1000 <= now) return null;
        return sub;
    } catch {
        return null;
    }
}

function readCookie(req, name = COOKIE) {
    for (const part of (req.headers.cookie ?? "").split(";")) {
        const [key, ...value] = part.trim().split("=");
        if (key === name) return decodeURIComponent(value.join("="));
    }
    return null;
}

function cookieOptions() {
    return {
        httpOnly: true, // not readable from page scripts
        sameSite: "lax", // not sent with cross-site form posts
        secure: process.env.NODE_ENV === "production", // HTTPS only when deployed
        path: "/api",
        maxAge: MAX_AGE_SECONDS * 1000,
    };
}

function setSessionCookie(res, userId) {
    res.cookie(COOKIE, createToken(userId), cookieOptions());
}

function clearSessionCookie(res) {
    const { maxAge, ...options } = cookieOptions(); // eslint-disable-line no-unused-vars
    res.clearCookie(COOKIE, options);
}

module.exports = { COOKIE, createToken, readToken, readCookie, setSessionCookie, clearSessionCookie, secret };
