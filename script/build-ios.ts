/**
 * build-ios.ts
 *
 * Builds the web assets for the iOS Capacitor app and syncs them.
 *
 * Usage:
 *   VITE_API_URL=https://your-app.up.railway.app npx tsx script/build-ios.ts
 *
 * Or create a .env.ios file (copy .env.ios.example) and run:
 *   npm run build:ios
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

const envFile = path.resolve(".env.ios");
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
  console.log("Loaded .env.ios");
}

const apiUrl = process.env.VITE_API_URL;
if (!apiUrl) {
  console.error("❌  VITE_API_URL is not set.");
  console.error("    Create a .env.ios file (copy .env.ios.example) and set your Railway URL.");
  process.exit(1);
}

console.log(`Building frontend with VITE_API_URL=${apiUrl}`);

// Build the Vite frontend with the API URL baked in
// APNs environment follows the *signing profile*, which the web bundle can't see. Local
// builds are development-signed, so sandbox is the right default; a TestFlight or App
// Store build must set VITE_APNS_ENV=production or its tokens are labelled wrong.
// The server corrects a wrong value on the first BadDeviceToken, so this is a hint.
const apnsEnv = process.env.VITE_APNS_ENV ?? "sandbox";
console.log(`APNs environment: ${apnsEnv}${apnsEnv === "sandbox" ? " (set VITE_APNS_ENV=production for TestFlight/App Store)" : ""}`);
execSync(`VITE_API_URL=${apiUrl} VITE_APNS_ENV=${apnsEnv} npx vite build`, { stdio: "inherit" });

console.log("Syncing to iOS...");
execSync("npx cap sync ios", { stdio: "inherit" });

console.log(`
✅  iOS build complete!

Next steps:
  1. Open Xcode:  npx cap open ios
  2. Select your Apple Developer Team in Signing & Capabilities
  3. Connect your iPhone or choose a simulator and press Run (▶)
  4. When ready to submit: Product → Archive → Distribute App
`);
