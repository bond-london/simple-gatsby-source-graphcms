"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.pluginOptionsSchema = pluginOptionsSchema;
exports.sourceNodes = sourceNodes;
exports.onCreateNode = onCreateNode;
exports.createSchemaCustomization = createSchemaCustomization;
exports.createResolvers = createResolvers;

var _crypto = _interopRequireDefault(require("crypto"));

var _fs = _interopRequireDefault(require("fs"));

var _path = _interopRequireDefault(require("path"));

var _gatsbyGraphqlSourceToolkit = require("gatsby-graphql-source-toolkit");

var _gatsbyPluginImage = require("gatsby-plugin-image");

var _graphqlUtils = require("gatsby-plugin-image/graphql-utils");

var _gatsbySourceFilesystem = require("gatsby-source-filesystem");

var _he = _interopRequireDefault(require("he"));

var _nodeFetch = _interopRequireDefault(require("node-fetch"));

function pluginOptionsSchema({
  Joi
}) {
  return Joi.object({
    buildMarkdownNodes: Joi.boolean().description(`Build markdown nodes for all [RichText](https://graphcms.com/docs/reference/fields/rich-text) fields in your GraphCMS schema`).default(false),
    downloadLocalImages: Joi.boolean().description(`Download and cache GraphCMS image assets in your Gatsby project`).default(false),
    downloadAllAssets: Joi.boolean().description(`Download and cache all GraphCMS assets in your Gatsby project`).default(false),
    endpoint: Joi.string().description(`The endpoint URL for the GraphCMS project. This can be found in the [project settings UI](https://graphcms.com/docs/guides/concepts/apis#working-with-apis)`).required(),
    fragmentsPath: Joi.string().description(`The local project path where generated query fragments are saved. This is relative to your current working directory. If using multiple instances of the source plugin, you **must** provide a value here to prevent type and/or fragment conflicts.`).default(`graphcms-fragments`),
    locales: Joi.array().description(`An array of locale key strings from your GraphCMS project. You can read more about working with localisation in GraphCMS [here](https://graphcms.com/docs/guides/concepts/i18n).`).items(Joi.string()).min(1).default(["en"]),
    stages: Joi.array().description(`An array of Content Stages from your GraphCMS project. You can read more about using Content Stages [here](https://graphcms.com/guides/working-with-content-stages).`).items(Joi.string()).min(1).default(["PUBLISHED"]),
    token: Joi.string().description(`If your GraphCMS project is **not** publicly accessible, you will need to provide a [Permanent Auth Token](https://graphcms.com/docs/reference/authorization) to correctly authorize with the API. You can learn more about creating and managing API tokens [here](https://graphcms.com/docs/guides/concepts/apis#working-with-apis)`),
    typePrefix: Joi.string().description(`The string by which every generated type name is prefixed with. For example, a type of Post in GraphCMS would become GraphCMS_Post by default. If using multiple instances of the source plugin, you **must** provide a value here to prevent type conflicts`).default(`GraphCMS_`)
  });
}

const createSourcingConfig = async (gatsbyApi, {
  endpoint,
  fragmentsPath,
  locales,
  stages,
  token,
  typePrefix
}) => {
  const defaultStage = stages && stages.length && stages[0];

  const execute = async ({
    operationName,
    query,
    variables = {}
  }) => {
    const {
      reporter
    } = gatsbyApi;
    return await (0, _nodeFetch.default)(endpoint, {
      method: "POST",
      body: JSON.stringify({
        query,
        variables,
        operationName
      }),
      headers: {
        "Content-Type": "application/json",
        ...(defaultStage && {
          "gcms-stage": defaultStage
        }),
        ...(token && {
          Authorization: `Bearer ${token}`
        })
      }
    }).then(response => {
      if (!response.ok) {
        return reporter.panic(`gatsby-source-graphcms: Problem building GraphCMS nodes`, new Error(response.statusText));
      }

      return response.json();
    }).then(response => {
      if (response.errors) {
        return reporter.panic(`gatsby-source-graphcms: Problem building GraphCMS nodes`, new Error(response.errors));
      }

      return response;
    }).catch(error => {
      return reporter.panic(`gatsby-source-graphcms: Problem building GraphCMS nodes`, new Error(error));
    });
  };

  const schema = await (0, _gatsbyGraphqlSourceToolkit.loadSchema)(execute);
  const nodeInterface = schema.getType("Node");
  const query = schema.getType("Query");
  const queryFields = query.getFields();
  const possibleTypes = schema.getPossibleTypes(nodeInterface);

  const singularRootFieldName = type => Object.keys(queryFields).find(fieldName => queryFields[fieldName].type === type);

  const pluralRootFieldName = type => Object.keys(queryFields).find(fieldName => String(queryFields[fieldName].type) === `[${type.name}!]!`);

  const hasLocaleField = type => type.getFields().locale;

  const gatsbyNodeTypes = possibleTypes.map(type => ({
    remoteTypeName: type.name,
    queries: [...locales.map(locale => stages.map(stage => `
          query LIST_${pluralRootFieldName(type)}_${locale}_${stage} { ${pluralRootFieldName(type)}(first: $limit, ${hasLocaleField(type) ? `locales: [${locale}]` : ""}, skip: $offset, stage: ${stage}) {
              ..._${type.name}Id_
            }
          }`)), `query NODE_${singularRootFieldName(type)}{ ${singularRootFieldName(type)}(where: $where, ${hasLocaleField(type) ? `locales: $locales` : ""}) {
        ..._${type.name}Id_
        }
      }
      fragment _${type.name}Id_ on ${type.name} {
        __typename
        id
        ${hasLocaleField(type) ? `locale` : ""}
        stage
      }`].join("\n"),
    nodeQueryVariables: ({
      id,
      locale,
      stage
    }) => ({
      where: {
        id
      },
      locales: [locale],
      stage
    })
  }));
  const fragmentsDir = `${process.cwd()}/${fragmentsPath}`;
  if (!_fs.default.existsSync(fragmentsDir)) _fs.default.mkdirSync(fragmentsDir);

  const addSystemFieldArguments = field => {
    if (["createdAt", "publishedAt", "updatedAt"].includes(field.name)) return {
      variation: `COMBINED`
    };
  };

  const fragments = await (0, _gatsbyGraphqlSourceToolkit.readOrGenerateDefaultFragments)(fragmentsDir, {
    schema,
    gatsbyNodeTypes,
    defaultArgumentValues: [addSystemFieldArguments]
  });
  const documents = (0, _gatsbyGraphqlSourceToolkit.compileNodeQueries)({
    schema,
    gatsbyNodeTypes,
    customFragments: fragments
  });
  return {
    gatsbyApi,
    schema,
    execute: (0, _gatsbyGraphqlSourceToolkit.wrapQueryExecutorWithQueue)(execute, {
      concurrency: 10
    }),
    gatsbyTypePrefix: typePrefix,
    gatsbyNodeDefs: (0, _gatsbyGraphqlSourceToolkit.buildNodeDefinitions)({
      gatsbyNodeTypes,
      documents
    })
  };
};

async function sourceNodes(gatsbyApi, pluginOptions) {
  const {
    webhookBody
  } = gatsbyApi;
  const config = await createSourcingConfig(gatsbyApi, pluginOptions);
  await (0, _gatsbyGraphqlSourceToolkit.createSchemaCustomization)(config);

  if (webhookBody && Object.keys(webhookBody).length) {
    const {
      operation,
      data
    } = webhookBody;

    const nodeEvent = (operation, {
      __typename,
      locale,
      id
    }) => {
      switch (operation) {
        case "delete":
        case "unpublish":
          return {
            eventName: "DELETE",
            remoteTypeName: __typename,
            remoteId: {
              __typename,
              locale,
              id
            }
          };

        case "create":
        case "publish":
        case "update":
          return {
            eventName: "UPDATE",
            remoteTypeName: __typename,
            remoteId: {
              __typename,
              locale,
              id
            }
          };
      }
    };

    const {
      localizations = [{
        locale: "en"
      }]
    } = data;
    await (0, _gatsbyGraphqlSourceToolkit.sourceNodeChanges)(config, {
      nodeEvents: localizations.map(({
        locale
      }) => nodeEvent(operation, {
        locale,
        ...data
      }))
    });
  } else {
    await (0, _gatsbyGraphqlSourceToolkit.sourceAllNodes)(config);
  }
}

async function onCreateNode({
  node,
  actions: {
    createNode
  },
  createNodeId,
  getCache
}, {
  buildMarkdownNodes = false,
  downloadLocalImages = false,
  downloadAllAssets = false,
  typePrefix = "GraphCMS_"
}) {
  if (node.remoteTypeName === "Asset" && (downloadAllAssets || downloadLocalImages && node.mimeType.includes("image/"))) {
    try {
      const fileNode = await (0, _gatsbySourceFilesystem.createRemoteFileNode)({
        url: node.url,
        parentNodeId: node.id,
        createNode,
        createNodeId,
        getCache,
        ...(node.fileName && {
          name: node.fileName,
          ext: _path.default.extname(node.fileName)
        })
      });
      if (fileNode) node.localFile = fileNode.id;
    } catch (e) {
      console.error("gatsby-source-graphcms:", e);
    }
  }

  if (buildMarkdownNodes) {
    const fields = Object.entries(node).map(([key, value]) => ({
      key,
      value
    })).filter(({
      value
    }) => value && value.remoteTypeName && value.remoteTypeName === "RichText");

    if (fields.length) {
      fields.forEach(field => {
        const decodedMarkdown = _he.default.decode(field.value.markdown);

        const markdownNode = {
          id: `MarkdownNode:${createNodeId(`${node.id}-${field.key}`)}`,
          parent: node.id,
          internal: {
            type: `${typePrefix}MarkdownNode`,
            mediaType: "text/markdown",
            content: decodedMarkdown,
            contentDigest: _crypto.default.createHash(`md5`).update(decodedMarkdown).digest(`hex`)
          }
        };
        createNode(markdownNode);
        field.value.markdownNode = markdownNode.id;
      });
    }
  }
}

function createSchemaCustomization({
  actions: {
    createTypes
  }
}, {
  buildMarkdownNodes = false,
  downloadLocalImages = false,
  downloadAllAssets = false,
  typePrefix = "GraphCMS_"
}) {
  if (downloadLocalImages || downloadAllAssets) createTypes(`
      type ${typePrefix}Asset {
        localFile: File @link
      }
    `);
  if (buildMarkdownNodes) createTypes(`
      type ${typePrefix}MarkdownNode implements Node {
        id: ID!
      }
      type ${typePrefix}RichText {
        markdownNode: ${typePrefix}MarkdownNode @link
      }
    `);
}

const generateImageSource = (baseURL, width, height, format, fit = "clip", {
  quality = 100
}) => {
  const src = `https://media.graphcms.com/resize=width:${width},height:${height},fit:${fit}/output=quality:${quality}/${baseURL}`;
  return {
    src,
    width,
    height,
    format
  };
};

const resolveGatsbyImageData = async ({
  handle: filename,
  height,
  mimeType,
  width
}, options) => {
  const imageDataArgs = { ...options,
    pluginName: `gatsby-source-graphcms`,
    sourceMetadata: {
      format: mimeType.split("/")[1],
      height,
      width
    },
    filename,
    generateImageSource,
    options
  };
  return (0, _gatsbyPluginImage.generateImageData)(imageDataArgs);
};

function createResolvers({
  createResolvers
}, {
  typePrefix = "GraphCMS_"
}) {
  const typeName = `${typePrefix}Asset`;
  createResolvers({
    [typeName]: {
      gatsbyImageData: (0, _graphqlUtils.getGatsbyImageResolver)(resolveGatsbyImageData, {
        quality: {
          type: "Int",
          description: "The default image quality generated. This is overridden by any format-specific options."
        }
      })
    }
  });
}
//# sourceMappingURL=gatsby-node.js.map