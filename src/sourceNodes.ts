import { ParentSpanPluginArgs, SourceNodesArgs } from "gatsby";
import { sourceAllNodes } from "gatsby-graphql-source-toolkit";
import { GraphCMS_Asset, PluginOptions } from "./types";
import { createSourcingConfig, stateCache } from "./utils";

function keepAssetsAlive(
  gatsbyApi: ParentSpanPluginArgs,
  options: PluginOptions
) {
  const {
    getNode,
    getNodesByType,
    reporter,
    actions: { touchNode },
  } = gatsbyApi;
  const { typePrefix } = options;

  const nodes = getNodesByType(`${typePrefix}Asset`) as GraphCMS_Asset[];
  reporter.info(`Keeping alive ${nodes.length} Assets`);
  nodes.forEach((node) => {
    for (const id of node.children) {
      const child = getNode(id);
      touchNode(child);
    }
  });
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
  keepAssetsAlive(gatsbyApi, pluginOptions);
  const config = await createSourcingConfig(
    schemaConfig,
    gatsbyApi,
    pluginOptions
  );
  await sourceAllNodes(config);
}
