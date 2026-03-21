import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../store/AuthContext";
import type { UserRole } from "../../lib/roles";

interface UserEntry {
  id: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  roles: UserRole[];
  status: string;
}

interface Props {
  currentAssignee?: string | null;
  /** Only show users who have at least one of these roles */
  allowedRoles: UserRole[];
  onAssign: (uid: string | null) => void;
}

export function AssigneeDropdown({ currentAssignee, allowedRoles, onAssign }: Props) {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as UserEntry))
        .filter(
          (u) =>
            u.status === "active" &&
            u.roles?.some((r) => allowedRoles.includes(r)),
        )
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      setUsers(docs);
    });
    return unsub;
  }, [allowedRoles]);

  const assignee = users.find((u) => u.id === currentAssignee);
  const isMe = currentAssignee === user?.uid;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded bg-white/5 border border-white/10 hover:border-white/20 transition-colors"
      >
        {assignee ? (
          <>
            {assignee.photoURL && (
              <img src={assignee.photoURL} alt="" className="w-4 h-4 rounded-full" />
            )}
            <span className="text-white/80">
              {isMe ? "You" : assignee.displayName || assignee.email}
            </span>
          </>
        ) : (
          <span className="text-white/40">Unassigned</span>
        )}
        <span className="text-white/30">▾</span>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-gray-900 border border-white/10 rounded-lg shadow-xl min-w-[200px] max-h-48 overflow-y-auto">
          {/* Unassign option */}
          <button
            onClick={() => { onAssign(null); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs text-white/50 hover:bg-white/5"
          >
            Unassigned
          </button>

          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => { onAssign(u.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 flex items-center gap-2 ${
                u.id === currentAssignee ? "bg-white/10 text-white" : "text-white/70"
              }`}
            >
              {u.photoURL && (
                <img src={u.photoURL} alt="" className="w-4 h-4 rounded-full" />
              )}
              <span>{u.id === user?.uid ? `${u.displayName} (You)` : u.displayName || u.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
