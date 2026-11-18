// Password hashing with Node's built-in scrypt (no extra dependency).
// Stored format: "scrypt:<N>:<r>:<p>:<salt, base64>:<hash, base64>", so the
// cost settings can be raised later without breaking existing passwords.
const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);

const COST = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(password, salt, KEY_LENGTH, COST);
    return ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64"), hash.toString("base64")].join(":");
}

async function verifyPassword(password, stored) {
    const parts = typeof stored === "string" ? stored.split(":") : [];
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, N, r, p, salt, expected] = parts;
    const expectedBytes = Buffer.from(expected, "base64");
    const hash = await scrypt(password, Buffer.from(salt, "base64"), expectedBytes.length, { N: Number(N), r: Number(r), p: Number(p) });
    return crypto.timingSafeEqual(hash, expectedBytes);
}

// Checked against when an email isn't registered, so a wrong email takes as
// long as a wrong password and doesn't reveal which accounts exist.
let dummyHash;
async function verifyAgainstDummy(password) {
    dummyHash ??= await hashPassword("not-a-real-password");
    await verifyPassword(password, dummyHash);
    return false;
}

module.exports = { hashPassword, verifyPassword, verifyAgainstDummy };
