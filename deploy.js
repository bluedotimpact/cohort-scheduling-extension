#!/usr/bin/env node
/* eslint-env node */

const { readdir } = require('node:fs/promises');
const { resolve } = require('node:path');
const { spawn } = require('node:child_process');

const main = async () => {
  const remotes = await getRemotes();

  console.log(`Found ${remotes.length} remotes: ${remotes.join(', ')}\n`)

  // Set the API key
  if (!process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN) {
    throw new Error("Missing environment variable AIRTABLE_PERSONAL_ACCESS_TOKEN")
  }
  const child = spawn('block', ['set-api-key', process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN], { stdio: 'inherit'})
  await new Promise(resolve => (child.on('exit', resolve)));

  // Intentionally async in loop, if we try to do this in parallel
  // the .tmp folder has clashes
  for (const remote of remotes) {
    console.log(`Deploying remote ${remotes.indexOf(remote) + 1}/${remotes.length}: ${remote}`)
    
    const child = spawn('block', ['release', '--remote', remote], { stdio: 'inherit'})
    await new Promise(resolve => (child.on('exit', resolve)));
  }
}

const getRemotes = async () => {
  const filenames = await readdir(resolve(__dirname, ".block"))
  const remoteName = filenames.map(filename => {
    if (!filename.endsWith(".remote.json")) {
      throw new Error("Unrecognized .block file: " + filename)
    }
    return filename.slice(0, filename.length - ".remote.json".length)
  })

  return remoteName;
}

main();
