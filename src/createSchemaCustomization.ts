import { Actions, CreateSchemaCustomizationArgs } from "gatsby";
import { ISchemaInformation, PluginOptions } from "./types";
import { createSourcingConfig, stateCache } from "./utils";
import { createSchemaCustomization as createToolkitSchemaCustomization } from "gatsby-graphql-source-toolkit";
import { capitalize } from "lodash";

function customiseSchema(
  { createTypes }: Actions,
  { typePrefix }: PluginOptions,
  { gatsbyNodeTypes }: ISchemaInformation
) {
  gatsbyNodeTypes.forEach((gatsbyNodeType) => {
    createTypes(`type ${typePrefix}${gatsbyNodeType.remoteTypeName} implements Node {
        updatedAt: Date! @dateformat
        createdAt: Date! @dateformat
        publishedAt: Date @dateformat
        actualLocale: String
        actualStage: String!
      }`);
  });
}

export async function createSchemaCustomization(
  gatsbyApi: CreateSchemaCustomizationArgs,
  pluginOptions: PluginOptions
): Promise<void> {
  const {
    buildMarkdownNodes,
    markdownFields,
    downloadAllAssets,
    typePrefix,
    stages,
    cleanupRtf,
  } = pluginOptions;
  const { actions, schema, reporter } = gatsbyApi;
  const { createTypes } = actions;
  const defaultStage = stages?.length === 1 && stages[0];
  if (defaultStage) {
    reporter.info(`using default GraphCMS stage: ${defaultStage}`);
  } else {
    reporter.info(`no default stage for GraphCMS`);
  }

  const schemaConfig = stateCache.schemaInformation;
  if (!schemaConfig) {
    return reporter.panic("No schema configuration");
  }

  const richTextMap = stateCache.richTextMap;
  if (!richTextMap) {
    return reporter.panic("No rich text map");
  }

  const config = await createSourcingConfig(
    schemaConfig,
    gatsbyApi,
    pluginOptions
  );
  customiseSchema(actions, pluginOptions, schemaConfig);
  await createToolkitSchemaCustomization(config);

  if (cleanupRtf) {
    richTextMap.forEach((fields, type) => {
      fields.forEach((field) => {
        createTypes(`type ${typePrefix}${type}${capitalize(field)}RichText {
          cleaned: JSON
        }`);
      });
    });
  }

  if (downloadAllAssets) {
    createTypes(`type ${typePrefix}Asset implements Node {
    localFile: File @link
  }`);
  }

  if (buildMarkdownNodes || markdownFields) {
    createTypes(`
        type ${typePrefix}MarkdownNode implements Node {
          id: ID!
        }
      `);

    if (buildMarkdownNodes) {
      createTypes(`type ${typePrefix}RichText {
        markdownNode: ${typePrefix}MarkdownNode @link
      }`);
    }

    Object.keys(markdownFields).forEach((type) => {
      const fields = markdownFields[type];
      createTypes(`type ${typePrefix}${type} implements Node {
        ${fields.map(
          (field) => `${field}MarkdownNode: ${typePrefix}MarkdownNode @link
        `
        )}
      }`);
    });
  }
}
