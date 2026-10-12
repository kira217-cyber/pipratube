// Production defaults and start-up checks.

export const isProduction = () => process.env.NODE_ENV === "production";

// Refuse to start a production server that would be insecure or broken.
export const checkProductionEnv = () => {
  if (!isProduction()) return;
  if (!process.env.PUBLIC_URL) process.env.PUBLIC_URL = "https://api.pipratube.com";

  const problems = [];
  if (!process.env.MONGO_URI) problems.push("MONGO_URI is missing");
  for (const key of ["JWT_SECRET", "ADMIN_JWT_SECRET"]) {
    const value = process.env[key] || "";
    if (value.length < 32 || /change_me/i.test(value)) problems.push(`${key} must be a long random string (32+ characters)`);
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET === process.env.ADMIN_JWT_SECRET) problems.push("JWT_SECRET and ADMIN_JWT_SECRET must differ");
  if (!process.env.BUNNY_STORAGE_ACCESS_KEY) problems.push("BUNNY_STORAGE_ACCESS_KEY is missing (videos can't be uploaded)");

  if (problems.length) {
    console.error(`Production config problems:\n - ${problems.join("\n - ")}`);
    process.exit(1);
  }
};
