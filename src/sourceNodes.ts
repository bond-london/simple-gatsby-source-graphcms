import { extname, basename } from "path";
import { NodeInput, SourceNodesArgs } from "gatsby";
import {
  createSourcingContext,
  fetchAllNodes,
} from "gatsby-graphql-source-toolkit";
import {
  IRemoteNode,
  ISourcingContext,
} from "gatsby-graphql-source-toolkit/dist/types";
import { PluginOptions } from "./types";
import { createSourcingConfig, stateCache } from "./utils";
import { createRemoteFileNode } from "gatsby-source-filesystem";

interface IGraphCmsAsset extends IRemoteNode {
  mimeType: string;
  url: string;
  fileName: string;
  height?: number;
  width?: number;
  size: number;
}

async function downloadAsset(
  context: ISourcingContext,
  remoteAsset: IGraphCmsAsset
) {
  const { gatsbyApi } = context;
  const { actions, reporter, createNodeId, getCache, store } = gatsbyApi;
  const { createNode } = actions;
  const url = remoteAsset.url;
  const fileName = remoteAsset.fileName.replace(/[/\\?%*:|"<>]/g, "-");
  if (fileName !== remoteAsset.fileName) {
    reporter.warn(
      `Renaming remote filename "${remoteAsset.fileName}" to "${fileName}"`
    );
  }
  const ext = fileName && extname(fileName);
  const name = fileName && basename(fileName, ext);

  const fileNode = await createRemoteFileNode({
    url,
    createNode,
    createNodeId,
    getCache,
    cache: undefined,
    store,
    reporter,
    name,
    ext,
  } as any);
  return fileNode.id;
}

async function distributeWorkload(workers: Promise<void>[], count: number) {
  const methods = workers.slice();

  async function task() {
    while (methods.length > 0) {
      const promise = methods.pop();
      if (promise) {
        await promise;
      }
    }
  }

  await Promise.all(new Array(count).fill(undefined).map(() => task()));
}

async function processDownloadableAssets(
  pluginOptions: PluginOptions,
  context: ISourcingContext,
  remoteNodes: AsyncIterable<IRemoteNode>
) {
  const { concurrentDownloads } = pluginOptions;
  const queue: Promise<void>[] = [];

  for await (const remoteNode of remoteNodes) {
    const promise = createOrTouchAsset(pluginOptions, context, remoteNode);
    queue.push(promise);
  }
  await distributeWorkload(queue, concurrentDownloads);
}

async function createOrTouchAsset(
  pluginOptions: PluginOptions,
  context: ISourcingContext,
  remoteNode: IRemoteNode
) {
  const { typePrefix } = pluginOptions;
  const { gatsbyApi } = context;
  const { actions, createContentDigest, getNode, reporter } = gatsbyApi;
  const { touchNode, createNode } = actions;

  const def = context.gatsbyNodeDefs.get("Asset");
  if (!def) {
    throw new Error(`Cannot get definition for Asset`);
  }
  const contentDigest = createContentDigest(remoteNode);
  const id = context.idTransform.remoteNodeToGatsbyId(remoteNode, def);
  const existingNode = getNode(id);
  if (existingNode) {
    if (contentDigest === existingNode.internal.contentDigest) {
      const localFileId = existingNode.localFile as string;
      if (localFileId) {
        const existingLocalFile = getNode(localFileId);
        if (existingLocalFile) {
          touchNode(existingLocalFile);
          touchNode(existingNode);
          return;
        }
      }
    }
  }

  const node: NodeInput = {
    ...remoteNode,
    id,
    parent: undefined,
    internal: {
      contentDigest,
      type: context.typeNameTransform.toGatsbyTypeName("Asset"),
    },
  };

  const asset = remoteNode as IGraphCmsAsset;
  try {
    const localFileId = await downloadAsset(context, asset);
    node.localFile = localFileId;
  } catch (error) {
    reporter.warn(
      `Failed to process asset ${asset.url} (${asset.fileName}): ${
        (error as Error).message || ""
      }`
    );
  }

  createNode(node);
}

async function processNodesOfType(
  pluginOptions: PluginOptions,
  context: ISourcingContext,
  remoteTypeName: string,
  remoteNodes: AsyncIterable<IRemoteNode>
) {
  for await (const remoteNode of remoteNodes) {
    await createOrTouchNode(pluginOptions, context, remoteTypeName, remoteNode);
  }
}

interface RichTextField {
  markdown?: string;
  remoteTypeName: string;
  markdownNode?: string;
}

async function createOrTouchNode(
  pluginOptions: PluginOptions,
  context: ISourcingContext,
  remoteTypeName: string,
  remoteNode: IRemoteNode
) {
  const { downloadAllAssets, typePrefix, markdownFields, buildMarkdownNodes } =
    pluginOptions;
  const { gatsbyApi } = context;
  const { actions, createContentDigest, getNode, reporter } = gatsbyApi;
  const { touchNode, createNode } = actions;

  const thisMarkdownFields = markdownFields[remoteTypeName];

  const isDownloadable = downloadAllAssets && remoteTypeName === "Asset";
  const def = context.gatsbyNodeDefs.get(remoteTypeName);
  if (!def) {
    throw new Error(`Cannot get definition for ${remoteTypeName}`);
  }
  const contentDigest = createContentDigest(remoteNode);
  const id = context.idTransform.remoteNodeToGatsbyId(remoteNode, def);
  const existingNode = getNode(id);
  if (existingNode) {
    if (contentDigest === existingNode.internal.contentDigest) {
      if (isDownloadable) {
        const localFileId = existingNode.localFile as string;
        if (localFileId) {
          const existingLocalFile = getNode(localFileId);
          if (existingLocalFile) {
            touchNode(existingLocalFile);
            touchNode(existingNode);
            return id;
          }
        }
      } else {
        touchNode(existingNode);
        thisMarkdownFields?.forEach((field) => {
          const markdownNodeField = `${field}MarkdownNode`;
          const markdownNodeId = existingNode[markdownNodeField] as string;
          if (markdownNodeId) {
            const markdownNode = getNode(markdownNodeId);
            if (markdownNode) {
              touchNode(markdownNode);
            }
          }
        });

        if (buildMarkdownNodes) {
          Object.entries(existingNode)
            .filter(
              ([, value]) =>
                (value as RichTextField)?.remoteTypeName === "RichText"
            )
            .forEach(([key, value]) => {
              const field = value as RichTextField;
              const markdownNodeId = field.markdownNode;
              if (markdownNodeId) {
                const markdownNode = getNode(markdownNodeId);
                if (markdownNode) {
                  touchNode(markdownNode);
                }
              }
            });
        }
        return id;
      }
    }
  }

  let addedField = false;

  const node: NodeInput = {
    ...remoteNode,
    id,
    parent: undefined,
    internal: {
      contentDigest,
      type: context.typeNameTransform.toGatsbyTypeName(remoteTypeName),
    },
  };

  thisMarkdownFields?.forEach((field) => {
    const content = node[field] as string;
    if (content) {
      const markdownNode = {
        id: `${field}MarkdownNode:${id}`,
        parent: node.id,
        internal: {
          type: `${typePrefix}MarkdownNode`,
          mediaType: "text/markdown",
          content,
          contentDigest: createContentDigest(content),
        },
      };
      createNode(markdownNode);
      node[`${field}MarkdownNode`] = markdownNode.id;
      addedField = true;
      console.log(markdownNode);
    }
  });

  if (buildMarkdownNodes) {
    Object.entries(node)
      .filter(
        ([, value]) => (value as RichTextField)?.remoteTypeName === "RichText"
      )
      .forEach(([key, value]) => {
        const field = value as RichTextField;

        const content = field.markdown;
        if (content) {
          const markdownNode = {
            id: `${key}MarkdownNode:${id}`,
            parent: node.id,
            internal: {
              type: `${typePrefix}MarkdownNode`,
              mediaType: "text/markdown",
              content,
              contentDigest: createContentDigest(content),
            },
          };
          createNode(markdownNode);
          field.markdownNode = markdownNode.id;
          addedField = true;
        }
      });
  }

  if (isDownloadable) {
    const asset = remoteNode as IGraphCmsAsset;
    try {
      const localFileId = await downloadAsset(context, asset);
      node.localFile = localFileId;
    } catch (error) {
      reporter.warn(
        `Failed to process asset ${asset.url} (${asset.fileName}): ${
          (error as Error).message || ""
        }`
      );
    }
  }

  createNode(node);

  if (addedField) {
    console.log(node);
  }
  return id;
}

export async function sourceNodes(
  gatsbyApi: SourceNodesArgs,
  pluginOptions: PluginOptions
) {
  const { downloadAllAssets } = pluginOptions;
  const { reporter } = gatsbyApi;
  const schemaConfig = stateCache.schemaInformation;
  if (!schemaConfig) {
    return reporter.panic("No schema configuration");
  }
  const config = await createSourcingConfig(
    schemaConfig,
    gatsbyApi,
    pluginOptions
  );
  const context = createSourcingContext(config);

  const promises: Promise<void>[] = [];

  for (const remoteTypeName of context.gatsbyNodeDefs.keys()) {
    const remoteNodes = fetchAllNodes(context, remoteTypeName);
    if (remoteTypeName === "Asset" && downloadAllAssets) {
      const promise = processDownloadableAssets(
        pluginOptions,
        context,
        remoteNodes
      );
      promises.push(promise);
    } else {
      const promise = processNodesOfType(
        pluginOptions,
        context,
        remoteTypeName,
        remoteNodes
      );
      promises.push(promise);
    }
  }
  await Promise.all(promises);
}
