const { isObjectIdOrHexString } = require("mongoose");
const { readCookie, readToken } = require("../auth/session");
const { unauthorized } = require("../utils/httpError");

// Puts the signed-in user's id on req.userId, or answers 401.
// User-specific routes take the user from here, never from the request body.
function requireUser(req, res, next) {
    const userId = readToken(readCookie(req));
    if (!userId || !isObjectIdOrHexString(userId)) return next(unauthorized());
    req.userId = userId;
    next();
}

module.exports = { requireUser };
