/**
 * 把 build 產物（main.js / manifest.json / styles.css）複製到
 * vault-template/.obsidian/plugins/inv-record/，讓 vault 模板開箱即用。
 *
 * 用法：npm run install:vault [目標vault路徑]
 * 不帶參數時安裝到 repo 內的 vault-template。
 */
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const pluginDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(pluginDir, "..");
const targetVault = process.argv[2]
  ? resolve(process.argv[2])
  : join(repoRoot, "vault-template");

const targetDir = join(targetVault, ".obsidian", "plugins", "inv-record");
const files = ["main.js", "manifest.json", "styles.css"];

for (const f of files) {
  if (!existsSync(join(pluginDir, f))) {
    console.error(`找不到 ${f}，請先執行 npm run build`);
    process.exit(1);
  }
}

mkdirSync(targetDir, { recursive: true });
for (const f of files) {
  copyFileSync(join(pluginDir, f), join(targetDir, f));
  console.log(`已複製 ${f} → ${targetDir}`);
}
console.log("完成。");
