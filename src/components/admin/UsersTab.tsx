import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../store/AuthContext';
import { VALID_ROLES } from '../../lib/roles';
import type { UserDoc, UserRole, UserStatus } from '../../lib/roles';

interface UserEntry extends UserDoc {
    id: string;
}

export default function UsersTab() {
    const { user } = useAuth();
    const [users, setUsers] = useState<UserEntry[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserEntry | null>(null);
    const [updating, setUpdating] = useState(false);
    const [editRoles, setEditRoles] = useState<UserRole[]>([]);
    const [rejectNote, setRejectNote] = useState('');
    const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');

    useEffect(() => {
        const q = query(collection(db, 'users'), orderBy('appliedAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserEntry)));
        });
        return unsub;
    }, []);

    const pendingUsers = users.filter(u => u.status === 'pending');
    const activeUsers = users.filter(u => u.status === 'active');
    const disabledUsers = users.filter(u => u.status === 'disabled');

    const displayedUsers = statusFilter === 'all' ? users : users.filter(u => u.status === statusFilter);

    const approveUser = async (u: UserEntry) => {
        if (editRoles.length === 0) {
            alert('Select at least one role to assign.');
            return;
        }
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'users', u.id), {
                status: 'active',
                roles: editRoles,
                approvedAt: serverTimestamp(),
                approvedBy: user?.uid ?? null,
            });
            setSelectedUser(null);
        } finally {
            setUpdating(false);
        }
    };

    const rejectUser = async (u: UserEntry) => {
        if (!rejectNote.trim()) {
            alert('Please provide a reason for rejection.');
            return;
        }
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'users', u.id), {
                status: 'disabled',
                approvedBy: user?.uid ?? null,
                rejectionNote: rejectNote,
            });
            setSelectedUser(null);
            setRejectNote('');
        } finally {
            setUpdating(false);
        }
    };

    const updateRoles = async (u: UserEntry) => {
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'users', u.id), { roles: editRoles });
            setSelectedUser(null);
        } finally {
            setUpdating(false);
        }
    };

    const toggleStatus = async (u: UserEntry, newStatus: UserStatus) => {
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'users', u.id), { status: newStatus });
        } finally {
            setUpdating(false);
        }
    };

    const selectUser = (u: UserEntry) => {
        setSelectedUser(u);
        setEditRoles([...u.roles]);
        setRejectNote('');
    };

    const toggleRole = (role: UserRole) => {
        setEditRoles(prev =>
            prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
        );
    };

    const formatDate = (ts: { seconds: number } | null) => {
        if (!ts) return '—';
        return new Date(ts.seconds * 1000).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
        });
    };

    const roleBadge = (role: string) => {
        const colors: Record<string, string> = {
            'signal-reviewer': 'bg-cyan-400/10 text-cyan-400',
            'discovery-reviewer': 'bg-purple-400/10 text-purple-400',
            'scoring-reviewer': 'bg-orange-400/10 text-orange-400',
            'editor': 'bg-blue-400/10 text-blue-400',
            'lead': 'bg-emerald-400/10 text-emerald-400',
        };
        return colors[role] ?? 'bg-gray-400/10 text-gray-400';
    };

    // Suppress unused variable warnings for TS strict mode
    void disabledUsers;

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-7rem)]">
            {/* Left: User List */}
            <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/10 overflow-y-auto shrink-0">
                {/* Filter */}
                <div className="flex gap-2 p-3 border-b border-white/10">
                    {(['all', 'pending', 'active', 'disabled'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`text-[10px] px-2 py-1 rounded uppercase tracking-wider ${
                                statusFilter === s ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {s} {s === 'pending' && pendingUsers.length > 0 && (
                                <span className="ml-1 text-yellow-400">({pendingUsers.length})</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Pending section (highlighted) */}
                {statusFilter !== 'disabled' && pendingUsers.length > 0 && (
                    <div className="border-b border-yellow-400/20">
                        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-yellow-400 bg-yellow-400/5">
                            Pending Applications ({pendingUsers.length})
                        </div>
                        {pendingUsers.map(u => (
                            <button
                                key={u.id}
                                onClick={() => selectUser(u)}
                                className={`w-full px-3 py-2 text-left hover:bg-white/5 transition-colors flex items-center gap-3 ${
                                    selectedUser?.id === u.id ? 'bg-white/10' : ''
                                }`}
                            >
                                {u.photoURL ? (
                                    <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                                        {u.displayName?.[0] ?? '?'}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm text-white truncate">{u.displayName}</div>
                                    <div className="text-[10px] text-yellow-400">
                                        Wants: {u.appliedRoles.join(', ')}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Active/All users */}
                {(statusFilter === 'all' ? activeUsers : displayedUsers.filter(u => u.status !== 'pending')).map(u => (
                    <button
                        key={u.id}
                        onClick={() => selectUser(u)}
                        className={`w-full px-3 py-2 text-left hover:bg-white/5 transition-colors flex items-center gap-3 ${
                            selectedUser?.id === u.id ? 'bg-white/10' : ''
                        }`}
                    >
                        {u.photoURL ? (
                            <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                                {u.displayName?.[0] ?? '?'}
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="text-sm text-white truncate">{u.displayName}</div>
                            <div className="flex gap-1 flex-wrap">
                                {u.roles.map(r => (
                                    <span key={r} className={`text-[9px] px-1.5 py-0.5 rounded ${roleBadge(r)}`}>
                                        {r}
                                    </span>
                                ))}
                            </div>
                        </div>
                        {u.status === 'disabled' && (
                            <span className="text-[9px] text-red-400">disabled</span>
                        )}
                    </button>
                ))}

                {displayedUsers.length === 0 && (
                    <div className="p-6 text-center text-gray-600 text-sm">No users found</div>
                )}
            </div>

            {/* Right: Detail Panel */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
                {!selectedUser ? (
                    <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                        Select a user to view details
                    </div>
                ) : (
                    <div className="max-w-xl space-y-6">
                        {/* User header */}
                        <div className="flex items-center gap-4">
                            {selectedUser.photoURL ? (
                                <img src={selectedUser.photoURL} alt="" className="w-14 h-14 rounded-full" />
                            ) : (
                                <div className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center text-lg text-gray-400">
                                    {selectedUser.displayName?.[0] ?? '?'}
                                </div>
                            )}
                            <div>
                                <h2 className="text-lg font-bold text-white">{selectedUser.displayName}</h2>
                                <p className="text-sm text-gray-400">{selectedUser.email}</p>
                                <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${
                                    selectedUser.status === 'active' ? 'bg-green-400/10 text-green-400' :
                                    selectedUser.status === 'pending' ? 'bg-yellow-400/10 text-yellow-400' :
                                    'bg-red-400/10 text-red-400'
                                }`}>
                                    {selectedUser.status}
                                </span>
                            </div>
                        </div>

                        {/* Application info */}
                        {selectedUser.applicationNote && (
                            <div className="bg-white/5 rounded p-4">
                                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Application Note</div>
                                <p className="text-sm text-gray-300">{selectedUser.applicationNote}</p>
                                <div className="text-[10px] text-gray-600 mt-2">
                                    Applied: {formatDate(selectedUser.appliedAt)} · Requested: {selectedUser.appliedRoles.join(', ')}
                                </div>
                            </div>
                        )}

                        {/* Activity */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white/5 rounded p-3">
                                <div className="text-[10px] uppercase tracking-wider text-gray-500">Last Active</div>
                                <div className="text-sm text-white mt-1">{formatDate(selectedUser.lastActiveAt)}</div>
                            </div>
                            <div className="bg-white/5 rounded p-3">
                                <div className="text-[10px] uppercase tracking-wider text-gray-500">Total Reviews</div>
                                <div className="text-sm text-white mt-1">{selectedUser.totalReviews}</div>
                            </div>
                        </div>

                        {/* Role management */}
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                                {selectedUser.status === 'pending' ? 'Assign Roles' : 'Current Roles'}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {VALID_ROLES.map(role => (
                                    <button
                                        key={role}
                                        onClick={() => toggleRole(role)}
                                        className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                                            editRoles.includes(role)
                                                ? `${roleBadge(role)} border-current`
                                                : 'border-white/10 text-gray-500 hover:text-gray-300'
                                        }`}
                                    >
                                        {role}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-3">
                            {selectedUser.status === 'pending' && (
                                <>
                                    <button
                                        onClick={() => approveUser(selectedUser)}
                                        disabled={updating || editRoles.length === 0}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
                                    >
                                        {updating ? 'Approving...' : 'Approve'}
                                    </button>
                                    <div className="w-full">
                                        <textarea
                                            value={rejectNote}
                                            onChange={e => setRejectNote(e.target.value)}
                                            placeholder="Rejection reason (required)..."
                                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-600 resize-none"
                                            rows={2}
                                        />
                                        <button
                                            onClick={() => rejectUser(selectedUser)}
                                            disabled={updating || !rejectNote.trim()}
                                            className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
                                        >
                                            {updating ? 'Rejecting...' : 'Reject'}
                                        </button>
                                    </div>
                                </>
                            )}

                            {selectedUser.status === 'active' && (
                                <>
                                    <button
                                        onClick={() => updateRoles(selectedUser)}
                                        disabled={updating}
                                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
                                    >
                                        {updating ? 'Saving...' : 'Update Roles'}
                                    </button>
                                    <button
                                        onClick={() => toggleStatus(selectedUser, 'disabled')}
                                        disabled={updating}
                                        className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm rounded transition-colors"
                                    >
                                        Deactivate
                                    </button>
                                </>
                            )}

                            {selectedUser.status === 'disabled' && (
                                <button
                                    onClick={() => toggleStatus(selectedUser, 'active')}
                                    disabled={updating}
                                    className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
                                >
                                    {updating ? 'Reactivating...' : 'Reactivate'}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
