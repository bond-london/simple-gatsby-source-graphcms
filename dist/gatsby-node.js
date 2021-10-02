"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.pluginOptionsSchema = pluginOptionsSchema;
exports.createResolvers = createResolvers;
exports.sourceNodes = sourceNodes;
exports.onCreateNode = onCreateNode;
exports.createSchemaCustomization = createSchemaCustomization;

var _crypto = _interopRequireDefault(require("crypto"));

var _fs = _interopRequireDefault(require("fs"));

var _path = _interopRequireDefault(require("path"));

var _gatsbyGraphqlSourceToolkit = require("gatsby-graphql-source-toolkit");

var _gatsbySourceFilesystem = require("gatsby-source-filesystem");

var _he = require("he");

var _nodeFetch = _interopRequireDefault(require("node-fetch"));

function pluginOptionsSchema(args) {
  const {
    Joi
  } = args;
  return Joi.object({
    buildMarkdownNodes: Joi.boolean().description(`Build markdown nodes for all [RichText](https://graphcms.com/docs/reference/fields/rich-text) fields in your GraphCMS schema`).default(false),
    downloadLocalImages: Joi.boolean().description(`Download and cache GraphCMS image assets in your Gatsby project`).default(false),
    downloadAllAssets: Joi.boolean().description(`Download and cache all GraphCMS assets in your Gatsby project`).default(false),
    skipUnusedAssets: Joi.boolean().description("Skip unused assets").default(true),
    endpoint: Joi.string().description(`The endpoint URL for the GraphCMS project. This can be found in the [project settings UI](https://graphcms.com/docs/guides/concepts/apis#working-with-apis)`).required(),
    fragmentsPath: Joi.string().description(`The local project path where generated query fragments are saved. This is relative to your current working directory. If using multiple instances of the source plugin, you **must** provide a value here to prevent type and/or fragment conflicts.`).default(`graphcms-fragments`),
    locales: Joi.array().description(`An array of locale key strings from your GraphCMS project. You can read more about working with localisation in GraphCMS [here](https://graphcms.com/docs/guides/concepts/i18n).`).items(Joi.string()).min(1).default(["en"]),
    stages: Joi.array().description(`An array of Content Stages from your GraphCMS project. You can read more about using Content Stages [here](https://graphcms.com/guides/working-with-content-stages).`).items(Joi.string()).min(1).default(["PUBLISHED"]),
    token: Joi.string().description(`If your GraphCMS project is **not** publicly accessible, you will need to provide a [Permanent Auth Token](https://graphcms.com/docs/reference/authorization) to correctly authorize with the API. You can learn more about creating and managing API tokens [here](https://graphcms.com/docs/guides/concepts/apis#working-with-apis)`),
    typePrefix: Joi.string().description(`The string by which every generated type name is prefixed with. For example, a type of Post in GraphCMS would become GraphCMS_Post by default. If using multiple instances of the source plugin, you **must** provide a value here to prevent type conflicts`).default(`GraphCMS_`),
    maxImageWidth: Joi.number().description("Maximum width of images to download").integer().default(0),
    concurrency: Joi.number().integer().min(1).default(10).description("The number of promises to run at one time")
  });
}

function createExecutor(gatsbyApi, pluginOptions) {
  const {
    endpoint,
    fragmentsPath,
    locales,
    stages,
    token,
    typePrefix
  } = pluginOptions;
  const {
    reporter
  } = gatsbyApi;
  const defaultStage = stages && stages.length === 1 && stages[0];

  const execute = async ({
    operationName,
    query,
    variables = {}
  }) => {
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

  return execute;
}

async function retrieveSchema(gatsbyApi, pluginOptions) {
  const {
    locales,
    stages
  } = pluginOptions;
  const execute = createExecutor(gatsbyApi, pluginOptions);
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
          query LIST_${pluralRootFieldName(type)}_${locale}_${stage} { ${pluralRootFieldName(type)}(first: $limit, ${hasLocaleField(type) ? `locales: [${locale}, ${locales[0]}]` : ""}, skip: $offset, stage: ${stage}) {
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
  return {
    schema,
    gatsbyNodeTypes
  };
}

async function createSourcingConfig(schemaConfig, gatsbyApi, pluginOptions) {
  const {
    fragmentsPath,
    stages,
    typePrefix,
    concurrency
  } = pluginOptions;
  const {
    reporter
  } = gatsbyApi;
  const defaultStage = stages && stages.length === 1 && stages[0];
  const execute = createExecutor(gatsbyApi, pluginOptions);
  const {
    schema,
    gatsbyNodeTypes
  } = schemaConfig;
  const fragmentsDir = `${process.cwd()}/${fragmentsPath}`;
  if (!_fs.default.existsSync(fragmentsDir)) _fs.default.mkdirSync(fragmentsDir);

  const addSystemFieldArguments = field => {
    if (["createdAt", "publishedAt", "updatedAt"].includes(field.name)) {
      return {
        variation: `COMBINED`
      };
    }
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
      concurrency
    }),
    gatsbyTypePrefix: typePrefix,
    gatsbyNodeDefs: (0, _gatsbyGraphqlSourceToolkit.buildNodeDefinitions)({
      gatsbyNodeTypes,
      documents
    })
  };
}

function createResolvers(args, pluginOptions) {
  const {
    createResolvers,
    reporter
  } = args;
  const {
    typePrefix
  } = pluginOptions;
  const resolvers = {
    [`${typePrefix}Asset`]: {
      localFile: {
        type: "File",

        resolve(source, args, context, info) {
          var _source$children;

          if ((_source$children = source.children) !== null && _source$children !== void 0 && _source$children.length) {
            for (const id of source.children) {
              const file = context.nodeModel.getNodeById({
                id,
                type: "File"
              });

              if (file) {
                return file;
              }
            }
          }
        }

      }
    }
  };
  createResolvers(resolvers);
}

async function sourceNodes(gatsbyApi, pluginOptions) {
  const schemaConfig = await retrieveSchema(gatsbyApi, pluginOptions);
  const config = await createSourcingConfig(schemaConfig, gatsbyApi, pluginOptions);
  await (0, _gatsbyGraphqlSourceToolkit.sourceAllNodes)(config);
}

function createImageUrl(url, maxWidth, reporter) {
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

function isAssetUsed(node, reporter) {
  const fields = Object.entries(node);
  const remoteId = node.remoteId;
  if (!remoteId) return false;
  let used = false;

  for (const [key, value] of fields) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry.remoteId) {
          // reporter.verbose(`${node.fileName} used by ${entry.remoteTypeName}`);
          used = true;
          break;
        }
      }
    }

    if (used) {
      break;
    }
  }

  return used;
}

let shownMarkdownWarning = false;

async function onCreateNode(args, pluginOptions) {
  const {
    node,
    actions: {
      createNode,
      createParentChildLink
    },
    createNodeId,
    getCache,
    store,
    reporter
  } = args;
  const {
    buildMarkdownNodes,
    downloadAllAssets,
    downloadLocalImages,
    typePrefix,
    maxImageWidth,
    skipUnusedAssets
  } = pluginOptions;
  const isImage = node.remoteTypeName === "Asset" && node.width && node.height;

  if (node.remoteTypeName === "Asset" && (downloadAllAssets || downloadLocalImages && isImage)) {
    if (skipUnusedAssets && !isAssetUsed(node, reporter)) {// reporter.verbose(
      //   `Skipping unused asset ${node.fileName} ${node.remoteId}`
      // );
    } else {
      if (node.size > 10 * 1024 * 1024) {
        reporter.warn(`Asset ${node.fileName} ${node.remoteId} is too large: ${node.size}`);
      }

      try {
        const realUrl = isImage && maxImageWidth && node.width > maxImageWidth ? createImageUrl(node.url, maxImageWidth, reporter) : node.url;

        const ext = node.fileName && _path.default.extname(node.fileName);

        const name = node.fileName && _path.default.basename(node.fileName, ext);

        const localNodeId = createNodeId(`${node.id} >> LocalFile`);
        const fileNode = await (0, _gatsbySourceFilesystem.createRemoteFileNode)({
          url: realUrl,
          parentNodeId: node.id,
          createNode,
          createNodeId,
          getCache,
          cache: undefined,
          store,
          reporter,
          name,
          ext
        });
        const localNode = {
          id: localNodeId,
          children: [],
          parent: node.id,
          internal: {
            type: "LocalAsset",
            owner: "",
            contentDigest: fileNode.internal.contentDigest
          }
        }; // if (fileNode) {
        //   node.localFile = fileNode.id;
        // }
        // createNode(localNode);
        // createParentChildLink({ parent: localNode, child: fileNode });
        // createParentChildLink({ parent: node, child: localNode });

        createParentChildLink({
          parent: node,
          child: fileNode
        });
      } catch (e) {
        console.error("gatsby-source-graphcms:", e);
      }
    }
  }

  if (buildMarkdownNodes) {
    const fields = Object.entries(node).map(([key, value]) => ({
      key,
      value
    })).filter(({
      value
    }) => value && (value === null || value === void 0 ? void 0 : value.remoteTypeName) === "RichText");

    if (fields.length) {
      fields.forEach(field => {
        const decodedMarkdown = (0, _he.decode)(field.value.markdown);
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

        if (!shownMarkdownWarning) {
          shownMarkdownWarning = true;
          reporter.warn("Mutated node for markdown - not supported in v4 or LMDB_STORE");
        }
      });
    }
  }
}

function customiseSchema({
  createTypes
}, {
  typePrefix
}, {
  gatsbyNodeTypes
}) {
  gatsbyNodeTypes.forEach(gatsbyNodeType => {
    createTypes(`type ${typePrefix}${gatsbyNodeType.remoteTypeName} implements Node {
      updatedAt: Date! @dateformat
      createdAt: Date! @dateformat
      publishedAt: Date @dateformat
    }`);
  });
}

async function createSchemaCustomization(gatsbyApi, pluginOptions) {
  const {
    buildMarkdownNodes,
    downloadAllAssets,
    downloadLocalImages,
    typePrefix,
    defaultStage
  } = pluginOptions;
  const {
    actions,
    reporter
  } = gatsbyApi;
  const {
    createTypes
  } = actions;

  if (defaultStage) {
    reporter.info(`using default GraphCMS stage: ${defaultStage}`);
  } else {
    reporter.info(`no default stage for GraphCMS`);
  }

  const schemaConfig = await retrieveSchema(gatsbyApi, pluginOptions);
  const config = await createSourcingConfig(schemaConfig, gatsbyApi, pluginOptions);
  customiseSchema(actions, pluginOptions, schemaConfig);
  await (0, _gatsbyGraphqlSourceToolkit.createSchemaCustomization)(config); // if (downloadLocalImages || downloadAllAssets)
  //   createTypes(`
  //     type ${typePrefix}Asset {
  //       localFile: File @link
  //       childFile: File @link
  //       childImageSharp: ImageSharp @link
  //     }
  //   `);
  // localAsset: LocalAsset @link

  if (buildMarkdownNodes) createTypes(`
      type ${typePrefix}MarkdownNode implements Node {
        id: ID!
      }
      type ${typePrefix}RichText {
        markdownNode: ${typePrefix}MarkdownNode @link
      }
    `);
}