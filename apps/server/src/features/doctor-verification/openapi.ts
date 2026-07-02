/**
 * OpenAPI fragment for the doctor-verification API. Merged into the server's
 * root OpenAPI document (REST + OpenAPI-first, no tRPC — per Standard Stack).
 */

export const doctorVerificationComponents = {
  schemas: {
    ProofDocumentRef: {
      type: 'object',
      required: ['key', 'filename', 'contentType'],
      properties: {
        key: { type: 'string', description: 'Blob storage key (Vercel Blob).' },
        filename: { type: 'string' },
        contentType: { type: 'string' },
      },
    },
    LicenseInfo: {
      type: 'object',
      required: ['licenseNumber', 'licenseName'],
      properties: {
        licenseNumber: { type: 'string', maxLength: 64 },
        licenseName: { type: 'string', maxLength: 128 },
        specialty: { type: 'string', nullable: true, maxLength: 128 },
      },
    },
    VerificationApplication: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        applicantId: { type: 'string', format: 'uuid' },
        status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
        license: { $ref: '#/components/schemas/LicenseInfo' },
        proofDocuments: {
          type: 'array',
          items: { $ref: '#/components/schemas/ProofDocumentRef' },
        },
        rejectionReason: { type: 'string', nullable: true },
        reviewedByAdminId: { type: 'string', format: 'uuid', nullable: true },
        reviewedAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    SubmitApplicationBody: {
      type: 'object',
      required: ['license', 'proofDocuments'],
      properties: {
        license: { $ref: '#/components/schemas/LicenseInfo' },
        proofDocuments: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          items: { $ref: '#/components/schemas/ProofDocumentRef' },
        },
      },
    },
    RejectBody: {
      type: 'object',
      required: ['reason'],
      properties: { reason: { type: 'string', maxLength: 1000 } },
    },
    Error: {
      type: 'object',
      properties: {
        error: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: {},
          },
        },
      },
    },
  },
} as const;

const appResponse = {
  description: 'A verification application',
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/VerificationApplication' } },
  },
};

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

export const doctorVerificationPaths = {
  '/doctor-verification/applications': {
    post: {
      tags: ['doctor-verification'],
      summary: 'Submit a doctor verification application',
      security: [{ session: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/SubmitApplicationBody' } },
        },
      },
      responses: {
        '201': appResponse,
        '400': errorResponse('Validation error'),
        '409': errorResponse('An active application already exists / already verified'),
      },
    },
  },
  '/doctor-verification/applications/reapply': {
    post: {
      tags: ['doctor-verification'],
      summary: 'Re-apply after a rejected application',
      security: [{ session: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/SubmitApplicationBody' } },
        },
      },
      responses: {
        '201': appResponse,
        '400': errorResponse('Validation error'),
        '409': errorResponse('Re-application not allowed'),
      },
    },
  },
  '/doctor-verification/me': {
    get: {
      tags: ['doctor-verification'],
      summary: 'Get my verification status',
      security: [{ session: [] }],
      responses: {
        '200': {
          description: 'Verification status view',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  hasApplication: { type: 'boolean' },
                  application: {
                    $ref: '#/components/schemas/VerificationApplication',
                    nullable: true,
                  },
                  canReapply: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
  },
  '/doctor-verification/applications/{id}': {
    get: {
      tags: ['doctor-verification'],
      summary: 'Get my application by id',
      security: [{ session: [] }],
      parameters: [idParam],
      responses: {
        '200': appResponse,
        '403': errorResponse('Not your application'),
        '404': errorResponse('Not found'),
      },
    },
  },
  '/admin/doctor-verification/applications': {
    get: {
      tags: ['doctor-verification-admin'],
      summary: 'List verification applications',
      security: [{ session: [] }],
      parameters: [
        {
          name: 'status',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
        },
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 20 } },
        { name: 'offset', in: 'query', required: false, schema: { type: 'integer', default: 0 } },
      ],
      responses: {
        '200': {
          description: 'Paginated applications',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/VerificationApplication' },
                  },
                  total: { type: 'integer' },
                  limit: { type: 'integer' },
                  offset: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
  },
  '/admin/doctor-verification/applications/{id}': {
    get: {
      tags: ['doctor-verification-admin'],
      summary: 'Get an application by id',
      security: [{ session: [] }],
      parameters: [idParam],
      responses: { '200': appResponse, '404': errorResponse('Not found') },
    },
  },
  '/admin/doctor-verification/applications/{id}/approve': {
    post: {
      tags: ['doctor-verification-admin'],
      summary: 'Approve an application (upgrade tier + grant expert badge)',
      security: [{ session: [] }],
      parameters: [idParam],
      responses: {
        '200': appResponse,
        '404': errorResponse('Not found'),
        '409': errorResponse('Application is not pending'),
      },
    },
  },
  '/admin/doctor-verification/applications/{id}/reject': {
    post: {
      tags: ['doctor-verification-admin'],
      summary: 'Reject an application with a reason',
      security: [{ session: [] }],
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/RejectBody' } } },
      },
      responses: {
        '200': appResponse,
        '400': errorResponse('Validation error'),
        '404': errorResponse('Not found'),
        '409': errorResponse('Application is not pending'),
      },
    },
  },
} as const;
