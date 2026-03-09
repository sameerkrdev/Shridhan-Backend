import { z } from "zod";

const uuidSchema = z.uuid();
const cuidSchema = z.string().cuid("Invalid member id");
const paymentMethodSchema = z.enum(["UPI", "CASH", "CHEQUE"]);
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

export const createMisProjectTypeSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2, "Name is required").max(120),
      duration: z.number().int().min(1, "Duration must be at least 1 month").max(360),
      minimumAmount: z.number().min(1, "Minimum amount must be greater than 0").max(100000000),
      monthlyInterestRate: z
        .number()
        .min(0, "Monthly interest rate cannot be negative")
        .max(100)
        .optional(),
      monthlyInterestPerLakh: z
        .number()
        .min(0, "Monthly interest per thousand cannot be negative")
        .max(1000000)
        .optional(),
      rules: z.string().trim().max(5000).optional(),
    })
    .refine(
      (payload) =>
        payload.monthlyInterestRate !== undefined || payload.monthlyInterestPerLakh !== undefined,
      {
        message: "Provide either monthlyInterestRate or monthlyInterestPerLakh",
        path: ["monthlyInterestRate"],
      },
    )
    .refine(
      (payload) =>
        !(
          payload.monthlyInterestRate !== undefined && payload.monthlyInterestPerLakh !== undefined
        ),
      {
        message: "Provide only one of monthlyInterestRate or monthlyInterestPerLakh",
        path: ["monthlyInterestPerLakh"],
      },
    ),
});

export const listMisProjectTypesSchema = z.object({
  query: z.object({
    includeDeleted: z.enum(["true", "false"]).optional().default("false"),
    includeArchived: z.enum(["true", "false"]).optional().default("false"),
  }),
});

export const createMisAccountSchema = z.object({
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
      mis: z.object({
        projectTypeId: uuidSchema,
        depositAmount: z.number().min(1, "Deposit amount must be greater than 0").max(100000000),
        startDate: z.coerce.date(),
      }),
      payment: z
        .object({
          amount: z.number().min(1, "Payment amount must be greater than 0").optional(),
          paymentMethod: paymentMethodSchema.optional(),
          transactionId: emptyStringToUndefined(z.string().max(120)),
          upiId: emptyStringToUndefined(upiIdSchema),
          chequeNumber: emptyStringToUndefined(z.string().min(4).max(120)),
          bankName: emptyStringToUndefined(z.string().min(2).max(120)),
        })
        .optional(),
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
    .refine((payload) => payload.mis.startDate.getFullYear() >= 2000, {
      message: "Start date must be valid",
      path: ["mis", "startDate"],
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
    .superRefine((payload, ctx) => {
      const payment = payload.payment;
      if (!payment) return;

      if (payment.amount !== undefined && payment.paymentMethod === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["payment", "paymentMethod"],
          message: "Payment method is required when amount is provided",
        });
      }

      if (payment.paymentMethod === "UPI") {
        if (!payment.upiId) {
          ctx.addIssue({
            code: "custom",
            path: ["payment", "upiId"],
            message: "UPI ID is required for UPI payments",
          });
        }
        if (!payment.transactionId) {
          ctx.addIssue({
            code: "custom",
            path: ["payment", "transactionId"],
            message: "Transaction ID is required for UPI payments",
          });
        }
      }

      if (payment.paymentMethod === "CHEQUE") {
        if (!payment.chequeNumber) {
          ctx.addIssue({
            code: "custom",
            path: ["payment", "chequeNumber"],
            message: "Cheque number is required for cheque payments",
          });
        }
        if (!payment.bankName) {
          ctx.addIssue({
            code: "custom",
            path: ["payment", "bankName"],
            message: "Bank name is required for cheque payments",
          });
        }
      }
    }),
});

export const requestMisDocumentUploadUrlSchema = z.object({
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

export const completeMisDocumentUploadSchema = z.object({
  params: z.object({
    id: uuidSchema,
    documentId: uuidSchema,
  }),
});

export const addMisDepositSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  body: z
    .object({
      amount: z.number().min(1, "Deposit amount must be greater than 0").max(100000000),
      paymentMethod: paymentMethodSchema.optional(),
      transactionId: emptyStringToUndefined(z.string().max(120)),
      upiId: emptyStringToUndefined(upiIdSchema),
      bankName: emptyStringToUndefined(z.string().min(2).max(120)),
      chequeNumber: emptyStringToUndefined(z.string().min(4).max(120)),
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

export const payMisInterestSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  body: z
    .object({
      month: z.number().int().min(1).optional(),
      months: z.array(z.number().int().min(1)).min(1).optional(),
      amount: z.number().min(1, "Interest payout amount must be greater than 0").max(100000000),
      paymentMethod: paymentMethodSchema.optional(),
      transactionId: emptyStringToUndefined(z.string().max(120)),
      upiId: emptyStringToUndefined(upiIdSchema),
      bankName: emptyStringToUndefined(z.string().min(2).max(120)),
      chequeNumber: emptyStringToUndefined(z.string().min(4).max(120)),
    })
    .refine((payload) => payload.month !== undefined || payload.months !== undefined, {
      message: "Provide either month or months",
      path: ["month"],
    })
    .refine((payload) => !(payload.month !== undefined && payload.months !== undefined), {
      message: "Provide only one of month or months",
      path: ["months"],
    })
    .superRefine((payload, ctx) => {
      if (payload.months) {
        const deduplicated = new Set(payload.months);
        if (deduplicated.size !== payload.months.length) {
          ctx.addIssue({
            code: "custom",
            path: ["months"],
            message: "Duplicate month values are not allowed",
          });
        }
      }

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

export const returnMisPrincipalSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    paymentMethod: paymentMethodSchema.optional(),
    transactionId: emptyStringToUndefined(z.string().max(120)),
    upiId: emptyStringToUndefined(upiIdSchema),
    bankName: emptyStringToUndefined(z.string().min(2).max(120)),
    chequeNumber: emptyStringToUndefined(z.string().min(4).max(120)),
  }),
});

export const getMisDetailSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
});

export const listMisAccountsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z
      .enum([
        "id",
        "customer_name",
        "phone",
        "deposit_amount",
        "monthly_interest",
        "maturity_date",
        "status",
      ])
      .optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    search: z.string().trim().max(120).optional(),
    includeDeleted: z.enum(["true", "false"]).optional().default("false"),
  }),
});
