import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse } from "yaml";

const ROOT = process.cwd();
const SPEC_PATH = path.join(ROOT, "openapi", "mvp.yaml");
const REQUIRED_PATHS = ["/v1/models", "/api/keys", "/api/policies"];

function fail(message) {
  console.error(`[openapi] FAIL: ${message}`);
  process.exit(1);
}

function readSpec() {
  if (!fs.existsSync(SPEC_PATH)) {
    fail(`missing spec file: ${SPEC_PATH}`);
  }

  const raw = fs.readFileSync(SPEC_PATH, "utf8");
  let spec;
  try {
    spec = parse(raw);
  } catch (error) {
    fail(`invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!spec || typeof spec !== "object") {
    fail("spec must be a YAML object");
  }

  return spec;
}

function assertHasJsonExample(spec, routePath) {
  const getOperation = spec.paths?.[routePath]?.get;
  if (!getOperation) {
    fail(`missing GET operation for ${routePath}`);
  }

  const json =
    getOperation.responses?.["200"]?.content?.["application/json"] ??
    getOperation.responses?.["201"]?.content?.["application/json"];
  if (!json) {
    fail(`${routePath} missing JSON response content`);
  }

  const hasExample = Boolean(json.example) || Boolean(json.examples);
  if (!hasExample) {
    fail(`${routePath} must define an example or examples for application/json`);
  }
}

const spec = readSpec();

if (typeof spec.openapi !== "string" || !spec.openapi.startsWith("3.")) {
  fail("openapi version must be 3.x");
}

for (const requiredPath of REQUIRED_PATHS) {
  if (!spec.paths || !spec.paths[requiredPath]) {
    fail(`missing required path: ${requiredPath}`);
  }
  assertHasJsonExample(spec, requiredPath);
}

console.log(`[openapi] PASS validate ${path.relative(ROOT, SPEC_PATH)}`);
