import { ObjectSchema } from "gatsby-plugin-utils";
import { CreateNodeArgs, CreateResolversArgs, CreateSchemaCustomizationArgs, Node, PluginOptions, PluginOptionsSchemaArgs, SourceNodesArgs } from "gatsby";
export declare function pluginOptionsSchema(args: PluginOptionsSchemaArgs): ObjectSchema;
interface RealPluginOptions extends PluginOptions {
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
export declare function createResolvers(args: CreateResolversArgs, pluginOptions: RealPluginOptions): void;
export declare function sourceNodes(gatsbyApi: SourceNodesArgs, pluginOptions: RealPluginOptions): Promise<void>;
declare type GraphCMS_Node = Node & {
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
export declare function onCreateNode(args: CreateNodeArgs<GraphCMS_Node>, pluginOptions: RealPluginOptions): Promise<void>;
export declare function createSchemaCustomization(gatsbyApi: CreateSchemaCustomizationArgs, pluginOptions: RealPluginOptions): Promise<void>;
export {};
