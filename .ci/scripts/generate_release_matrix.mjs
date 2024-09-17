/**
 * generate_release_matrix.js
 *
 * This script generates a matrix of Docker images to build and push to a Container Registry.
 * It performs the following tasks:
 *
 * 1. **Extracts metadata**:
 *    - Reads `metadata.yaml` in each subdirectory under the `containers` directory.
 *
 * 3. **Generates a Build Matrix**:
 *    - Constructs a matrix of images to build based on the versions that do not already exist on GHCR.
 *    - Formats the matrix in JSON to be used by GitHub Actions for subsequent build jobs.
 *
 * **Environment Variables**:
 * - `IMAGES_FOLDER`: The base folder that contains the container images. Defaults to "apps".
 * - `INCLUDE_IMAGES`: An optional comma-separated list of images to include in the matrix.
 *
 * **Usage**:
 * - This is meant to be ran in a GitHub Actions workflow to generate a matrix for a downstream job.
 */

import fs from "fs";
import path from "path";
import YAML from "yaml";

const imagesRepo = "https://github.com/bjw-s-labs/container-images";

// Configuration from environment variables
const IMAGES_FOLDER = process.env.IMAGE_FOLDER || "apps";
const INCLUDE_IMAGES = process.env.INCLUDE_IMAGES;

function extractMetadataField(metadataPath, field) {
  const content = fs.readFileSync(metadataPath, "utf8");
  try {
    var yamlContent = YAML.parse(content);
  } catch (error) {
    throw new Error(`Could not parse ${metadataPath}`);
  }

  if (!yamlContent[field]) {
    throw new Error(
      `"${field}" field not found in metadata.yaml: ${metadataPath}`
    );
  }
  return yamlContent[field];
}

function extractVersion(metadataPath) {
  return extractMetadataField(metadataPath, "version");
}

function extractPlatforms(metadataPath) {
  return extractMetadataField(metadataPath, "platforms");
}

function extractType(metadataPath) {
  return extractMetadataField(metadataPath, "type");
}

function extractTestConfig(metadataPath) {
  return extractMetadataField(metadataPath, "tests");
}

function extractSourceRepo(metadataPath) {
  try {
    return extractMetadataField(metadataPath, "source_repo");
  } catch (error) {
    return imagesRepo;
  }
}

async function generateMatrix() {
  const basePath = IMAGES_FOLDER;
  const matrix = [];

  var foldersToInclude = [];
  if (INCLUDE_IMAGES) {
    foldersToInclude = INCLUDE_IMAGES.split(",");
  }

  for (const folder of fs.readdirSync(basePath)) {
    if (foldersToInclude.length > 0 && !foldersToInclude.includes(folder)) {
      continue;
    }

    const image_name = folder;
    const folderPath = path.join(basePath, folder);
    const dockerfilePath = path.join(folderPath, "Dockerfile");
    const metadatafilePath = path.join(folderPath, "metadata.yaml");

    if (
      fs.statSync(folderPath).isDirectory() &&
      fs.existsSync(dockerfilePath) &&
      fs.existsSync(metadatafilePath)
    ) {
      try {
        let version = extractVersion(metadatafilePath);
        const platforms = extractPlatforms(metadatafilePath);
        const type = extractType(metadatafilePath);
        const testsConfig = extractTestConfig(metadatafilePath);
        const source_repo = extractSourceRepo(metadatafilePath);
        console.info(
          `Adding image ${image_name}:${version} to the job matrix.`
        );
        matrix.push({
          job_name: image_name,
          context: folderPath,
          dockerfile: dockerfilePath,
          version: version,
          platforms: platforms,
          type: type,
          source_repo: source_repo,
          tests: testsConfig,
        });
      } catch (error) {
        console.error(
          `Error processing Dockerfile in ${folderPath}: ${error.message}`
        );
        process.exit(1);
      }
    }
  }
  console.log(`Job matrix: ${JSON.stringify({ include: matrix }, null, 2)}`);

  fs.writeFile(
    "matrix.json",
    JSON.stringify({ include: matrix }, null, 0),
    (err) => {
      if (err) {
        console.log("Failed to write matrix to file.");
        console.error(err);
      } else {
        console.log("Matrix dumped to file successfully.");
      }
    }
  );
}

generateMatrix().catch((error) => {
  console.error("Error generating matrix:", error);
  process.exit(1);
});
