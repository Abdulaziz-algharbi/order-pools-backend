/**
 * Seeds the two predefined Admin/Business Owner accounts. There is no public
 * admin registration endpoint by design (see docs/unimplemented-features.md
 * §1) — this script is the only way to create them.
 *
 * Idempotent: an admin whose email already exists is skipped, not duplicated.
 *
 * Required env vars (see .env.example):
 *   SEED_ADMIN_1_EMAIL, SEED_ADMIN_1_PASSWORD
 *   SEED_ADMIN_2_EMAIL, SEED_ADMIN_2_PASSWORD
 *
 * Optional per-admin overrides (default to placeholders otherwise):
 *   SEED_ADMIN_1_FIRST_NAME, SEED_ADMIN_1_LAST_NAME, SEED_ADMIN_1_PHONE
 *   SEED_ADMIN_2_FIRST_NAME, SEED_ADMIN_2_LAST_NAME, SEED_ADMIN_2_PHONE
 *
 * Run with: npm run seed:admins
 */
import connectToDB from '../src/db/connect-to-db';
import config from '../src/config/config';
import UserModel from '../src/services/users/user.model';
import AddressModel from '../src/services/addresses/address.model';

interface AdminSeed {
  index: 1 | 2;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

function readAdminSeeds(): AdminSeed[] {
  return [1, 2].map((index) => ({
    index: index as 1 | 2,
    email: process.env[`SEED_ADMIN_${index}_EMAIL`],
    password: process.env[`SEED_ADMIN_${index}_PASSWORD`],
    firstName: process.env[`SEED_ADMIN_${index}_FIRST_NAME`] || 'Admin',
    lastName: process.env[`SEED_ADMIN_${index}_LAST_NAME`] || `${index}`,
    phone: process.env[`SEED_ADMIN_${index}_PHONE`] || '00000000',
  }));
}

async function seedAdmin(seed: AdminSeed) {
  if (!seed.email || !seed.password) {
    console.error(
      `Skipping admin ${seed.index}: SEED_ADMIN_${seed.index}_EMAIL / SEED_ADMIN_${seed.index}_PASSWORD not set`
    );
    return;
  }

  const existing = await UserModel.findOne({ email: seed.email });
  if (existing) {
    console.log(`Admin ${seed.email} already exists, skipping.`);
    return;
  }

  // User.addresses requires at least one entry; admins get a placeholder
  // since they don't have a retailer/supplier business address.
  const placeholderAddress = await new AddressModel({
    location: 'N/A',
    region: 'N/A',
    city: 'N/A',
  }).save();

  const admin = new UserModel({
    firstName: seed.firstName,
    lastName: seed.lastName,
    email: seed.email,
    phoneNumber: seed.phone,
    companyName: 'OrderPool',
    password: seed.password, // hashed by the User pre('save') hook
    role: 'ADMIN',
    status: 'ACTIVE',
    isVerified: true,
    addresses: [placeholderAddress._id],
  });

  await admin.save();
  console.log(`Created admin ${admin.email} (${admin._id}).`);
}

async function main() {
  const connection = await connectToDB(config.mongoUri);
  if (!connection) {
    console.error('Could not connect to MongoDB, aborting seed.');
    process.exit(1);
  }

  for (const seed of readAdminSeeds()) {
    await seedAdmin(seed);
  }

  await connection.disconnect();
}

main().catch((error) => {
  console.error('Admin seed failed:', error);
  process.exit(1);
});
