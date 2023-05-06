import * as vscode from "vscode";
import { COMMAND } from "#constants";
import { replaceEntireDocument } from "#helpers/fs";
import StringTableJson from "#models/stbl-json";
import S4TKWorkspace from "#workspace/s4tk-workspace";
import { MessageButton, handleMessageButtonClick } from "#workspace/messaging";

export default function registerStblJsonCommands() {
  vscode.commands.registerCommand(COMMAND.stblJson.addEntry,
    async (editor: vscode.TextEditor | undefined, stblJson: StringTableJson) => {
      if (editor) {
        const start = S4TKWorkspace.config?.stringTables.newStringsToStart ?? true;
        stblJson.addEntry({ position: start ? "start" : "end" });
        const content = stblJson.stringify();
        if (await replaceEntireDocument(editor, content)) return;
      }

      vscode.window.showWarningMessage(
        'Something unexpected went wrong while adding an entry to this STBL JSON.',
        MessageButton.ReportProblem,
      ).then(handleMessageButtonClick);
    }
  );

  vscode.commands.registerCommand(COMMAND.stblJson.addMetaData,
    async (editor: vscode.TextEditor | undefined, stblJson: StringTableJson) => {
      if (stblJson.format === "object") return;

      if (editor) {
        stblJson.insertDefaultMetadata();
        const content = stblJson.stringify();
        if (await replaceEntireDocument(editor, content)) return;
      }

      vscode.window.showWarningMessage(
        'Something unexpected went wrong while adding meta data to this STBL JSON.',
        MessageButton.ReportProblem,
      ).then(handleMessageButtonClick);
    }
  );

  vscode.commands.registerCommand(COMMAND.stblJson.copyEntry,
    (stblJson: StringTableJson, entryIndex: number) => {
      const xml = stblJson.getEntryXml(entryIndex);
      vscode.env.clipboard.writeText(xml);
      if (S4TKWorkspace.config?.settings.showCopyConfirmation ?? true)
        vscode.window.showInformationMessage(`Copied: ${xml}`);
    }
  );
}
