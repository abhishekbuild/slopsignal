import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

// WxtVitest wires the WXT aliases, .env values and a fake `browser` (in-memory storage) into vitest.
export default defineConfig({ plugins: [WxtVitest()] });
