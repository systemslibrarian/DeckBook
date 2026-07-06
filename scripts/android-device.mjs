/* One-command redeploy of DeckBook to a USB-attached Android device.
 *
 *   npm run android:device
 *
 * Steps: build web assets -> sync Capacitor -> assemble debug APK ->
 * install (keeping app data) -> launch. Resolves the Android SDK from
 * ANDROID_HOME / ANDROID_SDK_ROOT, or the default Windows install location.
 */

import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const APP_ID = "com.systemslibrarian.deckbook";
const APK = "android/app/build/outputs/apk/debug/app-debug.apk";
const isWin = process.platform === "win32";

// --- Locate the Android SDK -------------------------------------------------
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android", "Sdk")) ||
  (process.env.HOME && join(process.env.HOME, "Library", "Android", "sdk"));

if (!sdk || !existsSync(sdk)) {
  console.error(
    "Android SDK not found. Set ANDROID_HOME (or ANDROID_SDK_ROOT) to your SDK path.",
  );
  process.exit(1);
}
const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
const adb = join(sdk, "platform-tools", isWin ? "adb.exe" : "adb");

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env });
}

// --- Require exactly one authorized device ---------------------------------
const devices = execFileSync(adb, ["devices"], { encoding: "utf8" })
  .split("\n")
  .slice(1)
  .map((l) => l.trim())
  .filter(Boolean);
const ready = devices.filter((l) => l.endsWith("\tdevice"));
if (ready.length === 0) {
  const unauth = devices.some((l) => l.endsWith("\tunauthorized"));
  console.error(
    unauth
      ? "Device is 'unauthorized' — accept the USB debugging prompt on the phone."
      : "No device attached. Plug in a phone with USB debugging enabled.",
  );
  process.exit(1);
}

// --- Build, sync, assemble, install, launch --------------------------------
run("npm run build");
run("npx cap sync android");
run(join("android", isWin ? "gradlew.bat" : "gradlew") + " -p android assembleDebug --no-daemon");

console.log("\n$ adb install -r " + APK);
execFileSync(adb, ["install", "-r", APK], { stdio: "inherit" });

console.log("\n$ adb launch " + APP_ID);
execFileSync(
  adb,
  ["shell", "monkey", "-p", APP_ID, "-c", "android.intent.category.LAUNCHER", "1"],
  { stdio: "inherit" },
);
console.log("\n✓ DeckBook deployed and launched on device.");
