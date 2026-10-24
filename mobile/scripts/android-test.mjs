/** Android JVM unit tests (and, with --device, instrumented tests on a connected device/emulator). */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const win = process.platform === "win32";
const run = (cmd, args, cwd) => {
	const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: win });
	if (r.status !== 0) process.exit(r.status ?? 1);
};
run("yarn", ["schema"], root); // SchemaAssetTest reads the generated schema
const gradlew = win ? "gradlew.bat" : "./gradlew";
const android = resolve(root, "android");
run(gradlew, ["testDebugUnitTest"], android);
if (process.argv.includes("--device")) run(gradlew, ["connectedDebugAndroidTest"], android);
