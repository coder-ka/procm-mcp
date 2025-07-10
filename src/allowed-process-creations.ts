import path from "path";
import fs from "fs/promises";
import { mkdirp } from "mkdirp";
import { ProcmMcpDir } from "./procm-mcp-dir.js";

export type ProcessCreation = {
  script: string;
  args: string[];
  cwd: string;
};

export async function checkProcessCreationAllowed(
  request: ProcessCreation
): Promise<boolean> {
  const allowedCreations = await readJson();

  const newCreation: ProcessCreation = {
    script: request.script,
    args: request.args || [],
    cwd: request.cwd || process.cwd(),
  };

  return allowedCreations.some(
    (x) =>
      x.script === newCreation.script &&
      x.args.every((y, i) => y === newCreation.args[i]) &&
      x.cwd === newCreation.cwd
  );
}

export async function allowProcessCreation(request: ProcessCreation) {
  const allowedCreations = await readJson();

  const newCreation: ProcessCreation = {
    script: request.script,
    args: request.args || [],
    cwd: request.cwd || process.cwd(),
  };

  allowedCreations.push(newCreation);

  await writeJson(allowedCreations);
}

function JsonPath() {
  return path.join(ProcmMcpDir(), "allowed-process-creations.json");
}

async function readJson(): Promise<ProcessCreation[]> {
  const jsonPath = JsonPath();

  await mkdirp(path.dirname(jsonPath));

  const json = await fs.readFile(jsonPath, { encoding: "utf8" }).catch((e) => {
    if (e.code === "ENOENT") {
      return "[]"; // Return an empty array if the file does not exist
    }
    throw e; // Re-throw other errors
  });

  const allowedCreations: ProcessCreation[] = JSON.parse(json);

  return allowedCreations;
}

async function writeJson(allowedCreations: ProcessCreation[]) {
  const jsonPath = JsonPath();

  await fs.writeFile(jsonPath, JSON.stringify(allowedCreations, null, 2), {
    encoding: "utf8",
  });
}
