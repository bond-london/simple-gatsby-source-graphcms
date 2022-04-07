import { extname, basename } from "path";
import { NodeInput, SourceNodesArgs, NodePluginArgs } from "gatsby";
import {
  createSourcingContext,
  fetchAllNodes,
} from "gatsby-graphql-source-toolkit";
import {
  IRemoteId,
  IRemoteNode,
  ISourcingContext,
} from "gatsby-graphql-source-toolkit/dist/types";
import {
  BasicFieldType,
  GraphCMS_Node,
  IGraphCmsAsset,
  isSpecialField,
  isSpecialObject,
  isSpecialUnion,
  PluginOptions,
  SpecialFieldEntry,
} from "./types";
import { createSourcingConfig, stateCache } from "./utils";
import { createRemoteFileNode } from "gatsby-source-filesystem";
import { Sema } from "async-sema";
import { ElementNode, RichTextContent } from "@graphcms/rich-text-types";
import { cleanupRTFContent } from "./rtf";
import { createLocalFileNode, getLocalFileName } from "./cacheGraphCmsAsset";

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
  const fileName = getLocalFileName(remoteAsset, reporter);
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
  reporter.verbose(
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
          pluginOptions,
          remoteNode,
          usedAssetRemoteIds
        );
      } finally {
        s.release();
      }
    })
  );
}

async function createOrTouchAsset(
  context: ISourcingContext,
  pluginOptions: PluginOptions,
  remoteNode: IRemoteNode,
  usedAssetRemoteIds: Set<string>
) {
  const { skipUnusedAssets, dontDownload, localCache } = pluginOptions;
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
      const localFileId = await (localCache
        ? createLocalFileNode(context, asset, reason, pluginOptions)
        : downloadAsset(context, asset, reason));
      node.localFile = localFileId;
    } catch (error) {
      reporter.panic(
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
  specialFields: SpecialFieldEntry[] | undefined,
  usedAssetRemoteIds: Set<string>
) {
  const typeName = context.typeNameTransform.toGatsbyTypeName(remoteTypeName);
  const existing = context.gatsbyApi.getNodesByType(typeName);
  const existingSet = new Set(existing.map((e) => e.id));
  let existingNodes = 0;
  let newNodes = 0;
  for await (const remoteNode of remoteNodes) {
    const newId = createOrTouchNode(
      pluginOptions,
      context,
      remoteTypeName,
      remoteNode,
      specialFields,
      usedAssetRemoteIds
    );

    if (existingSet.delete(newId)) {
      existingNodes++;
    } else {
      newNodes++;
    }
  }
  let oldNodes = existingSet.size;
  let deletedNodes = 0;
  if (oldNodes) {
    existingSet.forEach((id) => {
      const oldNode = existing.find((n) => n.id === id);
      if (oldNode) {
        context.gatsbyApi.actions.deleteNode(oldNode);
        deletedNodes++;
      }
    });
  }
  context.gatsbyApi.reporter.verbose(
    `Processed ${newNodes} new, ${existingNodes} existing and ${oldNodes} old nodes for ${remoteTypeName}. Deleted ${deletedNodes}.`
  );
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

function keepExistingNodeAlive(
  pluginOptions: PluginOptions,
  context: ISourcingContext,
  remoteTypeName: string,
  specialFields: SpecialFieldEntry[] | undefined,
  usedAssetRemoteIds: Set<string>,
  existingNode: BasicFieldType,
  namePrefix: string
) {
  const { typePrefix, buildMarkdownNodes, cleanupRtf } = pluginOptions;
  const { gatsbyApi } = context;
  const { actions, createContentDigest, getNode, reporter } = gatsbyApi;
  const { touchNode, createNode } = actions;

  specialFields?.forEach((entry) => {
    const name = entry.fieldName;
    const value = existingNode[name];
    if (!value) return;
    const fullName = namePrefix + name;

    if (isSpecialField(entry)) {
      const field = entry.field;
      switch (entry.type) {
        case "Asset":
          usedAssetRemoteIds.add((value as GraphCMS_Node).remoteId);
          break;

        case "Markdown": {
          const markdownNodeFieldName = `${field}MarkdownNode`;
          const markdownNodeId = existingNode[markdownNodeFieldName] as string;
          if (markdownNodeId) {
            const markdownNode = getNode(markdownNodeId);
            if (markdownNode) {
              touchNode(markdownNode);
            } else {
              reporter.warn(`Failed to find markdown node ${markdownNodeId}`);
            }
          } else {
            reporter.warn(`No markdown node for ${field}`);
          }
        }
        case "RichText": {
          const processField = (field: RichTextField) => {
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
          };
          if (Array.isArray(value)) {
            value.forEach((field) => processField(field as RichTextField));
          } else {
            processField(value as RichTextField);
          }
        }
      }
    } else if (isSpecialUnion(entry)) {
      const process = (value: any) => {
        entry.value.forEach((fields) => {
          keepExistingNodeAlive(
            pluginOptions,
            context,
            remoteTypeName,
            fields,
            usedAssetRemoteIds,
            value as BasicFieldType,
            fullName
          );
        });
      };
      if (Array.isArray(value)) {
        value.forEach(process);
      } else {
        process(value);
      }
    } else if (isSpecialObject(entry)) {
      const process = (value: any) => {
        keepExistingNodeAlive(
          pluginOptions,
          context,
          remoteTypeName,
          entry.value,
          usedAssetRemoteIds,
          value as BasicFieldType,
          fullName
        );
      };
      if (Array.isArray(value)) {
        value.forEach(process);
      } else {
        process(value);
      }
    }
  });
}

function processRichTextField(
  field: RichTextField,
  fieldName: string,
  parentId: string,
  usedAssetRemoteIds: Set<string>,
  { cleanupRtf, buildMarkdownNodes, typePrefix }: PluginOptions,
  { actions: { createNode }, createContentDigest }: NodePluginArgs
) {
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
        id: `${fieldName}MarkdownNode:${parentId}`,
        parent: parentId,
        internal: {
          type: `${typePrefix}MarkdownNode`,
          mediaType: "text/markdown",
          content,
          contentDigest: createContentDigest(content),
        },
      };
      createNode(markdownNode);
      field.markdownNode = markdownNode.id;
    }
  }
}

function createSpecialNodes(
  pluginOptions: PluginOptions,
  context: ISourcingContext,
  remoteTypeName: string,
  specialFields: SpecialFieldEntry[] | undefined,
  usedAssetRemoteIds: Set<string>,
  id: string,
  node: BasicFieldType,
  namePrefix: string
) {
  const { typePrefix, buildMarkdownNodes, cleanupRtf } = pluginOptions;
  const { gatsbyApi } = context;
  const { actions, createContentDigest, getNode, reporter } = gatsbyApi;
  const { touchNode, createNode } = actions;

  specialFields?.forEach((entry) => {
    const name = entry.fieldName;
    const fullName = namePrefix + name;
    const value = node[name];
    if (!value) return;

    if (isSpecialField(entry)) {
      const field = entry.field;
      switch (entry.type) {
        case "Asset":
          {
            const remoteId = (value as GraphCMS_Node).remoteId;
            usedAssetRemoteIds.add(remoteId);
          }
          break;

        case "Markdown": {
          const content = value as string;
          if (content) {
            const markdownNode = {
              id: `${fullName}MarkdownNode:${id}`,
              parent: id,
              internal: {
                type: `${typePrefix}MarkdownNode`,
                mediaType: "text/markdown",
                content,
                contentDigest: createContentDigest(content),
              },
            };
            createNode(markdownNode);
            node[`${name}MarkdownNode`] = markdownNode.id;
          }
        }
        case "RichText": {
          if (value) {
            if (Array.isArray(value)) {
              value.forEach((field) =>
                processRichTextField(
                  field as RichTextField,
                  fullName,
                  id,
                  usedAssetRemoteIds,
                  pluginOptions,
                  gatsbyApi
                )
              );
            } else {
              processRichTextField(
                value as RichTextField,
                fullName,
                id,
                usedAssetRemoteIds,
                pluginOptions,
                gatsbyApi
              );
            }
          }
        }
      }
    } else if (isSpecialUnion(entry)) {
      const process = (value: any) => {
        entry.value.forEach((fields, key) => {
          createSpecialNodes(
            pluginOptions,
            context,
            remoteTypeName,
            fields,
            usedAssetRemoteIds,
            id,
            value as BasicFieldType,
            fullName
          );
        });
      };
      if (Array.isArray(value)) {
        value.forEach(process);
      } else {
        process(value);
      }
    } else if (isSpecialObject(entry)) {
      const process = (value: any) => {
        createSpecialNodes(
          pluginOptions,
          context,
          remoteTypeName,
          entry.value,
          usedAssetRemoteIds,
          id,
          value as BasicFieldType,
          fullName
        );
      };
      if (Array.isArray(value)) {
        value.forEach(process);
      } else {
        process(value);
      }
    }
  });
}

function createOrTouchNode(
  pluginOptions: PluginOptions,
  context: ISourcingContext,
  remoteTypeName: string,
  remoteNode: IRemoteNode,
  specialFields: SpecialFieldEntry[] | undefined,
  usedAssetRemoteIds: Set<string>
) {
  const { typePrefix, buildMarkdownNodes, cleanupRtf } = pluginOptions;
  const { gatsbyApi } = context;
  const { actions, createContentDigest, getNode, reporter } = gatsbyApi;
  const { touchNode, createNode } = actions;

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
      keepExistingNodeAlive(
        pluginOptions,
        context,
        remoteTypeName,
        specialFields,
        usedAssetRemoteIds,
        existingNode,
        ""
      );
      return id;
    }
  }

  const node: NodeInput = {
    ...remoteNode,
    id,
    parent: undefined,
    internal: {
      contentDigest,
      type: context.typeNameTransform.toGatsbyTypeName(remoteTypeName),
    },
  };

  createSpecialNodes(
    pluginOptions,
    context,
    remoteTypeName,
    specialFields,
    usedAssetRemoteIds,
    id,
    node,
    ""
  );

  createNode(node);

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

  const specialFields = stateCache.specialFields;
  if (!specialFields) {
    return reporter.panic("Special fields not initialised");
  }
  const usedAssetRemoteIds = new Set<string>();

  for (const remoteTypeName of context.gatsbyNodeDefs.keys()) {
    reporter.verbose(`Processing nodes of type ${remoteTypeName}`);
    if (remoteTypeName !== "Asset") {
      const remoteNodes = fetchAllNodes(context, remoteTypeName);

      const promise = processNodesOfType(
        pluginOptions,
        context,
        remoteTypeName,
        remoteNodes,
        specialFields.get(remoteTypeName),
        usedAssetRemoteIds
      );
      promises.push(promise);
    }
  }
  await Promise.all(promises);

  const remoteAssets = fetchAllNodes(context, "Asset");
  await processDownloadableAssets(
    pluginOptions,
    context,
    remoteAssets,
    usedAssetRemoteIds
  );
}
