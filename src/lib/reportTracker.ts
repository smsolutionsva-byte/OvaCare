import {
  Timestamp,
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import type { LabMarker } from "@/lib/labReportParser";
import { getFirebaseDb } from "@/lib/firebase";

export type ReportSource = "ocr" | "manual";

export type ReportSnapshotInput = {
  testDate: string;
  reportTitle: string;
  source: ReportSource;
  markers: LabMarker[];
  note?: string;
};

export type ReportSnapshot = ReportSnapshotInput & {
  id: string;
  createdAt: string;
};

const normalizeDate = (value: unknown) => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
};

const userReportsCollection = (uid: string) => {
  const db = getFirebaseDb();
  return collection(db, "users", uid, "labReports");
};

export const saveReportSnapshot = async (uid: string, payload: ReportSnapshotInput) => {
  if (!uid) throw new Error("User must be signed in.");

  const docRef = await addDoc(userReportsCollection(uid), {
    ...payload,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
};

export const getReportSnapshots = async (uid: string) => {
  if (!uid) throw new Error("User must be signed in.");

  const snapshot = await getDocs(userReportsCollection(uid));

  return snapshot.docs.map((doc) => {
    const data = doc.data() as {
      testDate?: string;
      reportTitle?: string;
      source?: ReportSource;
      markers?: LabMarker[];
      note?: string;
      createdAt?: Timestamp | string;
    };

    return {
      id: doc.id,
      testDate: data.testDate || "",
      reportTitle: data.reportTitle || "Untitled report",
      source: data.source || "ocr",
      markers: Array.isArray(data.markers) ? data.markers : [],
      note: data.note || "",
      createdAt: normalizeDate(data.createdAt),
    } satisfies ReportSnapshot;
  });
};
