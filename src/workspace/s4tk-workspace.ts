import * as vscode from "vscode";
import { ValidationError } from "jsonschema";
import { S4TKConfig, parseConfig } from "@models/s4tk-config";
import { fileExists } from "@helpers/utils";

const _CONFIG_FILENAME = "s4tk.config.json";

class _S4TKWorkspace {
  private _config?: S4TKConfig;
  get config() { return this._config; }

  constructor() { }

  /**
   * Loads the config (located at `~/s4tk.config.json`), saves it to the
   * workspace, and returns it. If it could not be loaded, and error is
   * displayed and undefined is returned.
   * 
   * @param options Options for error handling
   */
  async loadConfig(options?: { showNoConfigError?: boolean; }): Promise<S4TKConfig | undefined> {
    delete this._config;

    const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!rootUri) return undefined;

    const configUri = vscode.Uri.joinPath(rootUri, _CONFIG_FILENAME);
    if (!(await fileExists(configUri))) {
      if (options?.showNoConfigError) {
        vscode.window.showWarningMessage("No S4TK config file was found. Note that it must be called 's4tk.config.json', and must be placed in the root directory of your project.");
      }

      return undefined;
    }

    try {
      const content = await vscode.workspace.fs.readFile(configUri);
      const config = parseConfig(content.toString());
      vscode.window.showInformationMessage('Successfully initialized S4TK workspace.');
      return this._config = config;
    } catch (err: any) {
      let errMsg = err;
      if (err instanceof SyntaxError) {
        errMsg = err.message;
      } else if (err instanceof ValidationError) {
        errMsg = err.stack;
      }

      const getHelp = 'Get Help';
      const reload = 'Reload Config';
      vscode.window.showErrorMessage(
        `Could not validate S4TK config. You will not be able to build your project until all errors are resolved and the config has been reloaded. (${errMsg})`,
        getHelp,
        reload
      ).then((message) => {
        if (message === getHelp)
          vscode.env.openExternal(vscode.Uri.parse('https://frankkmods.com/#/contact'));
        else if (message === reload)
          this.loadConfig({ showNoConfigError: true });
      });

      return undefined;
    }
  }
}

const S4TKWorkspace = new _S4TKWorkspace();
export default S4TKWorkspace;
