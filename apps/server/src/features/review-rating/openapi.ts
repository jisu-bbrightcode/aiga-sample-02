/**
 * OpenAPI fragment for the review & rating API. Merged into the server's root
 * OpenAPI document (REST + OpenAPI-first, per Standard Stack).
 */

export const reviewRatingComponents = {
  schemas: {
    ReviewAuthor: {
      type: "object",
      required: ["userId", "tier", "isExpert"],
      properties: {
        userId: { type: "string" },
        displayName: { type: "string", nullable: true },
        tier: { type: "string", enum: ["guest", "member", "verified_doctor"] },
        isExpert: { type: "boolean", description: "전문가(의사) 뱃지 표시 여부" },
        expertBadge: { type: "string", nullable: true },
        specialty: { type: "string", nullable: true, description: "진료과목" },
      },
    },
    Review: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        targetUserId: { type: "string" },
        authorId: { type: "string" },
        rating: { type: "integer", minimum: 1, maximum: 5 },
        title: { type: "string", nullable: true },
        body: { type: "string" },
        status: { type: "string", enum: ["active", "deleted"] },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        deletedAt: { type: "string", format: "date-time", nullable: true },
        author: { $ref: "#/components/schemas/ReviewAuthor" },
      },
    },
    RatingSummary: {
      type: "object",
      properties: {
        targetUserId: { type: "string" },
        count: { type: "integer" },
        average: { type: "number", nullable: true, description: "평균 평점 (없으면 null)" },
        distribution: {
          type: "object",
          description: "별점별 개수",
          properties: {
            "1": { type: "integer" },
            "2": { type: "integer" },
            "3": { type: "integer" },
            "4": { type: "integer" },
            "5": { type: "integer" },
          },
        },
      },
    },
    CreateReviewBody: {
      type: "object",
      required: ["rating", "body"],
      properties: {
        rating: { type: "integer", minimum: 1, maximum: 5 },
        title: { type: "string", nullable: true, maxLength: 150 },
        body: { type: "string", minLength: 1, maxLength: 4000 },
      },
    },
    UpdateReviewBody: {
      type: "object",
      description: "At least one field is required.",
      properties: {
        rating: { type: "integer", minimum: 1, maximum: 5 },
        title: { type: "string", nullable: true, maxLength: 150 },
        body: { type: "string", minLength: 1, maxLength: 4000 },
      },
    },
    ReviewPage: {
      type: "object",
      properties: {
        items: { type: "array", items: { $ref: "#/components/schemas/Review" } },
        total: { type: "integer" },
        limit: { type: "integer" },
        offset: { type: "integer" },
      },
    },
  },
} as const;

const reviewResponse = {
  description: "A review",
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/Review" } },
  },
};

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

const targetParam = {
  name: "targetUserId",
  in: "path",
  required: true,
  schema: { type: "string" },
};

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};

export const reviewRatingPaths = {
  "/profiles/{targetUserId}/reviews": {
    get: {
      tags: ["reviews"],
      summary: "List active reviews for a profile",
      parameters: [
        targetParam,
        {
          name: "sort",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["recent", "rating_desc", "rating_asc"], default: "recent" },
        },
        { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
        { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
      ],
      responses: {
        "200": {
          description: "Paginated reviews",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReviewPage" } },
          },
        },
      },
    },
    post: {
      tags: ["reviews"],
      summary: "Write a review for a profile (verified doctors only)",
      security: [{ session: [] }],
      parameters: [targetParam],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/CreateReviewBody" } },
        },
      },
      responses: {
        "201": reviewResponse,
        "400": errorResponse("Validation error"),
        "403": errorResponse("Not a verified doctor / self-review not allowed"),
        "404": errorResponse("Target profile not found"),
        "409": errorResponse("You already reviewed this profile"),
      },
    },
  },
  "/profiles/{targetUserId}/reviews/summary": {
    get: {
      tags: ["reviews"],
      summary: "Rating aggregation for a profile",
      parameters: [targetParam],
      responses: {
        "200": {
          description: "Rating summary",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/RatingSummary" } },
          },
        },
      },
    },
  },
  "/reviews/{id}": {
    get: {
      tags: ["reviews"],
      summary: "Get a single review",
      parameters: [idParam],
      responses: { "200": reviewResponse, "404": errorResponse("Not found") },
    },
    patch: {
      tags: ["reviews"],
      summary: "Edit your own review",
      security: [{ session: [] }],
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/UpdateReviewBody" } },
        },
      },
      responses: {
        "200": reviewResponse,
        "400": errorResponse("Validation error"),
        "403": errorResponse("Not your review"),
        "404": errorResponse("Not found"),
      },
    },
    delete: {
      tags: ["reviews"],
      summary: "Delete a review (author or admin)",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: {
        "200": {
          description: "Soft-deleted review reference",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  status: { type: "string", enum: ["deleted"] },
                  deletedAt: { type: "string", format: "date-time", nullable: true },
                },
              },
            },
          },
        },
        "403": errorResponse("Not permitted"),
        "404": errorResponse("Not found"),
      },
    },
  },
} as const;
