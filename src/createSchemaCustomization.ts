import { Actions, CreateSchemaCustomizationArgs } from "gatsby";
import {
  ISchemaInformation,
  isSpecialField,
  isSpecialObject,
  isSpecialUnion,
  PluginOptions,
  SpecialFieldEntry,
  SpecialFieldMap,
} from "./types";
import { createSourcingConfig, getRealType, stateCache } from "./utils";
import { createSchemaCustomization as createToolkitSchemaCustomization } from "gatsby-graphql-source-toolkit";
import { GraphQLObjectType } from "graphql";

function customiseSchema(
  { createTypes }: Actions,
  { typePrefix }: PluginOptions,
  { gatsbyNodeTypes, schema }: ISchemaInformation
) {
  gatsbyNodeTypes.forEach((gatsbyNodeType) => {
    const realType = schema.getType(
      gatsbyNodeType.remoteTypeName
    ) as GraphQLObjectType;
    const hasLocaleField = realType.getFields().locale;
    createTypes(`type ${typePrefix}${
      gatsbyNodeType.remoteTypeName
    } implements Node {
        updatedAt: Date! @dateformat
        createdAt: Date! @dateformat
        publishedAt: Date @dateformat
        ${hasLocaleField ? `actualLocale: ${typePrefix}Locale!` : ""}
        actualStage: ${typePrefix}Stage!
      }`);
  });
}

function walkSpecialFieldsEntries(
  gatsbyApi: CreateSchemaCustomizationArgs,
  pluginOptions: PluginOptions,
  isTopLevel: boolean,
  typeName: string,
  specialsFieldsEntries: ReadonlyArray<SpecialFieldEntry>
) {
  const { buildMarkdownNodes, cleanupRtf, typePrefix } = pluginOptions;
  const {
    actions: { createTypes },
    reporter,
  } = gatsbyApi;
  const additions: string[] = [];
  specialsFieldsEntries.forEach((entry) => {
    if (isSpecialField(entry)) {
      switch (entry.type) {
        case "Markdown":
          additions.push(`${entry.field.name}MarkdownNode: ${typePrefix}MarkdownNode @link
          `);
          break;
        case "RichText":
          {
            const valueType = entry.field.type as GraphQLObjectType;
            const fieldType = getRealType(valueType);
            createTypes(`type ${typePrefix}${fieldType} {
            cleaned: JSON
          }`);
          }
          break;
      }
    } else if (isSpecialUnion(entry)) {
      walkSpecialFieldsMap(gatsbyApi, pluginOptions, false, entry.value);
    } else if (isSpecialObject(entry)) {
      walkSpecialFieldsEntries(
        gatsbyApi,
        pluginOptions,
        false,
        typeName,
        entry.value
      );
    }
  });
  if (additions.length > 0) {
    createTypes(`type ${typePrefix}${typeName} ${
      isTopLevel ? "implements Node" : ""
    } {
      ${additions}
    }`);
  }
}
function walkSpecialFieldsMap(
  gatsbyApi: CreateSchemaCustomizationArgs,
  pluginOptions: PluginOptions,
  isTopLevel: boolean,
  specialsFieldsMap: SpecialFieldMap
) {
  const { buildMarkdownNodes, cleanupRtf, typePrefix } = pluginOptions;
  const {
    actions: { createTypes },
    reporter,
  } = gatsbyApi;
  specialsFieldsMap.forEach((fields, typeName) => {
    walkSpecialFieldsEntries(
      gatsbyApi,
      pluginOptions,
      isTopLevel,
      typeName,
      fields
    );
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
    cleanupRtf,
  } = pluginOptions;
  const { actions, schema, reporter } = gatsbyApi;
  const { createTypes } = actions;

  const schemaConfig = stateCache.schemaInformation;
  if (!schemaConfig) {
    return reporter.panic("No schema configuration");
  }

  const specialFields = stateCache.specialFields;
  if (!specialFields) {
    return reporter.panic("No special fields");
  }

  const config = await createSourcingConfig(
    schemaConfig,
    gatsbyApi,
    pluginOptions
  );
  customiseSchema(actions, pluginOptions, schemaConfig);
  await createToolkitSchemaCustomization(config);

  if (downloadAllAssets) {
    createTypes(`type ${typePrefix}Asset implements Node {
    localFile: File @link
  }`);
  }

  if (buildMarkdownNodes) {
    createTypes(`
        type ${typePrefix}MarkdownNode implements Node {
          id: ID!
        }
      `);

    createTypes(`type ${typePrefix}RichText {
        markdownNode: ${typePrefix}MarkdownNode @link
      }`);
  }

  walkSpecialFieldsMap(gatsbyApi, pluginOptions, true, specialFields);
}
