import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-ignore: keycloakify/vite-plugin module resolution issue
import { keycloakify } from "keycloakify/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [
        react(),
        keycloakify({
            accountThemeImplementation: "none"
        }),
        tailwindcss()
    ]
});
