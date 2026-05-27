import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const packages = [
  {
    workspace: "@project-autopsy/core",
    requiredFiles: ["dist/index.js", "dist/index.d.ts"],
    requiredBin: undefined
  },
  {
    workspace: "@project-autopsy/cli",
    requiredFiles: ["dist/index.js", "dist/index.d.ts"],
    requiredBin: "dist/index.js"
  }
];

for (const packageSpec of packages) {
  const pack = await npmPackDryRun(packageSpec.workspace);
  const files = pack.files.map((file) => file.path);

  for (const requiredFile of packageSpec.requiredFiles) {
    if (!files.includes(requiredFile)) {
      throw new Error(`${packageSpec.workspace} package is missing ${requiredFile}`);
    }
  }

  if (packageSpec.requiredBin && !files.includes(packageSpec.requiredBin)) {
    throw new Error(`${packageSpec.workspace} package is missing bin entry ${packageSpec.requiredBin}`);
  }

  const leakedFile = files.find((file) => file.startsWith("src/") || file.startsWith("test/") || file === "tsconfig.json");
  if (leakedFile) {
    throw new Error(`${packageSpec.workspace} package includes non-runtime file ${leakedFile}`);
  }

  console.log(`${packageSpec.workspace} package dry run ok: ${pack.entryCount} files, ${pack.unpackedSize} bytes unpacked`);
}

async function npmPackDryRun(workspace) {
  const { stdout } = await execAsync(`npm pack --workspace ${workspace} --dry-run --json`, { windowsHide: true });
  const result = JSON.parse(stdout);
  const pack = result[0];

  if (!pack || !Array.isArray(pack.files)) {
    throw new Error(`npm pack did not return package file metadata for ${workspace}`);
  }

  return pack;
}
