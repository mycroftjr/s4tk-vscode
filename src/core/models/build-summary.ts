import * as vscode from "vscode";

export type BuildMode = "build" | "dryrun" | "release";

export interface ValidatedPath {
  original: string;
  resolved: string;
  warning?: string;
  ignore?: boolean;
}

export interface BuildPackageInfo {
  filename: string;
  include: ValidatedPath[];
  exclude: ValidatedPath[];
  warning?: string;
}

export interface BuildSummary {
  buildInfo: {
    mode: BuildMode;
    success: boolean;
    problems: number;
    fatalErrorMessage?: string;
  };

  config: {
    source: ValidatedPath;
    destinations: ValidatedPath[];
    packages: BuildPackageInfo[];
    zip?: {
      filename: string;
      otherFiles: ValidatedPath[];
      warning?: string;
    };
  };

  fileWarnings: {
    file: string;
    warnings: string[];
  }[];

  missingSourceFiles: string[];

  writtenPackages: {
    filename: string;
    resources: {
      key: string;
      type: string;
    }[];
  }[];
}

export namespace BuildSummary {
  /**
   * Creates and returns a new BuildSummary for the given mode.
   */
  export function create(mode: BuildMode): BuildSummary {
    const unknownPath = "unknown";

    return {
      buildInfo: {
        mode: mode,
        success: true,
        problems: 0,
      },
      config: {
        source: {
          original: unknownPath,
          resolved: unknownPath,
        },
        destinations: [],
        packages: [],
        zip: mode !== "release" ? undefined : {
          filename: unknownPath,
          otherFiles: [],
        },
      },
      fileWarnings: [],
      missingSourceFiles: [],
      writtenPackages: [],
    };
  }

  /**
   * Returns the URI at which to write the build summary file.
   */
  export function getUri(): vscode.Uri | undefined {
    const rootDir = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!rootDir) return;
    return vscode.Uri.joinPath(rootDir, "BuildSummary.json");
  }
}