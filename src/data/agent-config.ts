import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { AgentConfigDataClient } from "./client";

export const agentConfigClient: AgentConfigDataClient = {
  async getAgentConfig(agentId: string): Promise<Record<string, unknown> | null> {
    const snap = await getDoc(doc(db, "agents", agentId, "config", "current"));
    if (!snap.exists()) return null;
    return snap.data() as Record<string, unknown>;
  },

  async updateAgentConfig(agentId: string, config: Record<string, unknown>): Promise<void> {
    await setDoc(doc(db, "agents", agentId, "config", "current"), config, { merge: true });
  },
};
