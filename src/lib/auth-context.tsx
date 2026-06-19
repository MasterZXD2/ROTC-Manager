"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase";
import type { UserDoc } from "./types";

const BOOTSTRAP_EMAIL = "goten8615xd@gmail.com";

interface AuthState {
  loading: boolean;
  fbUser: User | null;
  userDoc: UserDoc | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/** สร้าง user doc ครั้งแรกถ้ายังไม่มี — ทำหน้าที่แทน auth trigger เดิม */
async function ensureUserDoc(u: User) {
  const ref = doc(db(), "users", u.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  const isBootstrap =
    (u.email ?? "").toLowerCase() === BOOTSTRAP_EMAIL.toLowerCase();
  await setDoc(ref, {
    uid: u.uid,
    email: u.email ?? "",
    role: isBootstrap ? "top_admin" : "student",
    fullName: "",
    nickname: "",
    classroom: "",
    studentId: "",
    year: 0,
    photoURL: u.photoURL ?? "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth(), async (u) => {
      setFbUser(u);
      if (!u) {
        setUserDoc(null);
        setLoading(false);
        return;
      }
      try {
        await ensureUserDoc(u);
      } catch (e) {
        console.error("ensureUserDoc failed", e);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!fbUser) return;
    const unsub = onSnapshot(
      doc(db(), "users", fbUser.uid),
      (snap) => {
        setUserDoc(snap.exists() ? (snap.data() as UserDoc) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [fbUser]);

  const signIn = async () => {
    await signInWithPopup(auth(), googleProvider());
  };
  const signOut = async () => {
    await fbSignOut(auth());
  };

  return (
    <Ctx.Provider value={{ loading, fbUser, userDoc, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
