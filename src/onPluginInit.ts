import { NodePluginArgs, ParentSpanPluginArgs } from "gatsby";
import { loadSchema } from "gatsby-graphql-source-toolkit";
import { ISchemaInformation, PluginOptions } from "./types";
import { createExecutor, stateCache } from "./utils";
import { GraphQLAbstractType, GraphQLInterfaceType } from "graphql";
import { IGatsbyNodeConfig } from "gatsby-graphql-source-toolkit/dist/types";

async function retrieveSchema(
  gatsbyApi: NodePluginArgs,
  pluginOptions: PluginOptions
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
            )}_${locale}_${stage} { ${pluralRootFieldName(
            type
          )}(first: $limit, ${
            hasLocaleField(type) ? `locales: [${locale}, ${locales[0]}]` : ""
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

export async function onPreBootstrap( // onPluginInit(
  args: ParentSpanPluginArgs,
  options: PluginOptions
): Promise<void> {
  const schemaInformation = await retrieveSchema(args, options);
  stateCache.schemaInformation = schemaInformation;
}
