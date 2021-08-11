import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  wrapQueryExecutorWithQueue,
  loadSchema,
  readOrGenerateDefaultFragments,
  compileNodeQueries,
  buildNodeDefinitions,
  createSchemaCustomization as createToolkitSchemaCustomization,
  sourceAllNodes,
} from "gatsby-graphql-source-toolkit";
import { createRemoteFileNode } from "gatsby-source-filesystem";
import { decode } from "he";
import fetch from "node-fetch";
import { ObjectSchema } from "gatsby-plugin-utils";
import {
  CreateNodeArgs,
  CreateSchemaCustomizationArgs,
  Node,
  NodePluginArgs,
  ParentSpanPluginArgs,
  PluginOptions,
  PluginOptionsSchemaArgs,
  SourceNodesArgs,
} from "gatsby";
import {
  GraphQLAbstractType,
  GraphQLInterfaceType,
  GraphQLSchema,
} from "graphql";
import {
  IGatsbyNodeConfig,
  IGatsbyNodeDefinition,
  IQueryExecutor,
  ISourcingConfig,
  RemoteTypeName,
} from "gatsby-graphql-source-toolkit/dist/types";

const SchemaConfigCacheKey = "CachedInformation";

export function pluginOptionsSchema(
  args: PluginOptionsSchemaArgs
): ObjectSchema {
  const { Joi } = args;
  return Joi.object({
    buildMarkdownNodes: Joi.boolean()
      .description(
        `Build markdown nodes for all [RichText](https://graphcms.com/docs/reference/fields/rich-text) fields in your GraphCMS schema`
      )
      .default(false),
    downloadLocalImages: Joi.boolean()
      .description(
        `Download and cache GraphCMS image assets in your Gatsby project`
      )
      .default(false),
    downloadAllAssets: Joi.boolean()
      .description(
        `Download and cache all GraphCMS assets in your Gatsby project`
      )
      .default(false),
    endpoint: Joi.string()
      .description(
        `The endpoint URL for the GraphCMS project. This can be found in the [project settings UI](https://graphcms.com/docs/guides/concepts/apis#working-with-apis)`
      )
      .required(),
    fragmentsPath: Joi.string()
      .description(
        `The local project path where generated query fragments are saved. This is relative to your current working directory. If using multiple instances of the source plugin, you **must** provide a value here to prevent type and/or fragment conflicts.`
      )
      .default(`graphcms-fragments`),
    locales: Joi.array()
      .description(
        `An array of locale key strings from your GraphCMS project. You can read more about working with localisation in GraphCMS [here](https://graphcms.com/docs/guides/concepts/i18n).`
      )
      .items(Joi.string())
      .min(1)
      .default(["en"]),
    stages: Joi.array()
      .description(
        `An array of Content Stages from your GraphCMS project. You can read more about using Content Stages [here](https://graphcms.com/guides/working-with-content-stages).`
      )
      .items(Joi.string())
      .min(1)
      .default(["PUBLISHED"]),
    token: Joi.string().description(
      `If your GraphCMS project is **not** publicly accessible, you will need to provide a [Permanent Auth Token](https://graphcms.com/docs/reference/authorization) to correctly authorize with the API. You can learn more about creating and managing API tokens [here](https://graphcms.com/docs/guides/concepts/apis#working-with-apis)`
    ),
    typePrefix: Joi.string()
      .description(
        `The string by which every generated type name is prefixed with. For example, a type of Post in GraphCMS would become GraphCMS_Post by default. If using multiple instances of the source plugin, you **must** provide a value here to prevent type conflicts`
      )
      .default(`GraphCMS_`),
    maxImageWidth: Joi.number()
      .description("Maximum width of images to download")
      .default(0),
  });
}

interface RealPluginOptions extends PluginOptions {
  buildMarkdownNodes: boolean;
  downloadLocalImages: boolean;
  downloadAllAssets: boolean;
  endpoint: string;
  fragmentsPath: string;
  stages: string[];
  token: string;
  typePrefix: string;
  locales: string[];
  maxImageWidth: number;
}

function createExecutor(
  gatsbyApi: NodePluginArgs,
  pluginOptions: RealPluginOptions
): IQueryExecutor {
  const { endpoint, fragmentsPath, locales, stages, token, typePrefix } =
    pluginOptions;
  const { reporter } = gatsbyApi;
  const defaultStage = stages && stages.length === 1 && stages[0];
  if (defaultStage) {
    reporter.info(`using default GraphCMS stage: ${defaultStage}`);
  } else {
    reporter.info(`no default stage for GraphCMS`);
  }
  const execute = async ({ operationName, query, variables = {} }) => {
    return await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ query, variables, operationName }),
      headers: {
        "Content-Type": "application/json",
        ...(defaultStage && { "gcms-stage": defaultStage }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    })
      .then((response) => {
        if (!response.ok) {
          return reporter.panic(
            `gatsby-source-graphcms: Problem building GraphCMS nodes`,
            new Error(response.statusText)
          );
        }

        return response.json();
      })
      .then((response) => {
        if (response.errors) {
          return reporter.panic(
            `gatsby-source-graphcms: Problem building GraphCMS nodes`,
            new Error(response.errors)
          );
        }

        return response;
      })
      .catch((error) => {
        return reporter.panic(
          `gatsby-source-graphcms: Problem building GraphCMS nodes`,
          new Error(error)
        );
      });
  };
  return execute;
}

interface ISchemaInformation {
  schema: GraphQLSchema;
  gatsbyNodeTypes: IGatsbyNodeConfig[];
}

async function retrieveSchema(
  gatsbyApi: NodePluginArgs,
  pluginOptions: RealPluginOptions
): Promise<ISchemaInformation> {
  const { locales, stages } = pluginOptions;
  const execute = createExecutor(gatsbyApi, pluginOptions);
  const schema = await loadSchema(execute);

  const nodeInterface = schema.getType("Node") as GraphQLAbstractType;
  const query = schema.getType("Query") as GraphQLInterfaceType;
  const queryFields = query.getFields();
  const possibleTypes = schema.getPossibleTypes(nodeInterface);

  const singularRootFieldName = (type) =>
    Object.keys(queryFields).find(
      (fieldName) => queryFields[fieldName].type === type
    );

  const pluralRootFieldName = (type) =>
    Object.keys(queryFields).find(
      (fieldName) => String(queryFields[fieldName].type) === `[${type.name}!]!`
    );

  const hasLocaleField = (type) => type.getFields().locale;

  const gatsbyNodeTypes: IGatsbyNodeConfig[] = possibleTypes.map((type) => ({
    remoteTypeName: type.name,
    queries: [
      ...locales.map((locale) =>
        stages.map(
          (stage) => `
          query LIST_${pluralRootFieldName(
            type
          )}_${locale}_${stage} { ${pluralRootFieldName(type)}(first: $limit, ${
            hasLocaleField(type) ? `locales: [${locale}]` : ""
          }, skip: $offset, stage: ${stage}) {
              ..._${type.name}Id_
            }
          }`
        )
      ),
      `query NODE_${singularRootFieldName(type)}{ ${singularRootFieldName(
        type
      )}(where: $where, ${hasLocaleField(type) ? `locales: $locales` : ""}) {
        ..._${type.name}Id_
        }
      }
      fragment _${type.name}Id_ on ${type.name} {
        __typename
        id
        ${hasLocaleField(type) ? `locale` : ""}
        stage
      }`,
    ].join("\n"),
    nodeQueryVariables: ({ id, locale, stage }) => ({
      where: { id },
      locales: [locale],
      stage,
    }),
  }));

  return { schema, gatsbyNodeTypes };
}

async function createSourcingConfig(
  gatsbyApi: ParentSpanPluginArgs,
  pluginOptions: RealPluginOptions
): Promise<ISourcingConfig> {
  const { fragmentsPath, stages, typePrefix } = pluginOptions;
  const { cache, reporter } = gatsbyApi;
  const defaultStage = stages && stages.length === 1 && stages[0];
  if (defaultStage) {
    reporter.info(`using default GraphCMS stage: ${defaultStage}`);
  } else {
    reporter.info(`no default stage for GraphCMS`);
  }

  const execute = createExecutor(gatsbyApi, pluginOptions);
  const { schema, gatsbyNodeTypes } = (await cache.get(
    SchemaConfigCacheKey
  )) as ISchemaInformation;

  const fragmentsDir = `${process.cwd()}/${fragmentsPath}`;

  if (!fs.existsSync(fragmentsDir)) fs.mkdirSync(fragmentsDir);

  const addSystemFieldArguments = (field) => {
    if (["createdAt", "publishedAt", "updatedAt"].includes(field.name)) {
      return { variation: `COMBINED` };
    }
  };

  const fragments = await readOrGenerateDefaultFragments(fragmentsDir, {
    schema,
    gatsbyNodeTypes,
    defaultArgumentValues: [addSystemFieldArguments],
  });

  const documents = compileNodeQueries({
    schema,
    gatsbyNodeTypes,
    customFragments: fragments,
  });

  return {
    gatsbyApi,
    schema,
    execute: wrapQueryExecutorWithQueue(execute, { concurrency: 10 }),
    gatsbyTypePrefix: typePrefix,
    gatsbyNodeDefs: buildNodeDefinitions({ gatsbyNodeTypes, documents }),
  };
}

export async function sourceNodes(
  gatsbyApi: SourceNodesArgs,
  pluginOptions: RealPluginOptions
) {
  const config = await createSourcingConfig(gatsbyApi, pluginOptions);

  await createToolkitSchemaCustomization(config);

  await sourceAllNodes(config);
}

function createImageUrl(url: string, maxWidth: number) {
  if (!maxWidth) {
    return url;
  }

  const parsed = new URL(url);
  if (parsed.hostname !== "media.graphcms.com") {
    return url;
  }

  const resized = `https://${parsed.hostname}/resize=width:${maxWidth},fit:max${parsed.pathname}`;
  return resized;
}

type GraphCMS_Node = Node & {
  mimeType: string;
  url: string;
  fileName: string;
  remoteTypeName?: string;
  markdown?: string;
};
export async function onCreateNode(
  args: CreateNodeArgs<GraphCMS_Node>,
  pluginOptions: RealPluginOptions
) {
  const {
    node,
    actions: { createNode },
    createNodeId,
    getCache,
    store,
    reporter,
  } = args;
  const {
    buildMarkdownNodes,
    downloadAllAssets,
    downloadLocalImages,
    typePrefix,
    maxImageWidth,
  } = pluginOptions;

  const isImage =
    node.remoteTypeName === "Asset" && node.mimeType.includes("image/");

  if (
    node.remoteTypeName === "Asset" &&
    (downloadAllAssets || (downloadLocalImages && isImage))
  ) {
    try {
      const realUrl = isImage
        ? createImageUrl(node.url, maxImageWidth)
        : node.url;
      reporter.verbose(`Using ${realUrl} for ${node.url}`);
      const ext = node.fileName && path.extname(node.fileName);
      const name = node.fileName && path.basename(node.fileName, ext);
      const fileNode = await createRemoteFileNode({
        url: realUrl,
        parentNodeId: node.id,
        createNode,
        createNodeId,
        getCache,
        cache: undefined,
        store,
        reporter,
        name,
        ext,
      } as any);

      if (fileNode) node.localFile = fileNode.id;
    } catch (e) {
      console.error("gatsby-source-graphcms:", e);
    }
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
      });
    }
  }
}

export async function createSchemaCustomization(
  gatsbyApi: CreateSchemaCustomizationArgs,
  pluginOptions: RealPluginOptions
) {
  const {
    buildMarkdownNodes,
    downloadAllAssets,
    downloadLocalImages,
    typePrefix,
  } = pluginOptions;
  const {
    actions: { createTypes },
    cache,
  } = gatsbyApi;

  const schemaConfig = await retrieveSchema(gatsbyApi, pluginOptions);
  await cache.set(SchemaConfigCacheKey, schemaConfig);
  const { gatsbyNodeTypes } = schemaConfig;

  gatsbyNodeTypes.forEach((gatsbyNodeType) => {
    createTypes(`type ${typePrefix}${gatsbyNodeType.remoteTypeName} implements Node {
      updatedAt: Date! @dateformat
      createdAt: Date! @dateformat
      publishedAt: Date @dateformat
    }`);
  });

  if (downloadLocalImages || downloadAllAssets)
    createTypes(`
      type ${typePrefix}Asset {
        localFile: File @link
      }
    `);

  if (buildMarkdownNodes)
    createTypes(`
      type ${typePrefix}MarkdownNode implements Node {
        id: ID!
      }
      type ${typePrefix}RichText {
        markdownNode: ${typePrefix}MarkdownNode @link
      }
    `);
}
