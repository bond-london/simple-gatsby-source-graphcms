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

export interface AssetReference {
  remoteTypeName: string;
  remoteId: string;
  stage: string;
  locale: string;
}

export type GraphCMS_Node = Node & {
  mimeType: string;
  url: string;
  remoteTypeName?: string;
  remoteId?: string;
  markdown?: string;
  fileName: string;
  height?: number;
  width?: number;
  size: number;
  stage: string;
  locale: string;
};
