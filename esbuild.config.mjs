import esbuild from "esbuild";
import process from "process";
import { copyFileSync, readFileSync, writeFileSync, existsSync } from "fs";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";
const devVaultPlugin = "seed-vault/.obsidian/plugins/second-thoughts";

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtins,
	],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	minify: prod,
});

// Inject API key from .env into seed vault data.json
const dataJsonPath = `${devVaultPlugin}/data.json`;
if (existsSync(".env") && existsSync(dataJsonPath)) {
	const envLine = readFileSync(".env", "utf8").split("\n").find(l => l.startsWith("OPENAI_API_KEY="));
	if (envLine) {
		const key = envLine.split("=").slice(1).join("=").trim();
		const data = JSON.parse(readFileSync(dataJsonPath, "utf8"));
		if (data.apiKey !== key) {
			data.apiKey = key;
			writeFileSync(dataJsonPath, JSON.stringify(data, null, 2) + "\n");
		}
	}
}

if (prod) {
	await context.rebuild();
	copyFileSync("main.js", `${devVaultPlugin}/main.js`);
	copyFileSync("manifest.json", `${devVaultPlugin}/manifest.json`);
	process.exit(0);
} else {
	await context.watch();
}
