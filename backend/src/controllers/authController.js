const userService = require("../services/userService");
const { parseLogin, parseRegister } = require("../validators/accountInput");
const { clearSessionCookie, setSessionCookie } = require("../auth/session");

// POST /api/auth/register { name, email, password, phone? } — creates the
// account and signs it in.
async function register(req, res) {
    const user = await userService.register(parseRegister(req.body));
    setSessionCookie(res, user.id);
    res.status(201).json({ data: user });
}

// POST /api/auth/login { email, password }
async function login(req, res) {
    const user = await userService.login(parseLogin(req.body));
    setSessionCookie(res, user.id);
    res.json({ data: user });
}

// POST /api/auth/logout
function logout(req, res) {
    clearSessionCookie(res);
    res.json({ data: { signedOut: true } });
}

module.exports = { register, login, logout };
