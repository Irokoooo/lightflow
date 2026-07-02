import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
    base: "./",
    plugins: [react()],
    resolve: {
        alias: {
            "#minpath": fileURLToPath(new URL("./node_modules/vfile/lib/minpath.browser.js", import.meta.url)),
            "#minproc": fileURLToPath(new URL("./node_modules/vfile/lib/minproc.browser.js", import.meta.url)),
            "#minurl": fileURLToPath(new URL("./node_modules/vfile/lib/minurl.browser.js", import.meta.url)),
        },
    },
    server: {
        host: "0.0.0.0",
    },
});
