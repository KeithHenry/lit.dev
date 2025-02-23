/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  compileTypeScriptOnce,
  compileTypeScriptWatch,
  InvokeTypeScriptOpts,
} from './typescript-util.js';

import pathlib from 'path';
import fs from 'fs/promises';
import {fileURLToPath} from 'url';

import chokidar from 'chokidar';
import {
  idiomaticDecoratorsTransformer,
  preserveBlankLinesTransformer,
  constructorCleanupTransformer,
  BLANK_LINE_PLACEHOLDER_COMMENT_REGEXP,
} from '@lit/ts-transformers';
import prettier from 'prettier';

import type {ProjectManifest} from 'playground-elements/shared/worker-api';

const THIS_DIR = pathlib.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = pathlib.join(THIS_DIR, '..', '..', '..');
const TS_SAMPLES_DIR = pathlib.join(
  REPO_DIR,
  'packages',
  'lit-dev-content',
  'samples'
);
const JS_SAMPLES_DIR = pathlib.join(TS_SAMPLES_DIR, 'js');

/**
 * Copy a Playground project.json file from the samples/ dir to the samples/js/
 * dir, replacing any .ts filenames with the .js version.
 */
const updateAndWriteProjectConfig = async (
  relPath: string,
  ignoreJsonError = false
) => {
  console.log('writing config', relPath);
  const absPath = pathlib.join(TS_SAMPLES_DIR, relPath);
  const oldJson = await fs.readFile(absPath, 'utf8');
  let project: ProjectManifest;
  try {
    project = JSON.parse(oldJson) as ProjectManifest;
  } catch (e) {
    const msg = `Invalid JSON in ${relPath}: ${(e as Error).message}`;
    if (ignoreJsonError) {
      // It's expected during watch mode that we'll get JSON parse errors, e.g.
      // when the user first creates an empty project.json file. Don't exit the
      // entire watch script, just show the error and skip it until it's fixed.
      console.error(msg);
      return;
    }
    throw new Error(msg);
  }
  if (project.files) {
    // Note we create a new files object here because we want to preserve the
    // original property order, since that affects displayed tab order, which a
    // delete + assign would not do. (Side note: this is probably a sign that
    // the Playground project files property should be an array instead of a
    // data object).
    const newFiles: typeof project.files = {};
    for (const [fileName, options] of Object.entries(project.files)) {
      const newFileName = fileName.replace(/\.ts$/, '.js');
      newFiles[newFileName] = options;
    }
    project.files = newFiles;
  }
  const outPath = pathlib.join(JS_SAMPLES_DIR, relPath);
  await fs.mkdir(pathlib.dirname(outPath), {recursive: true});
  const newJson = JSON.stringify(project, null, 4);
  await fs.writeFile(outPath, newJson, 'utf8');
};

/**
 * Symlink a file from the samples/ dir to the samples/js/ dir.
 *
 * Symlinking is better when we can because we don't need to copy on every
 * modification, which is wasteful and could trigger double reloads of the dev
 * server.
 */
const symlinkProjectFile = async (relPath: string) => {
  console.log('symlinking', relPath);
  const absPath = pathlib.join(TS_SAMPLES_DIR, relPath);
  const outPath = pathlib.join(JS_SAMPLES_DIR, relPath);
  await fs.mkdir(pathlib.dirname(outPath), {recursive: true});
  try {
    // In case a file/symlink already exists.
    await fs.unlink(outPath);
  } catch (e) {
    if ((e as {code: string}).code !== 'ENOENT') {
      throw e;
    }
  }
  await fs.symlink(absPath, outPath);
};

/**
 * A file in the samples/ dir was deleted.
 */
const deleteProjectFile = async (relPath: string) => {
  console.log('deleting', relPath);
  const outPath = pathlib.join(JS_SAMPLES_DIR, relPath);
  await fs.unlink(outPath);
};

const USAGE = `
Usage: node generate-js-samples.js [--watch]

Syncronizes files in the lit.dev TypeScript samples/ directory to the
JavaScript samples/js/ directory.

Options:

--watch     Watch files and update on every change.
`;

let watchMode = false;
for (const arg of process.argv.slice(2)) {
  if (arg === '--watch') {
    watchMode = true;
  } else {
    console.log(USAGE);
    process.exit(1);
  }
}

const isProjectConfig = (path: string) =>
  pathlib.basename(path) === 'project.json';

const nonTsFilesWatcher = chokidar
  .watch(
    [
      '.',
      // Don't watch our own output dir.
      '!js/',
      // TypeScript files are handled separately
      '!*.ts',
      '!**/*.ts',
      // These config files are unnecessary.
      '!tsconfig.json',
      '!base.json',
    ],
    {cwd: TS_SAMPLES_DIR}
  )
  .on('add', (path) => {
    if (isProjectConfig(path)) {
      updateAndWriteProjectConfig(path, watchMode);
    } else {
      symlinkProjectFile(path);
    }
  })
  .on('change', async (path) => {
    if (isProjectConfig(path)) {
      updateAndWriteProjectConfig(path, watchMode);
    }
  })
  .on('unlink', (path) => {
    deleteProjectFile(path);
  });

// The ready event is fired after the first initial scan completes.
await new Promise<void>((resolve) => {
  nonTsFilesWatcher.on('ready', () => resolve());
});

const tsCompileOpts: InvokeTypeScriptOpts = {
  tsConfigPath: pathlib.join(TS_SAMPLES_DIR, 'tsconfig.json'),

  transformersFactory: (program) => ({
    before: [
      // Preserve blank lines by inserting a special comment.
      preserveBlankLinesTransformer(),
      // Transform Lit decorators to idiomatic vanilla JavaScript.
      idiomaticDecoratorsTransformer(program),
    ],
    after: [
      // Readability improvements for constructors.
      constructorCleanupTransformer(program),
    ],
  }),

  transformJs: (js) => {
    // Replace the special blank line placeholder comments from
    // preserveBlankLinesTransformer.
    js = js.replace(BLANK_LINE_PLACEHOLDER_COMMENT_REGEXP, '\n');
    // Prettier does a nicer job than TypeScript's built-in formatter.
    js = prettier.format(js, {
      parser: 'typescript',
      singleQuote: true,
      bracketSpacing: false,
    });
    return js;
  },
};

if (watchMode) {
  compileTypeScriptWatch(tsCompileOpts);
} else {
  await nonTsFilesWatcher.close();
  if (!compileTypeScriptOnce(tsCompileOpts)) {
    console.error('TypeScript compilation failed');
    process.exitCode = 1;
  } else {
    console.log('\nSuccess!\n');
  }
}
