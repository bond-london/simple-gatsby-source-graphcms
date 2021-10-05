import { extname, basename } from "path";
import { createRemoteFileNode } from "gatsby-source-filesystem";
import { CreateNodeArgs, ParentSpanPluginArgs, Reporter } from "gatsby";
import { GraphCMS_Asset, GraphCMS_Node, PluginOptions } from "./types";
import { decode } from "he";
import crypto from "crypto";

let shownMarkdownWarning = false;

function createImageUrl(url: string, maxWidth: number, reporter: Reporter) {
  if (!maxWidth) {
    return url;
  }

  const parsed = new URL(url);
  if (parsed.hostname !== "media.graphcms.com") {
    return url;
  }

  const resized = `https://${parsed.hostname}/resize=width:${maxWidth},fit:max${parsed.pathname}`;
  reporter.verbose(`Using ${resized} for ${url}`);
  return resized;
}

function isAssetUsed(node: GraphCMS_Node) {
  const fields = Object.entries(node);
  const remoteId = node.remoteId;
  if (!remoteId) return false;
  for (const [key, value] of fields) {
    if (Array.isArray(value)) {
      for (const entry of value as GraphCMS_Asset[]) {
        if (entry.remoteId) {
          return true;
        }
      }
    }
  }
  return false;
}

async function createImageNodeIfRequired(
  node: GraphCMS_Asset,
  args: ParentSpanPluginArgs,
  options: PluginOptions
) {
  const {
    reporter,
    createNodeId,
    getCache,
    store,
    actions: { createNode },
  } = args;
  const {
    downloadAllAssets,
    downloadLocalImages,
    skipUnusedAssets,
    maxImageWidth,
  } = options;

  const isImage = !!(node.width && node.height);
  const isUsed = isAssetUsed(node);

  if (
    (!skipUnusedAssets || isUsed) &&
    (downloadAllAssets || (downloadLocalImages && isImage))
  ) {
    if (node.size > 10 * 1024 * 1024) {
      reporter.warn(
        `Asset ${node.fileName} ${node.remoteId} is too large: ${node.size}`
      );
    }

    try {
      const realUrl =
        isImage && maxImageWidth && node.width > maxImageWidth
          ? createImageUrl(node.url, maxImageWidth, reporter)
          : node.url;
      const ext = node.fileName && extname(node.fileName);
      const name = node.fileName && basename(node.fileName, ext);
      const fileNode = await createRemoteFileNode({
        url: realUrl,
        createNode,
        createNodeId,
        getCache,
        cache: undefined,
        store,
        reporter,
        name,
        ext,
      } as any);

      return fileNode;
    } catch (e) {
      reporter.warn(`Failed to download image: ${e}`);
    }
  }
}

export async function onCreateNode(
  args: CreateNodeArgs<GraphCMS_Node>,
  pluginOptions: PluginOptions
) {
  const {
    node,
    actions: { createNode, touchNode, createParentChildLink },
    createNodeId,
    reporter,
  } = args;
  const { buildMarkdownNodes, typePrefix } = pluginOptions;

  const doLog = node.remoteId === "cktct75zs2su30c9582xkka6r";

  if (node.remoteTypeName === "Asset") {
    const fileNode = await createImageNodeIfRequired(
      node as GraphCMS_Asset,
      args,
      pluginOptions
    );
    if (doLog) {
      console.log({ fileNode });
    }
    if (fileNode) {
      createParentChildLink({ parent: node, child: fileNode });
    }

    return;
  }

  if (buildMarkdownNodes) {
    const fields = Object.entries(node)
      .map(([key, value]) => ({ key, value }))
      .filter(
        ({ value }) => value && (value as any)?.remoteTypeName === "RichText"
      );

    if (fields.length) {
      fields.forEach((field) => {
        const decodedMarkdown: string = decode((field.value as any).markdown);

        const markdownNode = {
          id: `MarkdownNode:${createNodeId(`${node.id}-${field.key}`)}`,
          parent: node.id,
          internal: {
            type: `${typePrefix}MarkdownNode`,
            mediaType: "text/markdown",
            content: decodedMarkdown,
            contentDigest: crypto
              .createHash(`md5`)
              .update(decodedMarkdown)
              .digest(`hex`),
          },
        };

        createNode(markdownNode);

        (field.value as any).markdownNode = markdownNode.id;
        if (!shownMarkdownWarning) {
          shownMarkdownWarning = true;
          reporter.warn(
            "Mutated node for markdown - not supported in v4 or LMDB_STORE"
          );
        }
      });
    }
  }
}
