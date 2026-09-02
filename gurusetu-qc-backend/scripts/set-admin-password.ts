/**
 * Provisions (or resets) the single admin credential.
 *
 *   npm run set-password              # prompts, no echo
 *   npm run set-password -- --stdin   # reads password from stdin (for automation)
 *
 * Deliberately a CLI rather than an HTTP route: the app has no registration,
 * so the only way to create the account is to already be on the server.
 */
import 'dotenv/config';
import { createInterface } from 'readline';
import { Writable } from 'stream';
import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const MIN_LENGTH = 12;

const adminSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    lastLoginAt: Date,
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: Date,
  },
  { timestamps: true, collection: 'admin_users' },
);

/** Reads a line without echoing it to the terminal. */
const promptHidden = (question: string): Promise<string> =>
  new Promise((resolve) => {
    let muted = false;
    const mutedOut = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) process.stdout.write(chunk, encoding);
        callback();
      },
    });
    const rl = createInterface({
      input: process.stdin,
      output: mutedOut,
      terminal: true,
    });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });

const readStdin = (): Promise<string> =>
  new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data.trim()));
  });

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set (run from the backend directory)');
  const username = process.env.ADMIN_USERNAME ?? 'admin';

  const useStdin = process.argv.includes('--stdin');
  let password: string;

  if (useStdin) {
    password = await readStdin();
  } else {
    password = await promptHidden(`New password for admin '${username}': `);
    const confirm = await promptHidden('Confirm password: ');
    if (password !== confirm) {
      console.error('✗ Passwords do not match.');
      process.exit(1);
    }
  }

  if (password.length < MIN_LENGTH) {
    console.error(`✗ Password must be at least ${MIN_LENGTH} characters.`);
    process.exit(1);
  }

  await mongoose.connect(uri);
  const Admin = mongoose.model('AdminUser', adminSchema);
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const existing = await Admin.findOne({ username });
  await Admin.findOneAndUpdate(
    { username },
    // Clear any active lockout so a reset is immediately usable.
    { $set: { username, passwordHash, failedAttempts: 0 }, $unset: { lockedUntil: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  console.log(
    existing
      ? `✓ Password reset for admin '${username}'.`
      : `✓ Admin '${username}' created.`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
