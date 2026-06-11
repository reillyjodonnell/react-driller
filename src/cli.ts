#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { startEngine } from "./engine";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

const drill = `  ⢀⣤⡤⠤⠤⠤⠤⠤⠤⠤⠤⠤⢤⣤⡄⢠⣤⡄
  ⣼⣿⡇⣠⣤⣤⣤⣤⣤⣤⣤⡄⢸⣿⡇⢸⣿⡇⣿⣿ ⣿⣿⣦ ⣤⣤⣤
  ⢹⣿⣇⣉⣉⣉⣉⣉⣉⣉⣉⣁⣸⣿⡇⢸⣿⡇⠿⠿ ⠛⠛⠉
   ⠉⠉⠙⠛⢿⣿⣿⣿⣿⡟⠛⠛⠛⠃⠈⠉⠁
        ⣿⣿⣿⣿ ⣾
       ⢀⣿⣿⡏
       ⣼⣿⣿⣇
      ⠰⣿⣿⣿⡿
      ⣤⣤⣤⣤⣤
   ⢀⣶⣶⣿⣿⣿⣿⣿⣶⣶⣶⣶⣶⣦
  ⢀⣉⣉⣉⣉⣉⣉⣉⣉⣉⣉⣉⣉⣉⣉⡁
  ⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
  ⠘⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠃`;

const banner = `
${cyan(drill)}

  ${bold("react-driller")}  ${dim("· bye prop drilling")}
`;

function printUsage() {
  console.log(banner);
  console.log(`  ${bold("usage")}  react-driller <path-to-file>`);
  console.log();
}

const [, , rawPath, ...rest] = process.argv;

if (!rawPath || rest.length > 0) {
  printUsage();
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), rawPath);

if (!fs.existsSync(filePath)) {
  console.error(`${red("error")} file not found: ${dim(filePath)}`);
  process.exit(1);
}

console.log(banner);
console.log(`  ${dim(path.basename(filePath))}`);
console.log();

startEngine(filePath);
