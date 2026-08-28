// Deterministic secrets for tests, set before any module (e.g. config.ts,
// which calls dotenv.config() on import) has a chance to read process.env.
// dotenv does not override already-set vars, so this takes precedence over
// whatever is in the developer's real .env file.
process.env.JWT_TOKEN_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret';
process.env.JWT_TOKEN_TTL = '1h';
process.env.JWT_REFRESH_TOKEN_TTL = '7d';
