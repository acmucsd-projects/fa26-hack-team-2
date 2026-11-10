// Throw these from services/validators; the error handler turns them into
// { error: { code, message } } with the right status code.
class HttpError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const badRequest = (message) => new HttpError(400, "invalid_input", message);
const notFound = (message) => new HttpError(404, "not_found", message);

module.exports = { HttpError, badRequest, notFound };
