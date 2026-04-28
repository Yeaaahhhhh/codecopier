// File: src/types.ts
export interface FileNode {
  id: string;
  name: string;
  path: string;
  is_dir: boolean;
  children: FileNode[];
  size: number | null;
}

export interface FlatRow {
  node: FileNode;
  depth: number;
}

export interface ScanOptions {
  skip_heavy_dirs: boolean;
  include_hidden: boolean;
}

export interface ScanResult {
  root: FileNode;
  file_count: number;
  dir_count: number;
  skipped_count: number;
  elapsed_ms: number;
}

export interface CopyResult {
  path: string;
  bytes: number;
  chars: number;
}

export interface FolderCopyResult {
  path: string;
  files: number;
  skipped: number;
  bytes: number;
  chars: number;
}