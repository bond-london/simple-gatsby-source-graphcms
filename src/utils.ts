import { mkdir } from "fs/promises";
import fetch from "node-fetch";
import { NodePluginArgs, ParentSpanPluginArgs } from "gatsby";
import {
  buildNodeDefinitions,
  compileNodeQueries,
  readOrGenerateDefaultFragments,
  wrapQueryExecutorWithQueue,
} from "gatsby-graphql-source-toolkit";
import {
  IQueryExecutionArgs,
  IQueryExecutor,
  ISourcingConfig,
} from "gatsby-graphql-source-toolkit/dist/types";
import { GraphQLField, ExecutionResult } from "graphql";
import { ISchemaInformation, PluginOptions, PluginState } from "./types";

export const stateCache: PluginState = {};

function postprocessValue(locale: String, stage: string, value: any) {
  const { locale: actualLocale, stage: actualStage, ...rest } = value;
  const newValue = {
    ...rest,
    stage,
    actualStage,
  };
  if (actualLocale) {
    newValue.actualLocale = actualLocale;
    newValue.locale = locale;
  }
  return newValue;
}

function postprocessData(
  gatsbyApi: NodePluginArgs,
  args: IQueryExecutionArgs,
  result: ExecutionResult
): ExecutionResult {
  const { reporter } = gatsbyApi;
  const { operationName } = args;
  if (!operationName.startsWith("LIST_")) {
    return result;
  }
  const split = operationName.split("_");
  if (split.length !== 4) {
    return reporter.panic(
      `Operation name (${operationName}) should contain 4 entries`
    );
  }

  const [, , possibleLocale, stage] = split;
  const locale =
    possibleLocale.length === 2
      ? possibleLocale
      : possibleLocale.substring(0, 2) + "_" + possibleLocale.substring(2);

  const { data } = result;
  if (!data) {
    return result;
  }

  const updatedData: { [key: string]: any } = {};
  for (const key in data) {
    const values = data[key];
    if (Array.isArray(values)) {
      const newValues = values.map((value) =>
        postprocessValue(locale, stage, value)
      );
      updatedData[key] = newValues;
    } else {
      updatedData[key] = values;
    }
  }
  return { ...result, data: updatedData };
}

export function createExecutor(
  gatsbyApi: NodePluginArgs,
  pluginOptions: PluginOptions
): IQueryExecutor {
  const { endpoint, fragmentsPath, locales, stages, token, typePrefix } =
    pluginOptions;
  const { reporter } = gatsbyApi;
  const defaultStage = stages?.length === 1 && stages[0];
  const execute = (args: IQueryExecutionArgs) => {
    const { operationName, query, variables = {} } = args;
    return fetch(endpoint, {
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

        return response as ExecutionResult;
      })
      .then((response) => {
        const post = postprocessData(gatsbyApi, args, response);
        return post;
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

export async function createSourcingConfig(
  schemaConfig: ISchemaInformation,
  gatsbyApi: ParentSpanPluginArgs,
  pluginOptions: PluginOptions
): Promise<ISourcingConfig> {
  const { fragmentsPath, stages, typePrefix, concurrency } = pluginOptions;
  const { reporter } = gatsbyApi;
  const defaultStage = stages && stages.length === 1 && stages[0];

  const execute = createExecutor(gatsbyApi, pluginOptions);
  const { schema, gatsbyNodeTypes } = schemaConfig;

  const fragmentsDir = `${process.cwd()}/${fragmentsPath}`;

  await mkdir(fragmentsDir, { recursive: true });

  const addSystemFieldArguments = (field: GraphQLField<any, any>) => {
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
    execute: wrapQueryExecutorWithQueue(execute, { concurrency }),
    gatsbyTypePrefix: typePrefix,
    gatsbyNodeDefs: buildNodeDefinitions({ gatsbyNodeTypes, documents }),
  };
}
