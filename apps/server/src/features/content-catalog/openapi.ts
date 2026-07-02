/**
 * OpenAPI fragment for the Content Catalog API. Merged into the server's root
 * OpenAPI document (REST + OpenAPI-first, per the Standard Stack). Paths are
 * expressed relative to the `/api/v1` mount.
 *
 * Reflects the LOCKED `ContentItem` contract
 * (BBR-1144#document-entity-contract, BBR-1176):
 *   - status is exactly `draft | published | hidden`
 *   - category is `notice | free | qna`; `conditionTags` is an orthogonal facet
 *   - detail is addressed by id (no slug); moderation is publish/hide/restore
 *     (no `/submit`, no category tree).
 */

const CONTENT_STATUS_ENUM = ["draft", "published", "hidden"] as const;
const CONTENT_CATEGORY_ENUM = ["notice", "free", "qna"] as const;
const CONTENT_SORT_ENUM = ["latest", "popular", "views"] as const;

export const contentCatalogComponents = {
  schemas: {
    Content: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        authorId: { type: "string", format: "uuid" },
        title: { type: "string" },
        body: { type: "string" },
        category: { type: "string", enum: CONTENT_CATEGORY_ENUM },
        conditionTags: { type: "array", items: { type: "string" } },
        coverImageUrl: { type: "string", nullable: true },
        status: { type: "string", enum: CONTENT_STATUS_ENUM },
        viewCount: { type: "integer" },
        likeCount: { type: "integer" },
        reportCount: {
          type: "integer",
          description: "Report metadata; the admin queue derives `reported` from reportCount > 0.",
        },
        publishedAt: { type: "string", format: "date-time", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        deletedAt: {
          type: "string",
          format: "date-time",
          nullable: true,
          description: "Soft-delete marker; non-null means the item is deleted.",
        },
      },
    },
    CreateContentBody: {
      type: "object",
      required: ["title", "category"],
      properties: {
        title: { type: "string", maxLength: 200 },
        body: { type: "string", maxLength: 100000 },
        category: {
          type: "string",
          enum: CONTENT_CATEGORY_ENUM,
          description: "`notice` may only be authored by an admin.",
        },
        conditionTags: {
          type: "array",
          items: { type: "string", maxLength: 40 },
          maxItems: 20,
          description: "De-duplicated disease/condition facet tags.",
        },
        coverImageUrl: { type: "string", format: "uri", nullable: true },
      },
    },
    UpdateContentBody: {
      type: "object",
      minProperties: 1,
      description: "Partial patch; at least one field is required. Status is changed via /status.",
      properties: {
        title: { type: "string", maxLength: 200 },
        body: { type: "string", maxLength: 100000 },
        category: { type: "string", enum: CONTENT_CATEGORY_ENUM },
        conditionTags: { type: "array", items: { type: "string", maxLength: 40 }, maxItems: 20 },
        coverImageUrl: { type: "string", format: "uri", nullable: true },
      },
    },
    SetStatusBody: {
      type: "object",
      required: ["status"],
      properties: {
        status: { type: "string", enum: CONTENT_STATUS_ENUM },
      },
    },
    Envelope: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        data: {},
        meta: {
          type: "object",
          nullable: true,
          properties: {
            page: { type: "integer" },
            pageSize: { type: "integer" },
            total: { type: "integer" },
          },
        },
      },
    },
    Error: {
      type: "object",
      properties: {
        ok: { type: "boolean", enum: [false] },
        error: {
          type: "object",
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            details: {},
          },
        },
      },
    },
  },
} as const;

const envelope = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
});

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};

const listParams = [
  { name: "q", in: "query", required: false, schema: { type: "string" } },
  {
    name: "category",
    in: "query",
    required: false,
    schema: { type: "string", enum: CONTENT_CATEGORY_ENUM },
  },
  { name: "conditionTag", in: "query", required: false, schema: { type: "string" } },
  {
    name: "sort",
    in: "query",
    required: false,
    schema: { type: "string", enum: CONTENT_SORT_ENUM, default: "latest" },
  },
  { name: "page", in: "query", required: false, schema: { type: "integer", default: 1 } },
  { name: "pageSize", in: "query", required: false, schema: { type: "integer", default: 20 } },
];

export const contentCatalogPaths = {
  "/content": {
    get: {
      tags: ["content"],
      summary: "List published content (filter by category/conditionTag, sortable, paged)",
      parameters: listParams,
      responses: { "200": envelope("Paginated published content") },
    },
    post: {
      tags: ["content"],
      summary: "Create a draft content item",
      security: [{ session: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/CreateContentBody" } },
        },
      },
      responses: {
        "201": envelope("Created draft"),
        "401": errorResponse("Authentication required"),
        "403": errorResponse("Only admins may author notice content"),
      },
    },
  },
  "/content/search": {
    get: {
      tags: ["content"],
      summary: "Unified full-text search over published content",
      parameters: [
        { name: "q", in: "query", required: true, schema: { type: "string" } },
        ...listParams.slice(1),
      ],
      responses: { "200": envelope("Paginated search results") },
    },
  },
  "/content/mine": {
    get: {
      tags: ["content"],
      summary: "List my own content across all statuses",
      security: [{ session: [] }],
      parameters: listParams,
      responses: {
        "200": envelope("Paginated owned content"),
        "401": errorResponse("Auth required"),
      },
    },
  },
  "/content/{id}": {
    get: {
      tags: ["content"],
      summary: "Get a content item by id (published, or own/admin)",
      parameters: [idParam],
      responses: { "200": envelope("Content detail"), "404": errorResponse("Not found") },
    },
    patch: {
      tags: ["content"],
      summary: "Update own content (or any content as admin)",
      security: [{ session: [] }],
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/UpdateContentBody" } },
        },
      },
      responses: {
        "200": envelope("Updated content"),
        "403": errorResponse("Not the owner"),
        "404": errorResponse("Not found"),
      },
    },
    delete: {
      tags: ["content"],
      summary: "Soft-delete own content (or any content as admin)",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: {
        "200": envelope("Deleted"),
        "403": errorResponse("Not the owner"),
        "404": errorResponse("Not found"),
      },
    },
  },
  "/admin/content": {
    get: {
      tags: ["content-admin"],
      summary: "List all content (any status, filterable by report state, incl. soft-deleted)",
      security: [{ session: [] }],
      parameters: [
        ...listParams,
        {
          name: "status",
          in: "query",
          required: false,
          schema: { type: "string", enum: CONTENT_STATUS_ENUM },
        },
        { name: "authorId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
        {
          name: "reported",
          in: "query",
          required: false,
          schema: { type: "boolean" },
          description: "Keep only items with reportCount > 0.",
        },
        { name: "includeDeleted", in: "query", required: false, schema: { type: "boolean" } },
      ],
      responses: { "200": envelope("Paginated content"), "403": errorResponse("Admin only") },
    },
  },
  "/admin/content/{id}": {
    get: {
      tags: ["content-admin"],
      summary: "Get any content item by id",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: { "200": envelope("Content"), "404": errorResponse("Not found") },
    },
    patch: {
      tags: ["content-admin"],
      summary: "Edit any content item",
      security: [{ session: [] }],
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/UpdateContentBody" } },
        },
      },
      responses: { "200": envelope("Updated"), "404": errorResponse("Not found") },
    },
    delete: {
      tags: ["content-admin"],
      summary: "Delete any content item (soft by default, ?hard=true to purge)",
      security: [{ session: [] }],
      parameters: [idParam, { name: "hard", in: "query", required: false, schema: { type: "boolean" } }],
      responses: { "200": envelope("Deleted"), "404": errorResponse("Not found") },
    },
  },
  "/admin/content/{id}/status": {
    post: {
      tags: ["content-admin"],
      summary: "Moderate: set content status (publish / hide / unpublish)",
      security: [{ session: [] }],
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/SetStatusBody" } } },
      },
      responses: {
        "200": envelope("Status changed"),
        "404": errorResponse("Not found"),
      },
    },
  },
  "/admin/content/{id}/restore": {
    post: {
      tags: ["content-admin"],
      summary: "Restore a soft-deleted content item (clears deletedAt)",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: {
        "200": envelope("Restored"),
        "404": errorResponse("Not found"),
      },
    },
  },
} as const;
