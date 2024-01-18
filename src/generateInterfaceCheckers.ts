import * as fs from 'fs/promises';
import * as path from 'path';

import { Compiler } from "ts-interface-builder";
import defaultLogger from "./log";

const log = defaultLogger.getInstanceWithPrefix('IFACE');

const files = [
  'ytdlpTypes',
  'statsFileTypes',
];

export default async function generateInterfaceCheckers() {
  for (let i = 0; i < files.length; i++){
    const fPath = path.join(__dirname, `${files[i]}.ts`);

    log.verbose(`Compiling '${fPath}'`)

    const code = Compiler.compile(fPath, {});

    await fs.writeFile(path.join(__dirname, `${files[i]}_checkers.ts`), code);
  }
}
