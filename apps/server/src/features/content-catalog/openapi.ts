/**
 * OpenAPI fragment for the Content Catalog API. Merged into the server's root
 * OpenAPI document (REST + OpenAPI-first, per the Standard Stack). Paths are
 * expressed relative to the `/api/v1` mount.
 */

export const contentCatalogComponents = {
  schemas: {
    Content: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        slug: { type: "string" },
        title: { type: "string" },
        summary: { type: "string" },
        body: { type: "string" },
        categoryId: { type: "string", format: "uuid", nullable: true },
        tags: { type: "array", items: { type: "string" } },
        status: {
          type: "string",
          enum: ["draft", "pending_review", "published", "archived", "rejected"],
        },
        authorId: { type: "string", format: "uuid" },
        coverImageUrl: { type: "string", nullable: true },
        viewCount: { type: "integer" },
        publishedAt: { type: "string", format: "date-time", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        deletedAt: { type: "string", format: "date-time", nullable: true },
      },
    },
    Category: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        slug: { type: "string" },
        name: { type: "string" },
        description: { type: "string", nullable: true },
        parentId: { type: "string", format: "uuid", nullable: true },
        sortOrder: { type: "integer" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    CreateContentBody: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string", maxLength: 200 },
        summary: { type: "string", maxLength: 500 },
        body: { type: "string" },
        slug: { type: "string", description: "kebab-case; auto-derived when omitted" },
        categoryId: { type: "string", format: "uuid", nullable: true },
        tags: { type: "array", items: { type: "string" }, maxItems: 20 },
        coverImageUrl: { type: "string", format: "uri", nullable: true },
      },
    },
    SetStatusBody: {
      type: "object",
      required: ["status"],
      properties: {
        status: {
          type: "string",
          enum: ["draft", "pending_review", "published", "archived", "rejected"],
        },
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
  schema: { type: "string" },
};

const listParams = [
  { name: "q", in: "query", required: false, schema: { type: "string" } },
  { name: "categoryId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
  { name: "tag", in: "query", required: false, schema: { type: "string" } },
  {
    name: "sort",
    in: "query",
    required: false,
    schema: { type: "string", enum: ["newest", "oldest", "popular", "title"] },
  },
  { name: "page", in: "query", required: false, schema: { type: "integer", default: 1 } },
  { name: "pageSize", in: "query", required: false, schema: { type: "integer", default: 20 } },
];

export const contentCatalogPaths = {
  "/content": {
    get: {
      tags: ["content"],
      summary: "List published content (filter by category/tag, sortable, paged)",
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
        "409": errorResponse("Slug conflict"),
      },
    },
  },
  "/content/search": {
    get: {
      tags: ["content"],
      summary: "Unified full-text search over published content",
      parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }, ...listParams.slice(1)],
      responses: { "200": envelope("Paginated search results") },
    },
  },
  "/content/mine": {
    get: {
      tags: ["content"],
      summary: "List my own content across all statuses",
      security: [{ session: [] }],
      parameters: listParams,
      responses: { "200": envelope("Paginated owned content"), "401": errorResponse("Auth required") },
    },
  },
  "/content/{id}": {
    get: {
      tags: ["content"],
      summary: "Get a content item by id or slug (published, or own/admin)",
      parameters: [idParam],
      responses: { "200": envelope("Content detail"), "404": errorResponse("Not found") },
    },
    patch: {
      tags: ["content"],
      summary: "Update own content (or any content as admin)",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: {
        "200": envelope("Updated content"),
        "403": errorResponse("Not the owner"),
        "404": errorResponse("Not found"),
        "409": errorResponse("Slug conflict"),
      },
    },
    delete: {
      tags: ["content"],
      summary: "Soft-delete own content (or any content as admin)",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: { "200": envelope("Deleted"), "403": errorResponse("Not the owner"), "404": errorResponse("Not found") },
    },
  },
  "/content/{id}/submit": {
    post: {
      tags: ["content"],
      summary: "Submit own content for moderation review",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: {
        "200": envelope("Submitted (pending_review)"),
        "403": errorResponse("Not the owner"),
        "404": errorResponse("Not found"),
        "409": errorResponse("Invalid status transition"),
      },
    },
  },
  "/categories": {
    get: {
      tags: ["content"],
      summary: "List content categories",
      responses: { "200": envelope("Category list") },
    },
  },
  "/admin/content": {
    get: {
      tags: ["content-admin"],
      summary: "List all content (any status, incl. soft-deleted)",
      security: [{ session: [] }],
      parameters: [
        ...listParams,
        {
          name: "status",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["draft", "pending_review", "published", "archived", "rejected"] },
        },
        { name: "authorId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
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
      summary: "Moderate: set content status (publish/reject/archive/…)",
      security: [{ session: [] }],
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/SetStatusBody" } } },
      },
      responses: {
        "200": envelope("Status changed"),
        "404": errorResponse("Not found"),
        "409": errorResponse("Invalid status transition"),
      },
    },
  },
  "/admin/categories": {
    post: {
      tags: ["content-admin"],
      summary: "Create a category",
      security: [{ session: [] }],
      responses: { "201": envelope("Created"), "409": errorResponse("Slug conflict") },
    },
  },
  "/admin/categories/{id}": {
    patch: {
      tags: ["content-admin"],
      summary: "Update a category",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: { "200": envelope("Updated"), "404": errorResponse("Not found") },
    },
    delete: {
      tags: ["content-admin"],
      summary: "Delete a category",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: { "200": envelope("Deleted"), "404": errorResponse("Not found") },
    },
  },
} as const;
