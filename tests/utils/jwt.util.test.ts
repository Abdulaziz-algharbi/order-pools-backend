import jwtUtil from '../../src/utils/jwt.util';

describe('jwtUtil', () => {
  it('embeds the role passed in the payload into both tokens', () => {
    const { accessToken, refreshToken } = jwtUtil.createTokens({
      _id: 'user-1',
      role: 'ADMIN',
    });

    const decodedAccess = jwtUtil.verifyAccessToken(accessToken) as any;
    const decodedRefresh = jwtUtil.verifyRefreshToken(refreshToken) as any;

    expect(decodedAccess._id).toBe('user-1');
    expect(decodedAccess.role).toBe('ADMIN');
    expect(decodedRefresh._id).toBe('user-1');
    expect(decodedRefresh.role).toBe('ADMIN');
  });

  it('round-trips each role value correctly', () => {
    for (const role of ['ADMIN', 'SUPPLIER', 'RETAILER'] as const) {
      const accessToken = jwtUtil.createAccessToken({ _id: 'u', role });
      const decoded = jwtUtil.verifyAccessToken(accessToken) as any;
      expect(decoded.role).toBe(role);
    }
  });

  it('returns null for a garbage token instead of throwing', () => {
    expect(jwtUtil.verifyAccessToken('not-a-real-token')).toBeNull();
    expect(jwtUtil.verifyRefreshToken('not-a-real-token')).toBeNull();
  });

  it('rejects an access token verified with the refresh secret and vice versa', () => {
    const accessToken = jwtUtil.createAccessToken({ _id: 'u', role: 'ADMIN' });
    const refreshToken = jwtUtil.createRefreshToken({
      _id: 'u',
      role: 'ADMIN',
    });

    expect(jwtUtil.verifyRefreshToken(accessToken)).toBeNull();
    expect(jwtUtil.verifyAccessToken(refreshToken)).toBeNull();
  });
});
