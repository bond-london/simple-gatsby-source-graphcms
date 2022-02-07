import { extname, basename } from "path";
import { NodeInput, SourceNodesArgs } from "gatsby";
import { GraphQLField } from "graphql";
import {
  createSourcingContext,
  fetchAllNodes,
} from "gatsby-graphql-source-toolkit";
import {
  IRemoteId,
  IRemoteNode,
  ISourcingContext,
} from "gatsby-graphql-source-toolkit/dist/types";
import { PluginOptions } from "./types";
import { createSourcingConfig, stateCache } from "./utils";
import { createRemoteFileNode } from "gatsby-source-filesystem";
import { Sema } from "async-sema";
import { ElementNode, RichTextContent } from "@graphcms/rich-text-types";
import { cleanupRTFContent } from "./rtf";

interface IGraphCmsAsset extends IRemoteNode {
  mimeType: string;
  url: string;
  fileName: string;
  height?: number;
  width?: number;
  size: number;
}

function isAssetUsed(node: IGraphCmsAsset, usedAssetRemoteIds: Set<string>) {
  const fields = Object.entries(node);
  const remoteId = node.remoteId as string;
  if (!remoteId) return false;
  if (usedAssetRemoteIds.has(remoteId)) {
    return true;
  }
  for (const [key, value] of fields) {
    if (Array.isArray(value)) {
      for (const entry of value as IGraphCmsAsset[]) {
        if (entry.remoteId) {
          return true;
        }
      }
    }
  }
  return false;
}

async function downloadAsset(
  context: ISourcingContext,
  remoteAsset: IGraphCmsAsset,
  reason: string
) {
  const { gatsbyApi } = context;
  const { actions, reporter, createNodeId, getCache, store } = gatsbyApi;
  const { createNode } = actions;
  const url = remoteAsset.url;
  const fileName = remoteAsset.fileName.replace(/[/\\?%*:|"<>]/g, "-");
  reporter.info(`Downloading asset ${fileName} from ${url} (${reason})`);
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
  reporter.info(
    `Downloaded asset ${fileName} from ${url} with id ${fileNode.id}`
  );
  return fileNode.id;
}

async function processDownloadableAssets(
  pluginOptions: PluginOptions,
  context: ISourcingContext,
  remoteNodes: AsyncIterable<IRemoteNode>,
  usedAssetRemoteIds: Set<string>
) {
  const { concurrentDownloads, skipUnusedAssets, dontDownload } = pluginOptions;
  const allRemoteNodes: IRemoteNode[] = [];

  for await (const remoteNode of remoteNodes) {
    allRemoteNodes.push(remoteNode);
  }

  const s = new Sema(concurrentDownloads);
  await Promise.all(
    allRemoteNodes.map(async (remoteNode) => {
      await s.acquire();
      try {
        await createOrTouchAsset(
          context,
          skipUnusedAssets,
          remoteNode,
          usedAssetRemoteIds,
          dontDownload
        );
      } finally {
        s.release();
      }
    })
  );
}

async function createOrTouchAsset(
  context: ISourcingContext,
  skipUnusedAssets: boolean,
  remoteNode: IRemoteNode,
  usedAssetRemoteIds: Set<string>,
  dontDownload: boolean
) {
  const { gatsbyApi } = context;
  const { actions, createContentDigest, getNode, reporter } = gatsbyApi;
  const { touchNode, createNode } = actions;

  const def = context.gatsbyNodeDefs.get("Asset");
  if (!def) {
    throw new Error(`Cannot get definition for Asset`);
  }
  let reason: string | undefined;
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
        } else {
          reason = "Local file does not exist";
        }
      } else {
        reason = "No local file";
      }
    } else {
      reason = "Content digetst differs";
    }
  } else {
    reason = "No existing node";
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
  const shouldDownload =
    !dontDownload &&
    (!skipUnusedAssets || isAssetUsed(asset, usedAssetRemoteIds));
  if (shouldDownload) {
    try {
      const localFileId = await downloadAsset(context, asset, reason);
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
}

async function processNodesOfType(
  pluginOptions: PluginOptions,
  context: ISourcingContext,
  remoteTypeName: string,
  remoteNodes: AsyncIterable<IRemoteNode>,
  richTextMap: Map<string, GraphQLField<any, any>[]>,
  usedAssetRemoteIds: Set<string>
) {
  for await (const remoteNode of remoteNodes) {
    await createOrTouchNode(
      pluginOptions,
      context,
      remoteTypeName,
      remoteNode,
      richTextMap,
      usedAssetRemoteIds
    );
  }
}

interface RichTextField {
  markdown?: string;
  remoteTypeName: string;
  markdownNode?: string;
  references: IRemoteId[];
  cleaned?: Array<ElementNode>;
  raw?: RichTextContent;
  json?: RichTextContent;
}

function addAssetReferences(
  field: RichTextField,
  usedAssetRemoteIds: Set<string>
) {
  if (field.references?.length) {
    field.references.forEach((fieldRef) => {
      const remoteTypeName = fieldRef.remoteTypeName;
      if (remoteTypeName === "Asset") {
        usedAssetRemoteIds.add(fieldRef.remoteId as string);
      }
    });
  }
}

async function createOrTouchNode(
  pluginOptions: PluginOptions,
  context: ISourcingContext,
  remoteTypeName: string,
  remoteNode: IRemoteNode,
  richTextMap: Map<string, GraphQLField<any, any>[]>,
  usedAssetRemoteIds: Set<string>
) {
  const { typePrefix, markdownFields, buildMarkdownNodes, cleanupRtf } =
    pluginOptions;
  const { gatsbyApi } = context;
  const { actions, createContentDigest, getNode, reporter } = gatsbyApi;
  const { touchNode, createNode } = actions;
  const richTextFields = richTextMap.get(remoteTypeName);

  const thisMarkdownFields = markdownFields[remoteTypeName];

  const def = context.gatsbyNodeDefs.get(remoteTypeName);
  if (!def) {
    throw new Error(`Cannot get definition for ${remoteTypeName}`);
  }
  const contentDigest = createContentDigest(remoteNode);
  const id = context.idTransform.remoteNodeToGatsbyId(remoteNode, def);
  const existingNode = getNode(id);
  if (existingNode) {
    if (contentDigest === existingNode.internal.contentDigest) {
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

      if (richTextFields) {
        richTextFields.forEach((graphqlField) => {
          const value = existingNode[graphqlField.name];
          const field = value as RichTextField;
          if (field) {
            addAssetReferences(field, usedAssetRemoteIds);
            if (buildMarkdownNodes) {
              const markdownNodeId = field.markdownNode;
              if (markdownNodeId) {
                const markdownNode = getNode(markdownNodeId);
                if (markdownNode) {
                  touchNode(markdownNode);
                }
              }
            }
          }
        });
      }
      return id;
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
    }
  });

  if (richTextFields) {
    richTextFields.forEach((graphqlField) => {
      const value = node[graphqlField.name];
      const field = value as RichTextField;
      if (field) {
        addAssetReferences(field, usedAssetRemoteIds);
        if (cleanupRtf) {
          const raw = field.raw || field.json;
          if (raw) {
            field.cleaned = cleanupRTFContent(raw);
          }
        }
        if (buildMarkdownNodes) {
          const content = field.markdown;
          if (content) {
            const markdownNode = {
              id: `${graphqlField.name}MarkdownNode:${id}`,
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
        }
      }
    });
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

  const richTextMap = stateCache.richTextMap!;
  const usedAssetRemoteIds = new Set<string>();

  for (const remoteTypeName of context.gatsbyNodeDefs.keys()) {
    const remoteNodes = fetchAllNodes(context, remoteTypeName);
    if (remoteTypeName !== "Asset") {
      const promise = processNodesOfType(
        pluginOptions,
        context,
        remoteTypeName,
        remoteNodes,
        richTextMap,
        usedAssetRemoteIds
      );
      promises.push(promise);
    }
  }

  const remoteAssets = fetchAllNodes(context, "Asset");
  await processDownloadableAssets(
    pluginOptions,
    context,
    remoteAssets,
    usedAssetRemoteIds
  );
  await Promise.all(promises);
}
