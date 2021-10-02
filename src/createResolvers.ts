import { CreateResolversArgs, ParentSpanPluginArgs, Reporter } from "gatsby";
import { AssetReference, GraphCMS_Node, PluginOptions } from "./types";
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
          if (source.children?.length) {
            for (const id of source.children) {
              const file = context.nodeModel.getNodeById({ id, type: "File" });
              if (file) {
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
