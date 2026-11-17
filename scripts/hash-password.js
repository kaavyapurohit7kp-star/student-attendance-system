import bcrypt from 'bcryptjs';
const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Usage: npm run hash-password -- "AtLeast8Characters"');
  process.exit(1);
}
console.log(await bcrypt.hash(password, 12));
