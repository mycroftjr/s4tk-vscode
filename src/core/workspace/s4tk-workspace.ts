import * as vscode from "vscode";
import S4TKAssets from "#assets";
import { CONTEXT, FILENAME } from "#constants";
import { fileExists, findOpenDocument, getRelativeToRoot, replaceEntireDocument } from "#helpers/fs";
import { S4TKConfig } from "#models/s4tk-config";
import StringTableJson from "#models/stbl-json";
import { S4TKSettings } from "#helpers/settings";
import { MessageButton, handleMessageButtonClick } from "./messaging";
import S4TKIndex from "./indexing";

// FIXME: remove _ prefix and no longer use singleton
export class _S4TKWorkspace {
  //#region Properties

  private _isSavingDocument: boolean = false;
  private _activeConfig?: S4TKConfig;
  private _blankConfig: S4TKConfig = S4TKConfig.blankProxy();
  get config(): S4TKConfig { return this._activeConfig ?? this._blankConfig; }
  get active() { return Boolean(this._activeConfig); }

  //#endregion

  //#region Activation

  /**
   * Does setup work for the S4TK workspace.
   */
  activate() {
    S4TKIndex.refresh();

    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.fileName.endsWith(".xml") && !document.fileName.endsWith(".SimData.xml"))
        S4TKIndex.onSaveDocument(document);
      if (this._isSavingDocument) return;
      if (document.fileName.endsWith(FILENAME.config)) this.loadConfig();
    });

    vscode.workspace.onDidDeleteFiles((e) => {
      if (!this.active) return;

      e.files.forEach(file => {
        S4TKIndex.onDeleteFile(file.fsPath);
      });

      if (e.files.some(uri => uri.path.endsWith(FILENAME.config))) {
        this._setConfig();
        if (S4TKSettings.get("showConfigUnloadedMessage"))
          vscode.window.showWarningMessage("S4TK config has been unloaded.");
      }
    });

    vscode.workspace.onDidCreateFiles((e) => {
      e;
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
    await this._tryEditAndSaveConfig("Add Package", editor, (config) => {
      config.buildInstructions.packages.push({
        filename: `MyPackage${config.buildInstructions.packages.length + 1}`,
        include: ["**/*"],
        exclude: [],
      });
    });
  }

  /**
   * Generates an S4TK config at the project root. Returns true if one was
   * created successfully.
   * 
   * @param show Whether or not to show the document when it's created
   */
  async createConfig(show: boolean): Promise<boolean> {
    // confirm workspace doesn't already exist
    const configInfo = await S4TKConfig.find();
    if (configInfo.exists) {
      vscode.window.showWarningMessage("S4TK config file already exists.");
      return false;
    } else if (!configInfo.uri) {
      vscode.window.showErrorMessage("Failed to locate URI for config file.");
      return false;
    }

    const configData = await vscode.workspace.fs.readFile(S4TKAssets.SAMPLES.config);

    vscode.workspace.fs.writeFile(configInfo.uri, configData).then(() => {
      this.loadConfig();
      if (show) vscode.window.showTextDocument(configInfo.uri!);
    });

    return true;
  }

  /**
   * Generates a sample S4TK project, including a config.
   */
  async createDefaultWorkspace() {
    if (!(await this.createConfig(false))) return;

    const fs = vscode.workspace.fs;
    const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri as vscode.Uri;

    fs.createDirectory(vscode.Uri.joinPath(rootUri, "out"));
    fs.createDirectory(vscode.Uri.joinPath(rootUri, "src"));
    fs.createDirectory(vscode.Uri.joinPath(rootUri, "src", "strings"));
    fs.createDirectory(vscode.Uri.joinPath(rootUri, "src", "tuning"));
    fs.createDirectory(vscode.Uri.joinPath(rootUri, "src", "packages"));

    const createFile = async (contentSource: vscode.Uri | Buffer, ...destination: string[]) => {
      const uri = vscode.Uri.joinPath(rootUri, ...destination);
      if (!(await fileExists(uri))) {
        const content = contentSource instanceof Buffer
          ? contentSource
          : await fs.readFile(contentSource);
        await fs.writeFile(uri, content);
      }
      return uri;
    };

    createFile(S4TKAssets.SAMPLES.readme, "HowToUseS4TK.md").then((uri) => {
      vscode.window.showTextDocument(uri);
    });

    createFile(S4TKAssets.SAMPLES.gitignore, ".gitignore");
    createFile(S4TKAssets.SAMPLES.package, "src", "packages", "sample.package");
    createFile(S4TKAssets.SAMPLES.tuning, "src", "tuning", "buff_Example.xml");
    createFile(S4TKAssets.SAMPLES.simdata, "src", "tuning", "buff_Example.SimData.xml");
    createFile(S4TKAssets.SAMPLES.stbl, "src", "strings", "sample.stbl");

    const stblJson = StringTableJson.generate(S4TKSettings.get("defaultStringTableJsonType"));
    JSON.parse((await fs.readFile(S4TKAssets.SAMPLES.stblJsonStrings)).toString()
    ).forEach((value: string) => stblJson.addEntry({ value }));
    stblJson.insertDefaultMetadata();
    const stblBuffer = Buffer.from(stblJson.stringify());
    createFile(stblBuffer, "src", "strings", "default.stbl.json");
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
    this._setConfig();

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
      if (S4TKSettings.get("showConfigLoadedMessage"))
        vscode.window.showInformationMessage('Successfully loaded S4TK config.');
      this._setConfig(config);
    } catch (e) {
      vscode.window.showErrorMessage(
        `Could not validate S4TK config. You will not be able to build your project until all errors are resolved and the config has been reloaded. [${e}]`,
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
      config.stringTableSettings.defaultStringTable =
        getRelativeToRoot(stblUri) ?? stblUri.fsPath;
    });
  }

  //#endregion

  //#region Private Methods

  private _setConfig(config?: S4TKConfig) {
    this._activeConfig = config;
    vscode.commands.executeCommand(
      'setContext',
      CONTEXT.workspace.active,
      this.active
    );
  }

  private async _tryEditAndSaveConfig(
    action: string,
    editor: vscode.TextEditor | undefined | null,
    fn: (config: S4TKConfig, configUri: vscode.Uri) => void
  ) {
    if (!this.active) {
      vscode.window.showErrorMessage(
        `Cannot perform '${action}' because no S4TK config is currently loaded.`,
        MessageButton.ReloadConfig,
      ).then(handleMessageButtonClick);
      return;
    }

    const configUri = (await S4TKConfig.find()).uri;
    if (!configUri) {
      vscode.window.showErrorMessage(
        `Cannot perform '${action}' because no S4TK config could be located. Please report this problem.`,
        MessageButton.ReportProblem,
      ).then(handleMessageButtonClick);
      return;
    }

    const openConfigDocument = editor?.document ?? findOpenDocument(configUri);
    if (openConfigDocument)
      await this.trySaveDocumentAndReload(openConfigDocument);

    if (!this._activeConfig) {
      vscode.window.showErrorMessage(
        `Your S4TK config file was automatically saved before performing '${action}', and these changes have made it invalid. You must fix your config file and reload it before trying '${action}' again.`,
        MessageButton.ReloadConfig,
      ).then(handleMessageButtonClick);
      return undefined;
    }

    S4TKConfig.modify(this._activeConfig, (config) => fn(config, configUri));
    const newContent = S4TKConfig.stringify(this._activeConfig);
    if (!(editor && await replaceEntireDocument(editor, newContent, true)))
      vscode.workspace.fs.writeFile(configUri, Buffer.from(newContent));
  }

  //#endregion
}

/**
 * Manages the state of the S4TK workspace, including the config.
 */
const S4TKWorkspace = new _S4TKWorkspace();
export default S4TKWorkspace;
