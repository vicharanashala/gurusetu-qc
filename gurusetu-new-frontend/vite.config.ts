import { defineConfig } from "vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"

// Dev proxy target is configurable so a dev frontend can be pointed at a
// non-default backend port without editing this file.
const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:4187"

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    port: Number(process.env.VITE_PORT ?? 4188),
    host: "0.0.0.0",
    strictPort: true,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  plugins: [tailwindcss(), tanstackRouter({ target: "react" }), viteReact()],
})

export default config