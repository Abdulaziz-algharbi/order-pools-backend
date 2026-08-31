import jwtUtil from '../../src/utils/jwt.util';

describe('jwtUtil', () => {
  it('embeds the roles passed in the payload into both tokens', () => {
    const { accessToken, refreshToken } = jwtUtil.createTokens({
      _id: 'user-1',
      roles: ['ADMIN'],
    });

    const decodedAccess = jwtUtil.verifyAccessToken(accessToken) as any;
    const decodedRefresh = jwtUtil.verifyRefreshToken(refreshToken) as any;

    expect(decodedAccess._id).toBe('user-1');
    expect(decodedAccess.roles).toEqual(['ADMIN']);
    expect(decodedRefresh._id).toBe('user-1');
    expect(decodedRefresh.roles).toEqual(['ADMIN']);
  });

  it('round-trips each single-role value correctly', () => {
    for (const role of ['ADMIN', 'SUPPLIER', 'RETAILER'] as const) {
      const accessToken = jwtUtil.createAccessToken({
        _id: 'u',
        roles: [role],
      });
      const decoded = jwtUtil.verifyAccessToken(accessToken) as any;
      expect(decoded.roles).toEqual([role]);
    }
  });

  it('round-trips a dual-role value correctly', () => {
    const accessToken = jwtUtil.createAccessToken({
      _id: 'u',
      roles: ['RETAILER', 'SUPPLIER'],
    });
    const decoded = jwtUtil.verifyAccessToken(accessToken) as any;
    expect(decoded.roles).toEqual(['RETAILER', 'SUPPLIER']);
  });

  it('returns null for a garbage token instead of throwing', () => {
    expect(jwtUtil.verifyAccessToken('not-a-real-token')).toBeNull();
    expect(jwtUtil.verifyRefreshToken('not-a-real-token')).toBeNull();
  });

  it('rejects an access token verified with the refresh secret and vice versa', () => {
    const accessToken = jwtUtil.createAccessToken({
      _id: 'u',
      roles: ['ADMIN'],
    });
    const refreshToken = jwtUtil.createRefreshToken({
      _id: 'u',
      roles: ['ADMIN'],
    });

    expect(jwtUtil.verifyRefreshToken(accessToken)).toBeNull();
    expect(jwtUtil.verifyAccessToken(refreshToken)).toBeNull();
  });
});
