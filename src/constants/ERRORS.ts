// Thrown as `Error(ERRORS.X)` and mapped to an HTTP response by
// BaseController.errorHandler (src/services/base/base.controller.ts).
// Extend this enum rather than hand-rolling new error strings so every
// caller stays covered by that shared mapping.
enum ERRORS {
  // Login only: no account matches the given email (see auth.controller.ts).
  USER_NOT_FOUND = 'No account was found with that email address',
  // Login only: the account exists, but the password does not match it.
  INVALID_CREDENTIALS = 'The password you entered is incorrect',
  // Always mapped to 403, not 401 — the caller is authenticated but not
  // allowed to perform this specific action (wrong role, or not the
  // resource's owner), not a login/token failure.
  UNAUTHORIZED = 'You do not have permission to perform this action',
  // The request conflicts with something that already exists (a duplicate
  // email on registration, an already-pending request, etc).
  CONFLICT = 'This conflicts with an existing record',
  // Reserved for truly unexpected failures — deliberately vague so it
  // never leaks internals to the client; the real cause belongs in the
  // server log (this.logger.error), not this message.
  INTERNAL_SERVER_ERROR = 'An unexpected error occurred while processing your request',
  TOKEN_EXPIRED = 'Your session has expired, please log in again',
}

export default ERRORS;
