import { Node } from "gatsby";
import { IGatsbyNodeConfig } from "gatsby-graphql-source-toolkit/dist/types";
import { GraphQLSchema } from "graphql";

export interface PluginOptions {
  buildMarkdownNodes: boolean;
  downloadLocalImages: boolean;
  downloadAllAssets: boolean;
  endpoint: string;
  fragmentsPath: string;
  stages: string[];
  token: string;
  typePrefix: string;
  locales: string[];
  maxImageWidth: number;
  skipUnusedAssets: boolean;
  concurrency: number;
}

export interface ISchemaInformation {
  schema: GraphQLSchema;
  gatsbyNodeTypes: IGatsbyNodeConfig[];
}

export interface PluginState {
  schemaInformation?: ISchemaInformation;
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
