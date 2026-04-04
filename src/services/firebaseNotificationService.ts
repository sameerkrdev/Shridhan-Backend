import logger from "@/config/logger.js";
import env from "@/config/dotenv.js";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

interface RdWaiveFirestorePayload {
  societyId: string;
  requestId: string;
  rdId: string;
  rdCustomerName: string;
  requesterMembershipId: string;
  requesterName: string;
  status: string;
  canAct: boolean;
  approverMembershipIds: string[];
  monthEntries: { monthIndex: number; fine: string }[];
  reduceFromMaturity: boolean;
  expiresAt: string;
  actedByMembershipId?: string;
  notificationType: "RD_FINE_WAIVE_REQUEST";
  module: "rd" | "fd" | "mis";
  accountId: string;
  accountLabel: string;
  routePath: string;
  detailKey?: string;
}

let firestoreClient: Firestore | null | undefined;

const getFirestoreClient = (): Firestore | null => {
  if (firestoreClient !== undefined) return firestoreClient;

  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    logger.warn("Firebase Admin SDK is not configured. Skipping Firestore notification sync.");
    firestoreClient = null;
    return firestoreClient;
  }

  try {
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
    }
    firestoreClient = getFirestore();
  } catch (error) {
    logger.error("Failed to initialize Firebase Admin SDK", { error });
    firestoreClient = null;
  }

  return firestoreClient;
};

export const pushRdWaiveNotificationsToFirestore = async (payload: RdWaiveFirestorePayload) => {
  const db = getFirestoreClient();
  if (!db) return;

  const base = {
    type: payload.notificationType,
    notificationType: payload.notificationType,
    requestId: payload.requestId,
    rdId: payload.rdId,
    rdCustomerName: payload.rdCustomerName,
    module: payload.module,
    accountId: payload.accountId,
    accountLabel: payload.accountLabel,
    routePath: payload.routePath,
    detailKey: payload.detailKey ?? payload.requestId,
    requesterMembershipId: payload.requesterMembershipId,
    requesterName: payload.requesterName,
    status: payload.status,
    monthEntries: payload.monthEntries,
    reduceFromMaturity: payload.reduceFromMaturity,
    expiresAt: payload.expiresAt,
    actedByMembershipId: payload.actedByMembershipId ?? null,
    updatedAt: new Date().toISOString(),
  };

  const nowIso = new Date().toISOString();
  const writes = payload.approverMembershipIds.map(async (membershipId) => {
    const docId = `${payload.requestId}_${membershipId}`;
    const body = {
      ...base,
      docId,
      targetMembershipId: membershipId,
      canAct: payload.canAct,
      createdAt: nowIso,
      isRead: false,
      readAt: null,
    };
    try {
      await db
        .doc(`societies/${payload.societyId}/notifications/${docId}`)
        .set(body, { merge: true });
    } catch (error) {
      logger.error("Firestore notification sync failed", {
        requestId: payload.requestId,
        docId,
        error,
      });
    }
  });
  await Promise.all(writes);
  logger.info("RD waive notifications synced to Firestore", {
    requestId: payload.requestId,
    targets: payload.approverMembershipIds.length,
    status: payload.status,
  });
};
