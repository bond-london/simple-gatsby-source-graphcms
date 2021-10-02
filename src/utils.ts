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
  IQueryExecutor,
  ISourcingConfig,
} from "gatsby-graphql-source-toolkit/dist/types";
import { ISchemaInformation, PluginOptions, PluginState } from "./types";

export const stateCache: PluginState = {};

export function createExecutor(
  gatsbyApi: NodePluginArgs,
  pluginOptions: PluginOptions
): IQueryExecutor {
  const { endpoint, fragmentsPath, locales, stages, token, typePrefix } =
    pluginOptions;
  const { reporter } = gatsbyApi;
  const defaultStage = stages?.length === 1 && stages[0];
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
    execute: wrapQueryExecutorWithQueue(execute, { concurrency }),
    gatsbyTypePrefix: typePrefix,
    gatsbyNodeDefs: buildNodeDefinitions({ gatsbyNodeTypes, documents }),
  };
}
