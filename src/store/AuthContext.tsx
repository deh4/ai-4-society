import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { UserDoc, UserRole } from '../lib/roles';
import { syncPreferences } from "../data/preferences";

interface AuthContextType {
    user: User | null;
    /** Backward compat — true if user has any active role */
    isAdmin: boolean;
    /** Full user document from /users/{uid}, null if not a contributor */
    userDoc: UserDoc | null;
    loading: boolean;
    signIn: () => Promise<void>;
    logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const googleProvider = new GoogleAuthProvider();

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
    const [loading, setLoading] = useState(true);
    const lastActivityRef = useRef<number>(0);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);
            if (firebaseUser) {
                try {
                    // Try /users/{uid} first (new RBAC system)
                    const userRef = doc(db, 'users', firebaseUser.uid);
                    const userSnap = await getDoc(userRef);

                    if (userSnap.exists()) {
                        setUserDoc(userSnap.data() as UserDoc);
                    } else {
                        // Migration: check legacy /admins/{uid}
                        const adminRef = doc(db, 'admins', firebaseUser.uid);
                        const adminSnap = await getDoc(adminRef);
                        if (adminSnap.exists()) {
                            // Auto-migrate: create /users doc with lead role
                            const migratedDoc: UserDoc = {
                                email: firebaseUser.email ?? '',
                                displayName: firebaseUser.displayName ?? '',
                                photoURL: firebaseUser.photoURL ?? null,
                                roles: ['lead'] as UserRole[],
                                status: 'active',
                                appliedRoles: ['lead'] as UserRole[],
                                applicationNote: 'Auto-migrated from legacy admin',
                                appliedAt: null,
                                approvedAt: null,
                                approvedBy: 'system-migration',
                                lastActiveAt: null,
                                totalReviews: 0,
                                acknowledgedAt: null,
                                onboardingCompleted: {},
                            };
                            await setDoc(userRef, {
                                ...migratedDoc,
                                appliedAt: serverTimestamp(),
                                approvedAt: serverTimestamp(),
                                lastActiveAt: serverTimestamp(),
                            });
                            setUserDoc(migratedDoc);
                        } else {
                            setUserDoc(null);
                        }
                    }
                } catch (err) {
                    console.error('Failed to load user document:', err);
                    setUserDoc(null);
                }
                // Sync preferences from localStorage → Firestore on sign-in
                syncPreferences(firebaseUser.uid).catch((err) =>
                  console.error("Failed to sync preferences:", err)
                );
            } else {
                setUserDoc(null);
            }
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    // Throttled activity tracking: update lastActiveAt at most once per hour
    useEffect(() => {
        if (!user || !userDoc || userDoc.status !== 'active') return;
        const now = Date.now();
        if (now - lastActivityRef.current < 3600_000) return;
        lastActivityRef.current = now;
        const userRef = doc(db, 'users', user.uid);
        updateDoc(userRef, { lastActiveAt: serverTimestamp() }).catch(() => {});
    }, [user, userDoc]);

    const signIn = async () => {
        await signInWithPopup(auth, googleProvider);
    };

    const logOut = async () => {
        await signOut(auth);
    };

    const isAdmin = userDoc !== null && userDoc.status === 'active' && userDoc.roles.length > 0;

    return (
        <AuthContext.Provider value={{ user, isAdmin, userDoc, loading, signIn, logOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
