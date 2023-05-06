import * as vscode from "vscode";
import { CONTEXT, FILENAME } from "#constants";
import { S4TKConfig } from "#models/s4tk-config";
import { fileExists, findOpenDocument, replaceEntireDocument } from "#helpers/fs";
import { MessageButton, handleMessageButtonClick } from "./messaging";
import StringTableJson from "#models/stbl-json";
import { SCHEMA_DEFAULTS } from "#assets";

class _S4TKWorkspace {
  //#region Properties

  private _isSavingDocument: boolean = false;

  private _config?: S4TKConfig;
  get config() { return this._config; }
  private set config(config: S4TKConfig | undefined) {
    this._config = config;
    vscode.commands.executeCommand(
      'setContext',
      CONTEXT.workspace.active,
      this.active
    );
  }

  get active() { return Boolean(this._config); }

  //#endregion

  //#region Activation

  /**
   * Does setup work for the S4TK workspace.
   */
  activate() {
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (this._isSavingDocument) return;
      if (document.fileName.endsWith(FILENAME.config)) this.loadConfig();
    });

    vscode.workspace.onDidDeleteFiles((e) => {
      if (!this.active) return;
      if (e.files.some(uri => uri.path.endsWith(FILENAME.config))) {
        this.config = undefined;
        vscode.window.showWarningMessage("S4TK config has been unloaded.");
      }
    });

    this.loadConfig();
  }

  //#endregion

  //#region Public Methods

  /**
   * Inserts a new package instructions object to the build instructions of the
   * config, if it is loaded. If an editor is provided, then the editor will be
   * used to make the edit. If not, then it will be written straight to disk.
   */
  async addPackageInstructions(editor?: vscode.TextEditor) {
    await this._tryEditAndSaveConfig("Add Package Instructions", editor, (config) => {
      config.buildInstructions.packages ??= [];
      config.buildInstructions.packages.push({
        filename: "",
        include: [],
      });
    });
  }

  /**
   * Generates the files needed for an S4TK project and loads the config.
   */
  async createDefaultWorkspace() {
    // confirm workspace doesn't already exist
    const configInfo = await S4TKConfig.find();
    if (configInfo.exists) {
      vscode.window.showWarningMessage("S4TK config file already exists.");
      return;
    } else if (!configInfo.uri) {
      vscode.window.showErrorMessage("Failed to locate URI for config file.");
      return;
    }

    const configData = await vscode.workspace.fs.readFile(SCHEMA_DEFAULTS.config);

    vscode.workspace.fs.writeFile(configInfo.uri, configData).then(() => {
      vscode.window.showTextDocument(configInfo.uri!);
      this.loadConfig();
    });

    const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri as vscode.Uri;
    vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, "out"));
    vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, "src"));
    vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, "strings"));

    const stblUri = vscode.Uri.joinPath(rootUri, "strings", "default.stbl.json");
    if (!(await fileExists(stblUri))) {
      vscode.workspace.fs.writeFile(stblUri, StringTableJson.generateBuffer("object"));
    }
  }

  /**
   * Attempts to save the given document and then reload the config.
   * 
   * @param document Document to save before reloading the config
   */
  async trySaveDocumentAndReload(document: vscode.TextDocument) {
    if (this._isSavingDocument || !document.isDirty) return;
    this._isSavingDocument = true;
    await document.save();
    await this.loadConfig();
    this._isSavingDocument = false;
  }

  /**
   * Loads the config into the workspace if it exists and is valid. If it does
   * not exist or is not valid, then the config becomes unloaded.
   * 
   * @param showNoConfigError Whether or not to display an error to the user
   * if there is no config to load
   */
  async loadConfig({ showNoConfigError = false }: { showNoConfigError?: boolean; } = {}) {
    // do not use _config or delete; must use setter to trigger context change
    this.config = undefined;

    const configInfo = await S4TKConfig.find();
    if (!(configInfo.uri && configInfo.exists)) {
      if (showNoConfigError)
        vscode.window.showWarningMessage(
          "No 's4tk.config.json' file was found at the root of this project.",
          MessageButton.CreateProject,
        ).then(handleMessageButtonClick);
      return;
    }

    try {
      const content = await vscode.workspace.fs.readFile(configInfo.uri!);
      const config = S4TKConfig.parse(content.toString());
      vscode.window.showInformationMessage('Successfully loaded S4TK config.');
      // do not use _config; must use setter to trigger context change
      this.config = config;
    } catch (e) {
      vscode.window.showErrorMessage(
        `Could not validate S4TK config. You will not be able to build your project until all errors are resolved and the config has been reloaded. (${e})`,
        MessageButton.GetHelp,
        MessageButton.ReloadConfig,
      ).then(handleMessageButtonClick);
    }
  }

  /**
   * Sets the STBL at the given URI as the default STBL for this project.
   * 
   * @param stblUri URI of the string table to set as default
   */
  async setDefaultStbl(stblUri: vscode.Uri) {
    await this._tryEditAndSaveConfig("Set Default STBL", null, (config) => {
      //@ts-ignore Ok to leave blank, proxy takes care of defaults
      config.stringTables ??= {};
      config.stringTables.defaultPath = stblUri.fsPath;
    });
  }

  //#endregion

  //#region Private Methods

  private async _tryEditAndSaveConfig(
    action: string,
    editor: vscode.TextEditor | undefined | null,
    fn: (config: S4TKConfig) => void
  ) {
    if (!this._config) {
      vscode.window.showErrorMessage(
        `Cannot perform '${action}' because no S4TK config is currently loaded.`,
        MessageButton.ReloadConfig,
      ).then(handleMessageButtonClick);
      return undefined;
    }

    const configUri = (await S4TKConfig.find()).uri;
    if (!configUri) {
      vscode.window.showErrorMessage(
        `Cannot perform '${action}' because no S4TK config could be located. Please report this problem.`,
        MessageButton.ReportProblem,
      ).then(handleMessageButtonClick);
      return undefined;
    }

    const openConfigDocument = editor?.document ?? findOpenDocument(configUri);
    if (openConfigDocument)
      await this.trySaveDocumentAndReload(openConfigDocument);

    if (!this._config) {
      vscode.window.showErrorMessage(
        `Your S4TK config file was automatically saved before performing '${action}', and these changes have made it invalid. You must fix your config file and reload it before trying '${action}' again.`,
        MessageButton.ReloadConfig,
      ).then(handleMessageButtonClick);
      return undefined;
    }

    S4TKConfig.modify(this._config, fn);
    const newContent = S4TKConfig.stringify(this._config);

    if (!(editor && await replaceEntireDocument(editor, newContent)))
      vscode.workspace.fs.writeFile(configUri, Buffer.from(newContent));
  }

  //#endregion
}

const S4TKWorkspace = new _S4TKWorkspace();
export default S4TKWorkspace;
