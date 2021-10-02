import { Actions, CreateSchemaCustomizationArgs } from "gatsby";
import { ISchemaInformation, PluginOptions } from "./types";
import { createSourcingConfig, stateCache } from "./utils";
import { createSchemaCustomization as createToolkitSchemaCustomization } from "gatsby-graphql-source-toolkit";

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
      }`);
  });
}

export async function createSchemaCustomization(
  gatsbyApi: CreateSchemaCustomizationArgs,
  pluginOptions: PluginOptions
): Promise<void> {
  const {
    buildMarkdownNodes,
    downloadAllAssets,
    downloadLocalImages,
    typePrefix,
    stages,
  } = pluginOptions;
  const { actions, reporter } = gatsbyApi;
  const { createTypes } = actions;
  const defaultStage = stages?.length === 1 && stages[0];
  if (defaultStage) {
    reporter.info(`using default GraphCMS stage: ${defaultStage}`);
  } else {
    reporter.info(`no default stage for GraphCMS`);
  }

  const schemaConfig = stateCache.schemaInformation;
  if (!schemaConfig) {
    reporter.panic("No schema configuration");
  }

  const config = await createSourcingConfig(
    schemaConfig,
    gatsbyApi,
    pluginOptions
  );
  customiseSchema(actions, pluginOptions, schemaConfig);
  await createToolkitSchemaCustomization(config);

  // if (downloadLocalImages || downloadAllAssets)
  //   createTypes(`
  //     type ${typePrefix}Asset {
  //       localFile: File @link
  //       childFile: File @link
  //       childImageSharp: ImageSharp @link

  //     }
  //   `);

  // localAsset: LocalAsset @link
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
