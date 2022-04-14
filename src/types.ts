import { Node } from "gatsby";
import {
  IGatsbyNodeConfig,
  IRemoteNode,
} from "gatsby-graphql-source-toolkit/dist/types";
import { GraphQLSchema, GraphQLField } from "graphql";

export interface PluginOptions {
  buildMarkdownNodes: boolean;
  downloadAllAssets: boolean;
  skipUnusedAssets: boolean;
  endpoint: string;
  fragmentsPath?: string;
  stages: string[];
  token: string;
  typePrefix: string;
  locales: string[];
  concurrency: number;
  concurrentDownloads: number;
  markdownFields: { [key: string]: string[] };
  cleanupRtf: boolean;
  dontDownload: boolean;
  localCache: boolean;
  localCacheDir: string;
}

export interface ISchemaInformation {
  schema: GraphQLSchema;
  gatsbyNodeTypes: IGatsbyNodeConfig[];
}

export interface PluginState {
  schemaInformation?: ISchemaInformation;
  specialFields?: SpecialFieldMap;
}

export type GraphCMS_Node = Node & {
  remoteTypeName?: string;
  remoteId: string;
  stage: string;
  locale: string;
};

export type GraphCMS_Asset = GraphCMS_Node & {
  mimeType: string;
  url: string;
  fileName: string;
  height?: number;
  width?: number;
  size: number;
};

export type GraphCMS_FileLink = Node & {
  downloadedAsset: string;
};

export type GraphCMS_Markdown = GraphCMS_Node & {
  markdown?: string;
};

export interface IGraphCmsAsset extends IRemoteNode {
  mimeType: string;
  url: string;
  fileName: string;
  height?: number;
  width?: number;
  size: number;
}

export type BasicFieldType = { [key: string]: unknown };

export type SpecialFieldType = {
  type: "Asset" | "RichText" | "Markdown";
  fieldName: string;
  field: GraphQLField<any, any>;
};

export type SpecialFieldUnion = {
  type: "Union";
  fieldName: string;
  value: SpecialFieldMap;
};

export type SpecialFieldObject = {
  type: "Object";
  fieldName: string;
  value: SpecialFieldEntry[];
};

export type SpecialFieldEntry =
  | SpecialFieldUnion
  | SpecialFieldType
  | SpecialFieldObject;
export type SpecialFieldMap = Map<string, SpecialFieldEntry[]>;

export function isSpecialField(
  type: SpecialFieldEntry
): type is SpecialFieldType {
  return typeof (type as SpecialFieldType).field !== "undefined";
}

export function isSpecialUnion(
  type: SpecialFieldEntry
): type is SpecialFieldUnion {
  return type.type === "Union";
}

export function isSpecialObject(
  type: SpecialFieldEntry
): type is SpecialFieldObject {
  return type.type === "Object";
}
