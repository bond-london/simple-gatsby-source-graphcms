import { SourceNodesArgs } from "gatsby";
import { sourceAllNodes } from "gatsby-graphql-source-toolkit";
import { PluginOptions } from "./types";
import { createSourcingConfig, stateCache } from "./utils";

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
}
