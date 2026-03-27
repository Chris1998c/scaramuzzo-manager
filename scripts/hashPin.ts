import bcrypt from "bcryptjs";

async function main() {
  const pin = "1234";
  const saltRounds = 10;
  const hash = await bcrypt.hash(pin, saltRounds);

  console.log("PIN:", pin);
  console.log("bcrypt hash:", hash);
}

main().catch((error) => {
  console.error("Failed to hash PIN:", error);
  process.exit(1);
});
