import { Node } from "gatsby";
import { IGatsbyNodeConfig } from "gatsby-graphql-source-toolkit/dist/types";
import { GraphQLSchema, GraphQLField } from "graphql";

export interface PluginOptions {
  buildMarkdownNodes: boolean;
  downloadAllAssets: boolean;
  skipUnusedAssets: boolean;
  endpoint: string;
  fragmentsPath: string;
  stages: string[];
  token: string;
  typePrefix: string;
  locales: string[];
  concurrency: number;
  concurrentDownloads: number;
  markdownFields: { [key: string]: string[] };
  cleanupRtf: boolean;
  dontDownload: boolean;
}

export interface ISchemaInformation {
  schema: GraphQLSchema;
  gatsbyNodeTypes: IGatsbyNodeConfig[];
}

export interface PluginState {
  schemaInformation?: ISchemaInformation;
  richTextMap?: Map<string, GraphQLField<any, any>[]>;
}

export type GraphCMS_Node = Node & {
  remoteTypeName?: string;
  remoteId?: string;
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
