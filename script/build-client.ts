import { build as viteBuild } from "vite";
import { rm } from "fs/promises";

async function buildClient() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();
  console.log("client build done.");
}

buildClient().catch((err) => {
  console.error("Client build error:");
  console.error(err);
  process.exit(1);
});
