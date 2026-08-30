import PoolModel from '../../src/services/pools/pool.model';

// Regression test for a dead-field bug: `startDate` was declared in the TS
// interface and in `couldBeUpdated`, but was never added to the actual
// Mongoose schema, so it silently never persisted. No DB connection is
// needed here — defaults/casting apply on construction, before `.save()`.
describe('Pool model startDate', () => {
  const baseFields = {
    productoffer_ref: '507f1f77bcf86cd799439011',
    currentQuantity: 0,
    minimumContribution: 1,
    pricePerUnit: 1,
    endDate: new Date('2030-01-01T00:00:00Z'),
  };

  it('defaults to the creation time, like createdAt, when not provided', () => {
    const before = Date.now();
    const pool = new PoolModel(baseFields);
    const after = Date.now();

    expect(pool.startDate).toBeInstanceOf(Date);
    expect(pool.startDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(pool.startDate.getTime()).toBeLessThanOrEqual(after);
  });

  it('accepts and persists an explicit startDate (e.g. an admin reopening a CANCELLED pool)', () => {
    const explicit = new Date('2020-06-15T00:00:00Z');
    const pool = new PoolModel({ ...baseFields, startDate: explicit });

    expect(pool.startDate.getTime()).toBe(explicit.getTime());
  });
});
