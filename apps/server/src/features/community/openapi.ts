/**
 * OpenAPI fragment for the community API. Merged into the server's root OpenAPI
 * document (REST + OpenAPI-first, per Standard Stack). Kept in sync with
 * `routes.ts` / `validation.ts`.
 */

export const communityComponents = {
  schemas: {
    CommunityAuthor: {
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
    CommunityPost: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        authorId: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        category: { type: "string", nullable: true },
        status: { type: "string", enum: ["active", "removed", "deleted"] },
        pinned: { type: "boolean" },
        locked: { type: "boolean" },
        crosspostOf: { type: "string", format: "uuid", nullable: true },
        viewCount: { type: "integer" },
        reactionCount: { type: "integer" },
        author: { $ref: "#/components/schemas/CommunityAuthor" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        deletedAt: { type: "string", format: "date-time", nullable: true },
      },
    },
    CommunityComment: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        postId: { type: "string", format: "uuid" },
        authorId: { type: "string" },
        body: { type: "string" },
        status: { type: "string", enum: ["active", "removed", "deleted"] },
        sticky: { type: "boolean" },
        distinguished: { type: "boolean" },
        author: { $ref: "#/components/schemas/CommunityAuthor" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    CommunityReactionResult: {
      type: "object",
      properties: {
        postId: { type: "string", format: "uuid" },
        userId: { type: "string" },
        kind: {
          type: "string",
          enum: ["like", "upvote", "downvote"],
          nullable: true,
        },
        reactionCount: { type: "integer" },
        changed: { type: "boolean" },
      },
    },
    CommunityModerationEntry: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        actorId: { type: "string", description: "관리자 (audit actor)" },
        action: { type: "string" },
        targetType: {
          type: "string",
          enum: ["post", "comment", "user", "keyword", "content"],
        },
        targetId: { type: "string" },
        reason: { type: "string", nullable: true },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    CreatePostBody: {
      type: "object",
      required: ["title", "body"],
      properties: {
        title: { type: "string", minLength: 1, maxLength: 200 },
        body: { type: "string", minLength: 1, maxLength: 20000 },
        category: { type: "string", nullable: true, maxLength: 60 },
      },
    },
    CreateCommentBody: {
      type: "object",
      required: ["body"],
      properties: { body: { type: "string", minLength: 1, maxLength: 4000 } },
    },
    ReactionBody: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["like", "upvote", "downvote"], default: "like" },
      },
    },
  },
} as const;

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

const postResponse = {
  description: "A community post",
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/CommunityPost" } },
  },
};

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const postIdParam = {
  name: "postId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};

export const communityPaths = {
  "/community/posts": {
    get: {
      tags: ["community"],
      summary: "List community posts",
      parameters: [
        {
          name: "sort",
          in: "query",
          schema: { type: "string", enum: ["recent", "popular"], default: "recent" },
        },
        { name: "category", in: "query", schema: { type: "string" } },
        { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
      ],
      responses: { "200": { description: "Paginated posts" } },
    },
    post: {
      tags: ["community"],
      summary: "Create a post (member+)",
      security: [{ session: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/CreatePostBody" } },
        },
      },
      responses: {
        "201": postResponse,
        "400": errorResponse("Validation error"),
        "403": errorResponse("Guest tier cannot participate"),
      },
    },
  },
  "/community/posts/{id}": {
    get: {
      tags: ["community"],
      summary: "Get a post (열람; subject to daily view limit)",
      parameters: [idParam],
      responses: {
        "200": postResponse,
        "404": errorResponse("Not found"),
        "429": errorResponse("POST_VIEW_DAILY_LIMIT_EXCEEDED"),
      },
    },
    patch: {
      tags: ["community"],
      summary: "Edit your own post",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: {
        "200": postResponse,
        "403": errorResponse("Not your post"),
        "404": errorResponse("Not found"),
      },
    },
    delete: {
      tags: ["community"],
      summary: "Delete your own post (author or admin)",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: {
        "200": { description: "Soft-deleted post reference" },
        "403": errorResponse("Not permitted"),
        "404": errorResponse("Not found"),
      },
    },
  },
  "/community/posts/{id}/moderation": {
    post: {
      tags: ["community", "moderation"],
      summary: "Pin/lock/remove/restore/crosspost a post (admin)",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: {
        "200": { description: "Updated post + audit entry" },
        "403": errorResponse("Admin required"),
        "404": errorResponse("Not found"),
      },
    },
  },
  "/community/posts/{postId}/comments": {
    get: {
      tags: ["community"],
      summary: "List a post's comments",
      parameters: [postIdParam],
      responses: { "200": { description: "Comments" }, "404": errorResponse("Not found") },
    },
    post: {
      tags: ["community"],
      summary: "Comment on a post (member+)",
      security: [{ session: [] }],
      parameters: [postIdParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CreateCommentBody" },
          },
        },
      },
      responses: {
        "201": { description: "Created comment" },
        "403": errorResponse("Guest tier cannot participate"),
        "404": errorResponse("Post not found"),
      },
    },
  },
  "/community/comments/{id}": {
    patch: {
      tags: ["community"],
      summary: "Edit your own comment",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: {
        "200": { description: "Updated comment" },
        "403": errorResponse("Not your comment"),
        "404": errorResponse("Not found"),
      },
    },
    delete: {
      tags: ["community"],
      summary: "Delete your own comment (author or admin)",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: {
        "200": { description: "Soft-deleted comment reference" },
        "403": errorResponse("Not permitted"),
        "404": errorResponse("Not found"),
      },
    },
  },
  "/community/comments/{id}/moderation": {
    post: {
      tags: ["community", "moderation"],
      summary: "Sticky/distinguish/remove a comment (admin)",
      security: [{ session: [] }],
      parameters: [idParam],
      responses: {
        "200": { description: "Updated comment + audit entry" },
        "403": errorResponse("Admin required"),
        "404": errorResponse("Not found"),
      },
    },
  },
  "/community/posts/{postId}/reactions": {
    post: {
      tags: ["community"],
      summary: "React to a post (idempotent)",
      security: [{ session: [] }],
      parameters: [postIdParam],
      requestBody: {
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/ReactionBody" } },
        },
      },
      responses: {
        "201": { description: "Reaction created" },
        "200": { description: "Idempotent (already reacted)" },
        "403": errorResponse("Guest tier cannot participate"),
        "404": errorResponse("Post not found"),
      },
    },
    delete: {
      tags: ["community"],
      summary: "Remove your reaction",
      security: [{ session: [] }],
      parameters: [postIdParam],
      responses: {
        "200": { description: "Reaction removed (count decremented)" },
        "403": errorResponse("Guest tier cannot participate"),
      },
    },
  },
  "/community/moderation/sanctions": {
    post: {
      tags: ["community", "moderation"],
      summary: "Sanction a user (admin)",
      security: [{ session: [] }],
      responses: {
        "200": { description: "Audit entry" },
        "403": errorResponse("Admin required"),
        "404": errorResponse("Target user not found"),
      },
    },
  },
  "/community/moderation/keyword-filters": {
    post: {
      tags: ["community", "moderation"],
      summary: "Add a keyword filter (admin)",
      security: [{ session: [] }],
      responses: {
        "200": { description: "Audit entry" },
        "403": errorResponse("Admin required"),
      },
    },
  },
  "/community/moderation/content-actions": {
    post: {
      tags: ["community", "moderation"],
      summary: "Generic content-moderation action (admin)",
      security: [{ session: [] }],
      responses: {
        "200": { description: "Audit entry" },
        "403": errorResponse("Admin required"),
        "404": errorResponse("Target not found"),
      },
    },
  },
} as const;
