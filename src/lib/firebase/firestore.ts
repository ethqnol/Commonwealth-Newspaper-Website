import { db } from "./config";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp
} from "firebase/firestore";


export interface UserData {
    email: string;
    name: string;
    role: "USER" | "ADMIN";
    createdAt: any;
}

export interface Article {
    id?: string;
    title: string;
    content: string;
    author: string;
    slug: string;
    period: string; // e.g. "Spring 2026"
    isPublished: boolean;
    isFeatured?: boolean;      // lead story on homepage
    isArchived?: boolean;
    type?: "STORY" | "UPDATE"; // legacy, doesnt do anything anymore
    category?: string;          // e.g. "News", "Opinion", "Features", "Sports", "Arts & Culture"
    coverImageUrl?: string; // hero img url from firebase storage
    createdAt: any;
}

export interface WhitelistedEmail {
    id?: string;
    email: string;
}

export interface AdminEmail {
    id?: string;
    email: string;
}


export async function getUser(uid: string): Promise<UserData | null> {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data() as UserData;
    }
    return null;
}

export async function createUser(uid: string, data: Partial<UserData>): Promise<void> {
    const docRef = doc(db, "users", uid);
    await setDoc(docRef, {
        ...data,
        role: data.role || "USER",
        createdAt: serverTimestamp()
    }, { merge: true });
}

export async function isUserAdmin(uid: string): Promise<boolean> {
    const user = await getUser(uid);
    return user?.role === "ADMIN";
}

export async function getAllUsers(): Promise<(UserData & { id: string })[]> {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as UserData & { id: string }));
}

export async function updateUserRole(uid: string, role: "USER" | "ADMIN"): Promise<void> {
    const docRef = doc(db, "users", uid);
    await updateDoc(docRef, { role });
}


export async function isEmailWhitelisted(email: string): Promise<boolean> {
    const q = query(collection(db, "whitelistedEmails"), where("email", "==", email));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
}


export async function isAdminEmailWhitelisted(email: string): Promise<boolean> {
    const q = query(collection(db, "adminEmails"), where("email", "==", email));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
}

export async function getAdminEmails(): Promise<AdminEmail[]> {
    const q = query(collection(db, "adminEmails"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
        id: doc.id,
        email: doc.data().email
    }));
}

export async function addAdminEmail(email: string): Promise<void> {
    const isAlreadyAdmin = await isAdminEmailWhitelisted(email);
    if (!isAlreadyAdmin) {
        await addDoc(collection(db, "adminEmails"), { email });
    }
}

export async function removeAdminEmail(id: string): Promise<void> {
    await deleteDoc(doc(db, "adminEmails", id));
}


export async function getPublishedArticles(): Promise<Article[]> {
    const q = query(
        collection(db, "articles"),
        where("isPublished", "==", true),
        orderBy("createdAt", "desc")
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs
        .map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Article))
        .filter(article => !article.isArchived); // old docs might not have isArchived field
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
    const q = query(
        collection(db, "articles"),
        where("slug", "==", slug),
        where("isPublished", "==", true)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        const article = { id: doc.id, ...doc.data() } as Article;
        if (article.isArchived) return null;
        return article;
    }
    return null;
}


export async function getAllArticles(): Promise<Article[]> {
    const q = query(collection(db, "articles"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as Article));
}

export async function createArticle(data: Omit<Article, "id" | "createdAt">): Promise<string> {
    const docRef = await addDoc(collection(db, "articles"), {
        ...data,
        createdAt: serverTimestamp()
    });
    return docRef.id;
}

export async function updateArticle(id: string, data: Partial<Article>): Promise<void> {
    const docRef = doc(db, "articles", id);
    await updateDoc(docRef, data as any); // fuck you brendan eich, Partial<Article> should just work here
}

export async function deleteArticle(id: string): Promise<void> {
    await deleteDoc(doc(db, "articles", id));
}

export async function archiveArticle(id: string): Promise<void> {
    const docRef = doc(db, "articles", id);
    await updateDoc(docRef, { isArchived: true, isPublished: false });
}

export async function archiveAllArticles(): Promise<void> {
    const q = query(collection(db, "articles"), where("isArchived", "!=", true));
    const querySnapshot = await getDocs(q);

    // not using batched writes bc this is low volume enough to not matter
    const updatePromises = querySnapshot.docs.map(doc =>
        updateDoc(doc.ref, { isArchived: true, isPublished: false })
    );
    await Promise.all(updatePromises);
}

export async function archiveArticlesByDateRange(startDate: Date, endDate: Date): Promise<void> {
    const q = query(
        collection(db, "articles"),
        where("createdAt", ">=", startDate),
        where("createdAt", "<=", endDate)
    );
    const querySnapshot = await getDocs(q);

    const updatePromises = querySnapshot.docs.map(doc => {
        const data = doc.data() as Article;
        if (!data.isArchived) {
            return updateDoc(doc.ref, { isArchived: true, isPublished: false });
        }
        return Promise.resolve(); // return an empty promise that does nothing because map needs a return for some reason
    });
    await Promise.all(updatePromises);
}
