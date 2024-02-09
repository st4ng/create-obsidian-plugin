#!/usr/bin/env node
import Zip from "adm-zip"
import chalk from "chalk"
import { capitalCase, kebabCase, pascalCase } from "change-case"
import { Command } from "commander"
import { promises as fs } from "fs"
import fetch from "node-fetch"
import path from "path"
import replaceInFile from "replace-in-file"
import { promisify } from "util"

// @ts-expect-error assert is required
import packageJson from "./package.json" assert { type: "json" }

const pluginIdPrefix = "obsidian-"
const templateUrl =
  "https://github.com/obsidianmd/obsidian-sample-plugin/archive/refs/heads/master.zip"

const init = () => {
  const cmd = new Command(packageJson.name)
    .version(packageJson.version)
    .arguments("<plugin-id>")
    .usage(`${chalk.green("<plugin-id>")} [options]`)
    .option("-p, --path <plugin-path>", "Path to destination directory")
    .option("-d, --description <plugin-description>", "Plugin description")
    .allowExcessArguments(false)
    .allowUnknownOption(false)
    .action(async (pluginId, { directory, description }) => {
      const plugin = await createObsidianPlugin(pluginId, {
        directory,
        description,
      }).catch((error) => {
        throw error.message || error
      })
      if (plugin)
        console.log(
          chalk.green(
            `✅ Created ${plugin.name} Plugin Project at ${plugin.directory}.`
          )
        )
    }).configureOutput({
      writeErr: (str) => process.stderr.write(chalk.red(`❌ ${str}`)),
    })
  
  cmd.parse(process.argv)
}

type CreatePluginOptions = Partial<{
  name: string
  description: string
  directory: string
}>

const createObsidianPlugin = async (
  id: string,
  options: CreatePluginOptions = {}
) => {
  if (id !== kebabCase(id)) throw new Error("Id must be kebab-case")
  if (!id.startsWith(pluginIdPrefix)) id = `${pluginIdPrefix}${id}`
  const {
    name = capitalCase(id.replace(pluginIdPrefix, "")),
    description = "",
    directory = id,
  } = options
  await fetchAndExtractZip(templateUrl, directory)

  const className = pascalCase(name)
  const templateReplacements = {
    "obsidian-sample-plugin": id,
    "sample-plugin": id,
    "Sample Plugin": name,
    SampleSetting: `${className}Setting`,
    '"description": ".*",': `"description": "${description}",`,
    " MyPlugin ": ` ${className} `,
    MyPlugin: className,
    "\n// Remember to rename these classes and interfaces!": "",
  }

  await replaceInFile({
    files: `${directory}/**/*`,
    from: Object.keys(templateReplacements).map((key) => new RegExp(key, "g")),
    to: Object.values(templateReplacements),
    ignore: `${directory}/README.md`,
  })

  return {
    id,
    name,
    description,
    directory,
  }
}

const fetchAndExtractZip = async (
  url: string,
  destinationPath: string,
  overwrite = false
) => {
  if (!overwrite && (await fileExists(destinationPath))) {
    throw new Error(`Destination path already exists (${destinationPath}).`)
  }

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to download template (status=${response.status}).`)
  }

  const zipBuffer = Buffer.from(await response.arrayBuffer())
  const zip = new Zip(zipBuffer)

  await promisify(zip.extractAllToAsync)(destinationPath, false, false)

  const extractedPath = path.join(
    destinationPath,
    zip.getEntries()[0]?.entryName || ""
  )

  const files = await fs.readdir(extractedPath)
  await Promise.all(
    files.map(async (file) =>
      fs.cp(path.join(extractedPath, file), path.join(destinationPath, file), {
        recursive: true,
      })
    )
  )
  await fs.rm(extractedPath, { recursive: true, force: true })
}

const fileExists = async (path: string) =>
  fs
    .stat(path)
    .then(() => true)
    .catch(() => false)

init()
