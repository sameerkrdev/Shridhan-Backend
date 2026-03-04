import { z } from "zod";

const uuidSchema = z.uuid();
const cuidSchema = z.string().cuid("Invalid member id");
const paymentMethodSchema = z.enum(["UPI", "CASH", "CHEQUE"]);
const transactionTypeSchema = z.enum(["CREDIT", "PAYOUT"]);
const serviceStatusSchema = z.enum(["ACTIVE", "COMPLETED", "CLOSED"]);
const projectTypeStatusSchema = z.enum(["ACTIVE", "SUSPENDED"]);
const emptyStringToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, schema.optional());
const panToUppercaseOptionalSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    return trimmed.toUpperCase();
  },
  z
    .string()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN must be valid (ABCDE1234F)")
    .optional(),
);
const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Phone must be a valid 10-digit Indian number");
const aadhaarSchema = z.string().regex(/^\d{12}$/, "Aadhaar must be exactly 12 digits");
const upiIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/, "UPI ID must be valid (example@bank)");
const relationSchema = z.string().trim().min(2, "Relation is required").max(120);

export const createProjectTypeSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Name is required").max(120),
    duration: z.number().int().min(1, "Duration must be at least 1 month").max(360),
    maturityAmountPerHundred: z
      .number()
      .min(1, "Maturity amount per hundred must be greater than 0")
      .max(100000),
    maturityMultiple: z.number().min(0.1, "Maturity multiple must be greater than 0").max(100),
  }),
});

export const listProjectTypesSchema = z.object({
  query: z.object({
    includeDeleted: z.enum(["true", "false"]).optional().default("false"),
  }),
});

export const createFdAccountSchema = z.object({
  body: z
    .object({
      referrerMembershipId: cuidSchema.optional(),
      customer: z.object({
        fullName: z.string().trim().min(2, "Customer name is required").max(150),
        phone: phoneSchema,
        email: emptyStringToUndefined(z.email("Invalid customer email")),
        address: z.string().max(500).optional(),
        aadhaar: emptyStringToUndefined(aadhaarSchema),
        pan: panToUppercaseOptionalSchema,
      }),
      nominees: z
        .array(
          z.object({
            name: z.string().trim().min(2, "Nominee name is required").max(150),
            phone: phoneSchema,
            relation: relationSchema.optional(),
            address: z.string().max(500).optional(),
            aadhaar: emptyStringToUndefined(aadhaarSchema),
            pan: panToUppercaseOptionalSchema,
          }),
        )
        .min(1, "At least one nominee is required")
        .max(5, "You can add up to 5 nominees only"),
      fd: z.object({
        projectTypeId: uuidSchema,
        depositAmount: z.number().min(1, "Deposit amount must be greater than 0").max(100000000),
        startDate: z.coerce.date(),
        initialPaymentAmount: z
          .number()
          .min(1, "Initial payment amount must be greater than 0")
          .optional(),
      }),
      payment: z.object({
        paymentMethod: paymentMethodSchema.optional(),
        transactionId: emptyStringToUndefined(z.string().max(120)),
        upiId: emptyStringToUndefined(upiIdSchema),
        chequeNumber: emptyStringToUndefined(z.string().min(4).max(120)),
        bankName: emptyStringToUndefined(z.string().min(2).max(120)),
      }),
      documents: z
        .array(
          z.object({
            fileName: z.string().trim().min(1).max(255),
            displayName: z.string().trim().min(1).max(255),
            contentType: z.string().max(120).optional(),
            sizeBytes: z
              .number()
              .int()
              .positive()
              .max(10 * 1024 * 1024)
              .optional(),
          }),
        )
        .optional(),
    })
    .refine((payload) => payload.fd.startDate.getFullYear() >= 2000, {
      message: "Start date must be valid",
      path: ["fd", "startDate"],
    })
    .refine(
      (payload) => {
        const phones = payload.nominees.map((nominee) => nominee.phone);
        return new Set(phones).size === phones.length;
      },
      {
        message: "Nominee phone numbers must be unique",
        path: ["nominees"],
      },
    )
    .refine(
      (payload) =>
        payload.fd.initialPaymentAmount === undefined ||
        payload.fd.initialPaymentAmount <= payload.fd.depositAmount,
      {
        message: "Initial payment amount cannot be greater than deposit amount",
        path: ["fd", "initialPaymentAmount"],
      },
    )
    .superRefine((payload, ctx) => {
      if (payload.payment.paymentMethod === "UPI") {
        if (!payload.payment.upiId) {
          ctx.addIssue({
            code: "custom",
            path: ["payment", "upiId"],
            message: "UPI ID is required for UPI payments",
          });
        }
        if (!payload.payment.transactionId) {
          ctx.addIssue({
            code: "custom",
            path: ["payment", "transactionId"],
            message: "Transaction ID is required for UPI payments",
          });
        }
      }

      if (payload.payment.paymentMethod === "CHEQUE") {
        if (!payload.payment.chequeNumber) {
          ctx.addIssue({
            code: "custom",
            path: ["payment", "chequeNumber"],
            message: "Cheque number is required for cheque payments",
          });
        }
        if (!payload.payment.bankName) {
          ctx.addIssue({
            code: "custom",
            path: ["payment", "bankName"],
            message: "Bank name is required for cheque payments",
          });
        }
      }
    }),
});

export const getFdDetailSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
});

export const listFdAccountsSchema = z.object({
  query: z.object({
    sortBy: z
      .enum([
        "id",
        "customer_name",
        "phone",
        "plan",
        "principal_amount",
        "maturity_amount",
        "start_date",
        "maturity_date",
        "status",
      ])
      .optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    search: z.string().trim().max(120).optional(),
    includeDeleted: z.enum(["true", "false"]).optional().default("false"),
  }),
});

export const addTransactionSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  body: z
    .object({
      type: transactionTypeSchema,
      amount: z.number().min(1, "Transaction amount must be greater than 0").max(100000000),
      paymentMethod: paymentMethodSchema.optional(),
      transactionId: emptyStringToUndefined(z.string().max(120)),
      upiId: emptyStringToUndefined(upiIdSchema),
      bankName: emptyStringToUndefined(z.string().min(2).max(120)),
      chequeNumber: emptyStringToUndefined(z.string().min(4).max(120)),
      month: z.number().int().min(1).max(12).optional(),
    })
    .superRefine((payload, ctx) => {
      if (payload.paymentMethod === "UPI") {
        if (!payload.upiId) {
          ctx.addIssue({
            code: "custom",
            path: ["upiId"],
            message: "UPI ID is required for UPI payments",
          });
        }
        if (!payload.transactionId) {
          ctx.addIssue({
            code: "custom",
            path: ["transactionId"],
            message: "Transaction ID is required for UPI payments",
          });
        }
      }
      if (payload.paymentMethod === "CHEQUE") {
        if (!payload.chequeNumber) {
          ctx.addIssue({
            code: "custom",
            path: ["chequeNumber"],
            message: "Cheque number is required for cheque payments",
          });
        }
        if (!payload.bankName) {
          ctx.addIssue({
            code: "custom",
            path: ["bankName"],
            message: "Bank name is required for cheque payments",
          });
        }
      }
    }),
});

export const requestFdDocumentUploadUrlSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    fileName: z.string().min(1).max(255),
    displayName: z.string().min(1).max(255),
    contentType: z.string().max(120).optional(),
    sizeBytes: z.number().int().positive().optional(),
  }),
});

export const completeFdDocumentUploadSchema = z.object({
  params: z.object({
    id: uuidSchema,
    documentId: uuidSchema,
  }),
});

export const updateFdStatusSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    status: serviceStatusSchema,
  }),
});

export const updateProjectTypeStatusSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    status: projectTypeStatusSchema,
  }),
});

export const deleteFdAccountSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
});

export const deleteProjectTypeSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
});
