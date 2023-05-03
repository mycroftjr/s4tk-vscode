import { ExtensionContext } from "vscode";
import registerCommands from "@commands/index";
import registerCodeLensProviders from "@codelens/index";
import registerCustomEditors from "@editors/index";
import S4TKWorkspace from "@workspace/s4tk-workspace";

export function activate(context: ExtensionContext) {
	registerCommands(context);
	registerCodeLensProviders(context);
	registerCustomEditors(context);

	S4TKWorkspace.loadConfig().then(config => {
		config;
	});
}
