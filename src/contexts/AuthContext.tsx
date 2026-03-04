"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
    User,
    GoogleAuthProvider,
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged
} from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { isEmailWhitelisted, isAdminEmailWhitelisted, getUser, createUser, UserData } from "@/lib/firebase/firestore";

interface AuthContextType {
    user: User | null;
    userData: UserData | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    userData: null,
    loading: true,
    signInWithGoogle: async () => { },
    signOut: async () => { },
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setLoading(true);
            if (currentUser) {
                // check domain + whitelist
                const email = currentUser.email || "";
                const isCommschool = email.endsWith("@commschool.org");
                const isWhitelisted = await isEmailWhitelisted(email);

                if (!isCommschool && !isWhitelisted) {
                    console.error("Unauthorized email address:", email);
                    await firebaseSignOut(auth);
                    setUser(null);
                    setUserData(null);
                    alert("Unauthorized account. Must use @commschool.org or be whitelisted.");
                } else {
                    setUser(currentUser);

                    // check if pre-registered admin, might fail if rules arent deployed yet
                    let isAdminEmailObj = false;
                    try {
                        isAdminEmailObj = await isAdminEmailWhitelisted(email);
                    } catch {
                        // rules might not allow reading adminEmails yet
                        console.warn("Could not verify adminEmails collection - check Firestore rules.");
                    }

                    // get or create firestore user doc
                    let data = await getUser(currentUser.uid);

                    if (!data) {
                        const newData = {
                            email: currentUser.email!,
                            name: currentUser.displayName || "Unknown",
                            role: (isAdminEmailObj ? "ADMIN" : "USER") as "USER" | "ADMIN",
                        };
                        await createUser(currentUser.uid, newData);
                        data = await getUser(currentUser.uid);
                    } else if (isAdminEmailObj && data.role !== "ADMIN") {
                        // auto-upgrade if they got added to admin list after first login
                        await createUser(currentUser.uid, {
                            ...data,
                            role: "ADMIN"
                        });
                        data = await getUser(currentUser.uid);
                    }
                    setUserData(data);
                }
            } else {
                setUser(null);
                setUserData(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Error signing in with Google:", error);
            alert("Failed to sign in.");
        }
    };

    const signOut = async () => {
        try {
            await firebaseSignOut(auth);
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, userData, loading, signInWithGoogle, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
