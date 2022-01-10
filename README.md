<h2 align="center">@bond-london/simple-gatsby-source-graphcms</h2>

<p align="center">A port/rebuild of the official gatsby graphcms source plugin</p>

This simplifies and adds some new features

- Everything is handled in source nodes rather than later
- Compatible with gatsby v4
- Parallel asset downloading
- Incremental downloading
- Handles locales
- Produces clean RTF

## Installation

```shell
yarn add @bond-london/simple-gatsby-source-graphcms
```

## Configuration

> We recommend using environment variables with your GraphCMS `token` and `endpoint` values. You can learn more about using environment variables with Gatsby [here](https://www.gatsbyjs.org/docs/environment-variables).

### Basic

```js
// gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: "gatsby-source-graphcms",
      options: {
        endpoint: process.env.GRAPHCMS_ENDPOINT,
      },
    },
  ],
};
```

### Authorization

You can also provide an auth token using the `token` configuration key. This is necessary if your GraphCMS project is **not** publicly available, or you want to scope access to a specific content stage (i.e. draft content).

```js
// gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: "gatsby-source-graphcms",
      options: {
        endpoint: process.env.GRAPHCMS_ENDPOINT,
        token: process.env.GRAPHCMS_TOKEN,
      },
    },
  ],
};
```

### Options

| Key                   | Type                                     | Description                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `endpoint`            | String (**required**)                    | The endpoint URL for the GraphCMS project. This can be found in the [project settings UI](https://graphcms.com/docs/guides/concepts/apis#working-with-apis).                                                                                                                                                                           |
| `token`               | String                                   | If your GraphCMS project is **not** publicly accessible, you will need to provide a [Permanent Auth Token](https://graphcms.com/docs/reference/authorization) to correctly authorize with the API. You can learn more about creating and managing API tokens [here](https://graphcms.com/docs/guides/concepts/apis#working-with-apis). |
| `typePrefix`          | String _(Default: `GraphCMS_`)\_         | The string by which every generated type name is prefixed with. For example, a type of `Post` in GraphCMS would become `GraphCMS_Post` by default. If using multiple instances of the source plugin, you **must** provide a value here to prevent type conflicts.                                                                      |
| `downloadAllAssets`   | Boolean _(Default: `false`)_             | Download and cache all GraphCMS assets in your Gatsby project. [Learn more](#downloading-local-image-assets).                                                                                                                                                                                                                          |
| `cleanupRtf`          | Boolean _(Default: `true`)_              | Create a cleaned node in [`RichText`](https://graphcms.com/docs/reference/fields/rich-text) fields in your GraphCMS schema. These don't have empty elements and have replaced whitespace with a single space.                                                                                                                          |
| `buildMarkdownNodes`  | Boolean _(Default: `false`)_             | Build markdown nodes for all [`RichText`](https://graphcms.com/docs/reference/fields/rich-text) fields in your GraphCMS schema. [Learn more](#using-markdown-nodes).                                                                                                                                                                   |
| `markdownFields`      | Object _(Default: `{}`)_                 | Which models/fields are markdown causing a markdown node to be built. [Learn more](#using-markdown-fields).                                                                                                                                                                                                                            |
| `fragmentsPath`       | String _(Default: `graphcms-fragments`)_ | The local project path where generated query fragments are saved. This is relative to your current working directory. If using multiple instances of the source plugin, you **must** provide a value here to prevent type and/or fragment conflicts.                                                                                   |
| `locales`             | String _(Default: `['en']`)_             | An array of locale key strings from your GraphCMS project. [Learn more](#querying-localised-nodes). You can read more about working with localisation in GraphCMS [here](https://graphcms.com/docs/guides/concepts/i18n). This builds complete models for each locale using the fallback locale.                                       |
| `stages`              | String _(Default: `['PUBLISHED']`)_      | An array of Content Stages from your GraphCMS project. [Learn more](#querying-from-content-stages). You can read more about using Content Stages [here](https://graphcms.com/guides/working-with-content-stages).                                                                                                                      |
| `concurrency`         | Number _(Default: `10`)_                 | How many content downloads to run concurrently.                                                                                                                                                                                                                                                                                        |
| `concurrentDownloads` | Number _(Default: `10`)_                 | How many asset downloads to run in parallel.                                                                                                                                                                                                                                                                                           |

## Features

- [Querying localised nodes](#querying-localised-nodes)
- [Querying from content stages](#querying-from-content-stages)
- [Usage with `gatsby-plugin-image`](#usage-with-gatsby-plugin-image)
- [Downloading local image assets](#downloading-local-image-assets)
- [Using markdown nodes](#using-markdown-nodes)
- [Using markdown nodes](#using-markdown-fields)
- [Working with query fragments](#working-with-query-fragments)

### Querying localised nodes

If using GraphCMS localisation, this plugin provides support to build nodes for all provided locales.

Update your plugin configuration to include the `locales` key.

```js
// gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: "gatsby-source-graphcms",
      options: {
        endpoint: process.env.GRAPHCMS_ENDPOINT,
        locales: ["en", "de"],
      },
    },
  ],
};
```

To query for nodes for a specific locale, use the `filter` query argument.

```gql
{
  enProducts: allGraphCmsProduct(filter: { locale: { eq: en } }) {
    nodes {
      name
    }
  }
}
```

This creates local content nodes for all the locales produced. This allows simple multiple locale sites to be produced from partially localised content in the CMS.

### Querying from content stages

This plugin provides support to build nodes for entries from multiple Content Stages.

The provided Content Stages **must** be accessible according to the configuration of your project's [API access](https://graphcms.com/docs/authorization). If providing a `token`, then that [Permanent Auth Token](https://graphcms.com/docs/authorization#permanent-auth-tokens) must have permission to query data from all provided Content Stages.

The example below assumes that both the `DRAFT` and `PUBLISHED` stages are publicly accessible.

```js
// gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: "gatsby-source-graphcms",
      options: {
        endpoint: process.env.GRAPHCMS_ENDPOINT,
        stages: ["DRAFT", "PUBLISHED"],
      },
    },
  ],
};
```

To query for nodes from a specific Content Stage, use the `filter` query argument.

```gql
{
  allGraphCmsProduct(filter: { stage: { eq: DRAFT } }) {
    nodes {
      name
    }
  }
}
```

### Usage with `gatsby-plugin-image`

> Requires [`gatsby-plugin-image`](https://www.gatsbyjs.com/plugins/gatsby-plugin-image) as a project dependency.

This source plugin supports `gatsby-plugin-image` for responsive, high performance GraphCMS images direct from our CDN.

Use the `gatsbyImageData` resolver on your `GraphCMS_Asset` nodes.

```gql
{
  allGraphCmsAsset {
    nodes {
      gatsbyImageData(layout: FULL_WIDTH)
    }
  }
}
```

#### `gatsbyImageData` resolver arguments

| Key                    | Type                                                   | Description                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aspectRatio`          | Float                                                  | Force a specific ratio between the image’s width and height.                                                                                                                                                                                                                                                                                                                                                  |
| `backgroundColor`      | String                                                 | Background color applied to the wrapper.                                                                                                                                                                                                                                                                                                                                                                      |
| `breakpoints`          | [Int]                                                  | Output widths to generate for full width images. Default is to generate widths for common device resolutions. It will never generate an image larger than the source image. The browser will automatically choose the most appropriate.                                                                                                                                                                       |
| `height`               | Int                                                    | Change the size of the image.                                                                                                                                                                                                                                                                                                                                                                                 |
| `layout`               | GatsbyImageLayout (`CONSTRAINED`/`FIXED`/`FULL_WIDTH`) | Determines the size of the image and its resizing behavior.                                                                                                                                                                                                                                                                                                                                                   |
| `outputPixelDensities` | [Float]                                                | A list of image pixel densities to generate. It will never generate images larger than the source, and will always include a 1x image. The value is multiplied by the image width, to give the generated sizes. For example, a `400` px wide constrained image would generate `100`, `200`, `400` and `800` px wide images by default. Ignored for full width layout images, which use `breakpoints` instead. |
| `quality`              | Int                                                    | The default image quality generated. This is overridden by any format-specific options.                                                                                                                                                                                                                                                                                                                       |
| `sizes`                | String                                                 | [The `<img> sizes` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#attributes), passed to the img tag. This describes the display size of the image, and does not affect generated images. You are only likely to need to change this if your are using full width images that do not span the full width of the screen.                                                             |
| `width`                | Int                                                    | Change the size of the image.                                                                                                                                                                                                                                                                                                                                                                                 |

For more information on using `gatsby-plugin-image`, please see the [documentation](https://www.gatsbyjs.com/plugins/gatsby-plugin-image/).

### Downloading local image assets

If you prefer, the source plugin also provides the option to download and cache GraphCMS assets in your Gatsby project.

To enable this, add `downloadAllAssets: true` to your plugin configuration. This downloads all assets.

```js
// gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: "gatsby-source-graphcms",
      options: {
        endpoint: process.env.GRAPHCMS_ENDPOINT,
        downloadAllAssets: true,
      },
    },
  ],
};
```

This adds a `localFile` field to the `GraphCMS_Asset` type which resolves to the file node generated at build by [`gatsby-source-filesystem`](https://www.gatsbyjs.org/packages/gatsby-source-filesystem).

```gql
{
  allGraphCmsAsset {
    nodes {
      localFile {
        childImageSharp {
          gatsbyImageData(layout: FULL_WIDTH)
        }
      }
    }
  }
}
```

### Using markdown nodes

This source plugin provides the option to build markdown nodes for all `RichText` fields in your GraphCMS schema, which in turn can be used with [MDX](https://mdxjs.com).

To enable this, add `buildMarkdownNodes: true` to your plugin configuration.

```js
// gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: "gatsby-source-graphcms",
      options: {
        endpoint: process.env.GRAPHCMS_ENDPOINT,
        buildMarkdownNodes: true,
      },
    },
  ],
};
```

Enabling this option adds a `markdownNode` nested field to all `RichText` fields on the generated Gatsby schema.

#### Usage with `gatsby-plugin-mdx`

These newly built nodes can be used with [`gatsby-plugin-mdx`](https://www.gatsbyjs.org/packages/gatsby-plugin-mdx) to render markdown from GraphCMS.

Once installed, you will be able to query for `MDX` fields using a query similar to the one below.

```gql
{
  allGraphCmsPost {
    nodes {
      id
      content {
        markdownNode {
          childMdx {
            body
          }
        }
      }
    }
  }
}
```

Check out the [demo source](https://github.com/GraphCMS/gatsby-source-graphcms/tree/main/demo) for an example of a full MDX implementation.

### Using markdown fields

This source plugin provides the option to build markdown nodes for all `RichText` fields in your GraphCMS schema, which in turn can be used with [MDX](https://mdxjs.com).

To enable this, add something like `markdownFields: {Author: ['description']}` to your plugin configuration.

```js
// gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: "gatsby-source-graphcms",
      options: {
        endpoint: process.env.GRAPHCMS_ENDPOINT,
        markdownFields: { Author: ["description"] },
      },
    },
  ],
};
```

Enabling this option adds a `descriptionMarkdownNode` field to the `description` fields on the `Author` schema. Other fields and schemas are added the same way

### Working with query fragments

The source plugin will generate and save GraphQL query fragments for every node type. By default, they will be saved in a `graphcms-fragments` directory at the root of your Gatsby project. This can be configured:

> If using multiple instances of the source plugin, you **must** provide a value to prevent type and/or fragment conflicts.

```js
// gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: "gatsby-source-graphcms",
      options: {
        endpoint: process.env.GRAPHCMS_ENDPOINT,
        fragmentsPath: "my-query-fragments",
      },
    },
  ],
};
```

The generated fragments are then read from the project for subsequent builds. It is recommended that they are checked in to version control for your project.

Should you make any changes or additions to your GraphCMS schema, you will need to update the query fragments accrdingly. Alternatively they will be regnerated on a subsequent build after removing the directory from your project.

#### Modifying query fragments

In some instances, you may need modify query fragments on a per type basis. This may involve:

- Removing unrequired fields
- Adding new fields with arguments as an aliased field

For example, adding a `featuredCaseStudy` field:

```graphql
fragment Industry on Industry {
  featuredCaseStudy: caseStudies(where: { featured: true }, first: 1)
}
```

Field arguments cannot be read by Gatsby from the GraphCMS schema. Instead we must alias any required usages as aliased fields. In this example, the `featuredCaseStudy` field would then be available in our Gatsby queries:

```graphql
{
  allGraphCmsIndustry {
    nodes {
      featuredCaseStudy {
        ...
      }
    }
  }
}
```
