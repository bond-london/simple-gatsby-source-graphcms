import { CreateResolversArgs } from "gatsby";
import { GraphCMS_Node, PluginOptions } from "./types";
import {
  GatsbyGraphQLResolveInfo,
  IGatsbyResolverContext,
} from "gatsby/dist/schema";

export function createResolvers(
  args: CreateResolversArgs,
  pluginOptions: PluginOptions
): void {
  const {
    createResolvers: toolkitCreateResolvers,
    getNodeAndSavePathDependency,
  } = args;
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
              const child = getNodeAndSavePathDependency(id, context.path);
              if (child.internal.type === "File") {
                return child;
              }
            }
          }
        },
      },
    },
  };
  toolkitCreateResolvers(resolvers);
}
