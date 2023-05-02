import * as vscode from "vscode";
import { StringTableLocale } from "@s4tk/models/enums";
import { S4TKConfig, RawS4TKConfig, StringTableLocaleString } from "./types";

const CONFIG_FILENAME = "s4tk.config.json";

/**
 * Loads the `s4tk.config.json` file and parses it into an object.
 * 
 * @returns Parsed and processed S4TK config
 */
export async function loadConfig(): Promise<S4TKConfig> {
  const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;

  if (rootUri) {
    const configUri = vscode.Uri.joinPath(rootUri, CONFIG_FILENAME);
    const content = (await vscode.workspace.fs.readFile(configUri)).toString();
    const rawConfig = JSON.parse(content) as RawS4TKConfig;
    return _processConfig(rawConfig);
  }

  throw new Error("Could not load S4TK config.");
}

/**
 * Saves an S4TK config object to the `s4tk.config.json` file.
 * 
 * @param config Config file to save
 */
export async function saveConfig(config: S4TKConfig) {
  const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;

  if (rootUri) {
    const rawConfig = _serializeConfig(config);
    const bytes = Buffer.from(JSON.stringify(rawConfig, null, 2));
    const configUri = vscode.Uri.joinPath(rootUri, CONFIG_FILENAME);
    await vscode.workspace.fs.writeFile(configUri, bytes);
  }
}

//#region Helpers

function _processConfig(rawConfig: RawS4TKConfig): S4TKConfig {
  // just for typing / readability
  const config = rawConfig as unknown as S4TKConfig;

  if (rawConfig.stringTables) {
    if (rawConfig.stringTables.generateMissingLocales == undefined) {
      config.stringTables!.generateMissingLocales = true;
    }

    if (rawConfig.stringTables.defaultLocale == undefined) {
      config.stringTables!.defaultLocale = StringTableLocale.English;
    } else {
      config.stringTables!.defaultLocale = StringTableLocale[rawConfig.stringTables!.defaultLocale!];
    }
  }

  return config;
}

function _serializeConfig(config: S4TKConfig): RawS4TKConfig {
  // just for typing / readability
  const rawConfig = config as unknown as RawS4TKConfig;

  if (config.stringTables) {
    rawConfig.stringTables!.defaultLocale =
      StringTableLocale[config.stringTables.defaultLocale] as StringTableLocaleString;
  }

  return rawConfig;
}

//#endregion