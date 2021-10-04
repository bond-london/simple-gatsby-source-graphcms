import { Node, ParentSpanPluginArgs, SourceNodesArgs } from "gatsby";
import { sourceAllNodes } from "gatsby-graphql-source-toolkit";
import { GraphCMS_FileLink, PluginOptions } from "./types";
import { createSourcingConfig, stateCache } from "./utils";

function keepNodesAlive<T extends Node>(
  gatsbyApi: ParentSpanPluginArgs,
  nodeType: string,
  handler?: (node: T) => void
) {
  const {
    getNodesByType,
    reporter,
    actions: { touchNode },
  } = gatsbyApi;
  const nodes = getNodesByType(nodeType) as T[];
  reporter.info(`Keeping alive ${nodes.length} nodes of type ${nodeType}`);
  nodes.forEach((node) => {
    touchNode(node);
    handler?.(node);
  });
}

function keepAssetsAlive(
  gatsbyApi: ParentSpanPluginArgs,
  options: PluginOptions
) {
  const {
    getNode,
    reporter,
    actions: { touchNode },
  } = gatsbyApi;
  const { typePrefix } = options;

  keepNodesAlive(gatsbyApi, `${typePrefix}Asset`);
  keepNodesAlive<GraphCMS_FileLink>(
    gatsbyApi,
    `${typePrefix}FileLink`,
    (fl) => {
      const fileNode = getNode(fl.downloadedAsset);
      if (!fileNode) {
        reporter.warn(`No file node of id ${fl.downloadedAsset}`);
      } else {
        touchNode(fileNode);
      }
    }
  );
}

export async function sourceNodes(
  gatsbyApi: SourceNodesArgs,
  pluginOptions: PluginOptions
) {
  const { reporter } = gatsbyApi;
  const schemaConfig = stateCache.schemaInformation;
  if (!schemaConfig) {
    reporter.panic("No schema configuration");
  }
  const config = await createSourcingConfig(
    schemaConfig,
    gatsbyApi,
    pluginOptions
  );
  await sourceAllNodes(config);
  keepAssetsAlive(gatsbyApi, pluginOptions);
}
