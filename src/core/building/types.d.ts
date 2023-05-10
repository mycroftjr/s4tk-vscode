export type BuildMode = "build" | "dryrun" | "release";

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
    packages: ValidatedPackageInfo[];
    zip?: ValidatedZipInfo;
  };

  written: {
    fileWarnings: WrittenFileInfo[];
    ignoredSourceFiles: string[];
    missingSourceFiles: string[];
    packages: WrittenPackageInfo[];
  };
}

export interface ValidatedPackageInfo extends Warnable {
  filename: string;
  include: ValidatedPath[];
  exclude: ValidatedPath[];
}

export interface ValidatedPath extends Warnable {
  original: string;
  resolved: string;
  ignore?: boolean;
}

export interface ValidatedZipInfo extends Warnable {
  filename: string;
  otherFiles: ValidatedPath[];
}

export interface Warnable {
  warning?: string;
}

export interface WrittenFileInfo {
  file: string;
  warnings: string[];
}

export interface WrittenPackageInfo {
  filename: string;
  resources: WrittenResourceInfo[];
}

export interface WrittenResourceInfo {
  key: string;
  type: string;
}
