// The harness reference as a static site. The integration finds `corpus-site.config.ts` beside
// this file by name.
import vue from "@astrojs/vue";
import { corpusSite } from "@osdlc/corpus-site";
import { defineConfig } from "astro/config";

// Host names `astro dev` and `astro preview` answer to beside localhost, separated by commas:
// CORPUS_SITE_ALLOWED_HOSTS=my-laptop.example.net pnpm run preview
const allowedHosts = (process.env.CORPUS_SITE_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  integrations: [vue(), corpusSite({ root: "../corpus" })],
  server: { allowedHosts },
});
