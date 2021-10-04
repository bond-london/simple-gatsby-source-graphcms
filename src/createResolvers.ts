import { CreateResolversArgs, ParentSpanPluginArgs, Reporter } from "gatsby";
import { GraphCMS_FileLink, GraphCMS_Node, PluginOptions } from "./types";
import {
  GatsbyGraphQLResolveInfo,
  IGatsbyResolverContext,
} from "gatsby/dist/schema";

export function createResolvers(
  args: CreateResolversArgs,
  pluginOptions: PluginOptions
): void {
  const { createResolvers: toolkitCreateResolvers } = args;
  const { typePrefix } = pluginOptions;

  const resolvers = {
    [`${typePrefix}Asset`]: {
      localFile: {
        type: "File",
        resolve(
          source: GraphCMS_Node,
          resolveArgs: unknown,
          context: IGatsbyResolverContext<GraphCMS_Node, unknown>,
          info: GatsbyGraphQLResolveInfo
        ) {
          const { path, nodeModel } = context;

          if (source.children?.length) {
            for (const id of source.children) {
              const fileLink = context.nodeModel.getNodeById({
                id,
                type: `${typePrefix}FileLink`,
              }) as GraphCMS_FileLink;
              if (fileLink) {
                const file = context.nodeModel.getNodeById({
                  id: fileLink.downloadedAsset,
                  type: "File",
                });
                return file;
              }
            }
          }
        },
      },
    },
  };
  toolkitCreateResolvers(resolvers);
}
