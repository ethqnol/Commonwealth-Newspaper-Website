"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import {
    getAllArticles,
    createArticle,
    updateArticle,
    deleteArticle,
    archiveArticle,
    archiveAllArticles,
    archiveArticlesByDateRange,
    getAllUsers,
    updateUserRole,
    getAdminEmails,
    addAdminEmail,
    removeAdminEmail,
    Article,
    UserData,
    AdminEmail
} from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, addDoc, deleteDoc, doc } from "firebase/firestore";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, listAll, deleteObject } from "firebase/storage";
import { RefreshCw, Plus, Edit2, Trash2, Shield, Archive, Calendar, Users, FileText, Image as ImageIcon, Loader2, Sliders } from "lucide-react";
import MDEditor from '@uiw/react-md-editor';

export default function AdminDashboard() {
    const { user, userData, loading: authLoading } = useAuth();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<"ARTICLES" | "USERS" | "IMAGES">("ARTICLES");

    // jpeg quality 0-1, tweak if images are too big
    const [imageQuality, setImageQuality] = useState(0.82);


    const [articles, setArticles] = useState<Article[]>([]);
    const [loadingItems, setLoadingItems] = useState(true);


    const [whitelistedEmails, setWhitelistedEmails] = useState<{ id: string, email: string }[]>([]);
    const [adminEmailsList, setAdminEmailsList] = useState<AdminEmail[]>([]);
    const [newEmail, setNewEmail] = useState("");
    const [newAdminEmail, setNewAdminEmail] = useState("");
    const [allUsers, setAllUsers] = useState<(UserData & { id: string })[]>([]);


    const [isEditing, setIsEditing] = useState(false);
    const [currentArticle, setCurrentArticle] = useState<Partial<Article>>({
        title: "",
        content: "",
        author: "",
        slug: "",
        period: "",
        isPublished: false,
        isFeatured: false,
        type: "STORY",
        category: "News",
        coverImageUrl: "",
    });


    const [showArchiveRange, setShowArchiveRange] = useState(false);
    const [archiveStart, setArchiveStart] = useState("");
    const [archiveEnd, setArchiveEnd] = useState("");


    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);


    const [storageImages, setStorageImages] = useState<{ name: string; url: string; ref: any }[]>([]);
    const [loadingImages, setLoadingImages] = useState(false);

    // cached per-article images
    const [articleImages, setArticleImages] = useState<{ name: string; url: string; ref: any }[]>([]);
    const [loadingArticleImages, setLoadingArticleImages] = useState(false);
    const [articleImagesOpen, setArticleImagesOpen] = useState(true);

    useEffect(() => {
        if (!authLoading) {
            if (!user || userData?.role !== "ADMIN") {
                router.push("/");
            } else {
                loadData();
            }
        }
    }, [user, userData, authLoading, router]);

    const loadData = async () => {
        setLoadingItems(true);
        try {

            const fetchedArticles = await getAllArticles();
            setArticles(fetchedArticles);


            const querySnapshot = await getDocs(collection(db, "whitelistedEmails"));
            const emails = querySnapshot.docs.map(doc => ({
                id: doc.id,
                email: doc.data().email
            }));
            setWhitelistedEmails(emails);


            const adminEmails = await getAdminEmails();
            setAdminEmailsList(adminEmails);


            const users = await getAllUsers();
            setAllUsers(users);
        } catch (error) {
            console.error("Error loading admin data:", error);
        } finally {
            setLoadingItems(false);
        }
    };


    const handleEditClick = (article: Article) => {
        setCurrentArticle(article);
        setIsEditing(true);
        setArticleImages([]);
        if (article.slug) loadArticleImages(article.slug);
    };

    const handleCreateNewClick = () => {
        setCurrentArticle({
            title: "",
            content: "",
            author: user?.displayName || "",
            slug: "",
            period: "Spring 2026",
            isPublished: false,
            isFeatured: false,
            type: "STORY",
            category: "News",
            coverImageUrl: "",
        });
        setIsEditing(true);
    };

    const handleSaveArticle = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentArticle.title || !currentArticle.slug) return;

        setLoadingItems(true);
        try {
            // only one featured at a time - unflag the rest
            if (currentArticle.isFeatured) {
                const otherFeatured = articles.filter(
                    a => a.isFeatured && a.id !== currentArticle.id
                );
                for (const other of otherFeatured) {
                    if (other.id) await updateArticle(other.id, { isFeatured: false });
                }
            }

            if (currentArticle.id) {
                await updateArticle(currentArticle.id, currentArticle);
            } else {
                await createArticle(currentArticle as Omit<Article, 'id' | 'createdAt'>);
            }
            setIsEditing(false);
            await loadData();
        } catch (error) {
            console.error("Error saving article:", error);
            alert("Failed to save article.");
        } finally {
            setLoadingItems(false);
        }
    };

    const handleDeleteArticle = async (id: string) => {
        if (confirm("Are you sure you want to permanently delete this article?")) {
            setLoadingItems(true);
            try {
                await deleteArticle(id);
                await loadData();
            } catch (error) {
                console.error("Error deleting article:", error);
            } finally {
                setLoadingItems(false);
            }
        }
    };

    const handleTogglePublish = async (article: Article, publish: boolean) => {
        if (!article.id) return;
        setLoadingItems(true);
        try {
            await updateArticle(article.id, { isPublished: publish });
            await loadData();
        } catch (error) {
            console.error("Error updating publish status:", error);
        } finally {
            setLoadingItems(false);
        }
    };

    // compress img before upload using canvas
    // quality 0-1, re-encodes everything as jpeg
    const compressImage = (file: File, quality: number): Promise<File> => {
        return new Promise((resolve) => {
            // skip tiny files
            if (file.size < 200_000 || file.type === 'image/gif') {
                resolve(file);
                return;
            }
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                // cap at 2400px
                const MAX = 2400;
                let { width, height } = img;
                if (width > MAX || height > MAX) {
                    if (width > height) { height = Math.round((height / width) * MAX); width = MAX; }
                    else { width = Math.round((width / height) * MAX); height = MAX; }
                }
                // create an entire goddamn invisible canvas element just to resize a jpeg like what the fuck are we doing
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (blob) => {
                        if (!blob) { resolve(file); return; }
                        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })); // regex to swap extension. kill me
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => resolve(file); // whatever just use original
            img.src = objectUrl;
        });
    };


    const handleImageUpload = async (rawFile: File): Promise<string | null> => {
        if (!rawFile.type.startsWith('image/')) {
            alert('File is not an image.');
            return null;
        }

        // compress first
        const file = await compressImage(rawFile, imageQuality);

        try {
            setIsUploadingImage(true);
            const storage = getStorage();

            // upload to articles/{slug}/ or articles/unassigned/ if no slug yet
            const folder = currentArticle.slug ? `articles/${currentArticle.slug}` : 'articles/unassigned';
            const uniqueFilename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            const storageRef = ref(storage, `${folder}/${uniqueFilename}`);

            const uploadTask = uploadBytesResumable(storageRef, file);

            return new Promise((resolve) => {
                uploadTask.on(
                    'state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        setUploadProgress(Math.round(progress));
                    },
                    (error) => {
                        console.error('Upload failed:', error);
                        setIsUploadingImage(false);
                        setUploadProgress(0);
                        resolve(null);
                    },
                    async () => {
                        const url = await getDownloadURL(uploadTask.snapshot.ref);
                        setIsUploadingImage(false);
                        setUploadProgress(0);
                        // refresh img panel
                        if (currentArticle.slug) loadArticleImages(currentArticle.slug);
                        resolve(url);
                    }
                );
            });
        } catch (error) {
            console.error("Storage error:", error);
            setIsUploadingImage(false);
            setUploadProgress(0);
            return null;
        }
    };

    // load imgs for article subfolder
    const loadArticleImages = async (slug: string) => {
        if (!slug) return;
        setLoadingArticleImages(true);
        try {
            const storage = getStorage();
            const result = await listAll(ref(storage, `articles/${slug}/`));
            const items = await Promise.all(
                result.items.map(async (r) => ({ name: r.name, url: await getDownloadURL(r), ref: r }))
            );
            setArticleImages(items.reverse());
        } catch (err) {
            console.error('Could not load article images:', err);
            setArticleImages([]);
        } finally {
            setLoadingArticleImages(false);
        }
    };

    const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
        // js clipboard api sucks who designed this garbage
        const items = event.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.indexOf('image') !== -1) {
                event.preventDefault(); // dont paste as text
                const file = item.getAsFile();
                if (!file) continue;

                const url = await handleImageUpload(file);
                if (url) {
                    // inject md image syntax
                    const imageMarkdown = `\n![${file.name}](${url})\n`;
                    setCurrentArticle(prev => ({
                        ...prev,
                        content: (prev.content || "") + imageMarkdown
                    }));
                }
                break; // one image at a time
            }
        }
    };

    const handleImagesFromDataTransfer = async (dataTransfer: DataTransfer) => {
        const files: File[] = [];
        for (let i = 0; i < dataTransfer.items.length; i++) {
            const item = dataTransfer.items[i];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) files.push(file);
            }
        }
        if (files.length === 0) return false;

        let addition = "";
        for (const file of files) {
            const url = await handleImageUpload(file);
            if (url) addition += `\n![${file.name}](${url})\n`;
        }
        if (addition) {
            setCurrentArticle(prev => ({ ...prev, content: (prev.content || "") + addition }));
        }
        return true;
    };


    const handleArchiveSingle = async (article: Article) => {
        if (!article.id) return;
        if (confirm(`Are you sure you want to archive "${article.title}"? It will be removed from the main rotation.`)) {
            setLoadingItems(true);
            try {
                await archiveArticle(article.id);
                await loadData();
            } catch (error) {
                console.error("Error archiving article:", error);
            } finally {
                setLoadingItems(false);
            }
        }
    };

    const handleArchiveAll = async () => {
        if (confirm("WARNING: This will archive EVERY currently unarchived article. Are you sure?")) {
            setLoadingItems(true);
            try {
                await archiveAllArticles();
                await loadData();
            } catch (error) {
                console.error("Error archiving all articles:", error);
            } finally {
                setLoadingItems(false);
            }
        }
    };

    const handleArchiveRange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!archiveStart || !archiveEnd) return;

        const start = new Date(archiveStart);
        const end = new Date(archiveEnd);
        end.setHours(23, 59, 59, 999); // include full day

        if (confirm(`Archive all articles published between ${start.toLocaleDateString()} and ${end.toLocaleDateString()}?`)) {
            setLoadingItems(true);
            try {
                await archiveArticlesByDateRange(start, end);
                setShowArchiveRange(false);
                setArchiveStart("");
                setArchiveEnd("");
                await loadData();
            } catch (error) {
                console.error("Error archiving range:", error);
            } finally {
                setLoadingItems(false);
            }
        }
    };


    const handleAddEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEmail.includes("@")) return;

        setLoadingItems(true);
        try {
            await addDoc(collection(db, "whitelistedEmails"), { email: newEmail.trim() });
            setNewEmail("");
            await loadData();
        } catch (error) {
            console.error("Error adding email:", error);
        } finally {
            setLoadingItems(false);
        }
    };

    const handleDeleteEmail = async (id: string) => {
        setLoadingItems(true);
        try {
            await deleteDoc(doc(db, "whitelistedEmails", id));
            await loadData();
        } catch (error) {
            console.error("Error deleting email:", error);
        } finally {
            setLoadingItems(false);
        }
    };

    const handleAddAdminEmailUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAdminEmail.includes("@")) return;

        setLoadingItems(true);
        try {
            await addAdminEmail(newAdminEmail.trim().toLowerCase());
            setNewAdminEmail("");
            await loadData();
        } catch (error) {
            console.error("Error adding admin email:", error);
        } finally {
            setLoadingItems(false);
        }
    };

    const handleDeleteAdminEmailUser = async (id: string) => {
        setLoadingItems(true);
        try {
            await removeAdminEmail(id);
            await loadData();
        } catch (error) {
            console.error("Error deleting admin email:", error);
        } finally {
            setLoadingItems(false);
        }
    };

    const handleToggleAdmin = async (userId: string, currentRole: string) => {
        const newRole = currentRole === "ADMIN" ? "USER" : "ADMIN";
        if (confirm(`Change user role to ${newRole}?`)) {
            setLoadingItems(true);
            try {
                await updateUserRole(userId, newRole);
                await loadData();
            } catch (error) {
                console.error("Error updating user role:", error);
            } finally {
                setLoadingItems(false);
            }
        }
    };

    // auto-slug from title + random hash for dedup
    // this chain of replaces is what happens when brendan didnt give us a proper slugify
    const generateSlug = (title: string) => {
        const readable = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '').substring(0, 40);
        const hash = Math.random().toString(36).substring(2, 8); // base36 random. shitass js shit but it works
        return `${readable}-${hash}`;
    };

    if (authLoading || loadingItems) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <RefreshCw className="w-8 h-8 text-foreground animate-spin" />
            </div>
        );
    }

    if (!user || userData?.role !== "ADMIN") return null;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-12 pb-8 border-b border-border">
                <div>
                    <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground flex items-center tracking-tight">
                        <Shield className="w-8 h-8 md:w-10 md:h-10 mr-4 text-accent" />
                        Admin Dashboard
                    </h1>
                    <p className="font-sans text-gray-500 mt-4 tracking-wide uppercase text-xs font-bold">
                        Commonwealth Newspaper Management
                    </p>
                </div>

                <div className="mt-8 md:mt-0 flex space-x-2 bg-border p-1 rounded-sm">
                    <button
                        onClick={() => setActiveTab("ARTICLES")}
                        className={`flex items-center px-6 py-3 font-sans text-xs font-bold uppercase tracking-widest rounded transition-colors ${activeTab === 'ARTICLES' ? 'bg-background text-foreground shadow-sm' : 'text-gray-500 hover:text-foreground'}`}
                    >
                        <FileText className="w-4 h-4 mr-2" />
                        Articles
                    </button>
                    <button
                        onClick={() => setActiveTab("USERS")}
                        className={`flex items-center px-6 py-3 font-sans text-xs font-bold uppercase tracking-widest rounded transition-colors ${activeTab === 'USERS' ? 'bg-background text-foreground shadow-sm' : 'text-gray-500 hover:text-foreground'}`}
                    >
                        <Users className="w-4 h-4 mr-2" />
                        User Access
                    </button>
                    <button
                        onClick={async () => {
                            setActiveTab("IMAGES");
                            setLoadingImages(true);
                            try {
                                const storage = getStorage();
                                const listRef = ref(storage, 'articles/');
                                const result = await listAll(listRef);
                                const items = await Promise.all(
                                    result.items.map(async (itemRef) => ({
                                        name: itemRef.name,
                                        url: await getDownloadURL(itemRef),
                                        ref: itemRef,
                                    }))
                                );
                                setStorageImages(items.reverse()); // newest first
                            } catch (err) {
                                console.error('Error listing images:', err);
                            } finally {
                                setLoadingImages(false);
                            }
                        }}
                        className={`flex items-center px-6 py-3 font-sans text-xs font-bold uppercase tracking-widest rounded transition-colors ${activeTab === 'IMAGES' ? 'bg-background text-foreground shadow-sm' : 'text-gray-500 hover:text-foreground'}`}
                    >
                        <ImageIcon className="w-4 h-4 mr-2" />
                        Images
                    </button>
                </div>
            </div>

            {/* ARTICLES TAB */}
            {activeTab === "ARTICLES" && (
                <div className="animate-in fade-in duration-500">
                    {!isEditing ? (
                        <>
                            {/* Toolbar */}
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 space-y-4 md:space-y-0 p-6 bg-border/30 rounded-sm border border-border">
                                <div className="flex flex-wrap items-center gap-4">
                                    <button
                                        onClick={handleArchiveAll}
                                        className="inline-flex items-center px-4 py-2 bg-background border border-border hover:border-accent hover:text-accent font-sans text-xs font-bold uppercase tracking-widest rounded-sm transition-colors"
                                    >
                                        <Archive className="w-4 h-4 mr-2" />
                                        Archive All
                                    </button>
                                    <button
                                        onClick={() => setShowArchiveRange(!showArchiveRange)}
                                        className="inline-flex items-center px-4 py-2 bg-background border border-border hover:border-foreground font-sans text-xs font-bold uppercase tracking-widest rounded-sm transition-colors"
                                    >
                                        <Calendar className="w-4 h-4 mr-2" />
                                        Archive By Date
                                    </button>
                                </div>
                                <button
                                    onClick={handleCreateNewClick}
                                    className="inline-flex items-center px-6 py-3 bg-foreground text-background font-sans text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-foreground/80 shadow-md transition-all"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Create Article
                                </button>
                            </div>

                            {/* Archive by Date Range Form */}
                            {showArchiveRange && (
                                <div className="mb-8 p-6 bg-border/30 border border-border rounded-sm animate-in fade-in slide-in-from-top-4">
                                    <form onSubmit={handleArchiveRange} className="flex flex-col md:flex-row items-end gap-4">
                                        <div className="w-full md:w-auto">
                                            <label className="block text-xs font-bold uppercase tracking-widest text-foreground font-sans mb-2">Start Date</label>
                                            <input type="date" required value={archiveStart} onChange={(e) => setArchiveStart(e.target.value)} className="w-full px-4 py-2 bg-background border border-border text-foreground font-sans rounded-sm focus:ring-accent focus:border-accent" />
                                        </div>
                                        <div className="w-full md:w-auto">
                                            <label className="block text-xs font-bold uppercase tracking-widest text-foreground font-sans mb-2">End Date</label>
                                            <input type="date" required value={archiveEnd} onChange={(e) => setArchiveEnd(e.target.value)} className="w-full px-4 py-2 bg-background border border-border text-foreground font-sans rounded-sm focus:ring-accent focus:border-accent" />
                                        </div>
                                        <button type="submit" className="w-full md:w-auto px-6 py-2 bg-accent text-white font-sans text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-accent/80 transition-colors">
                                            Execute Archive
                                        </button>
                                    </form>
                                </div>
                            )}

                            {/* Articles Data Table */}
                            <div className="bg-background rounded-sm shadow-xl border border-border overflow-x-auto">
                                <table className="min-w-full divide-y divide-border">
                                    <thead className="bg-border/30 uppercase font-sans text-[10px] text-gray-500 font-bold tracking-[0.2em]">
                                        <tr>
                                            <th scope="col" className="px-6 py-5 text-left">Article Details</th>
                                            <th scope="col" className="px-6 py-5 text-left">Status</th>
                                            <th scope="col" className="px-6 py-5 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-background divide-y divide-border">
                                        {articles.map((article) => (
                                            <tr key={article.id} className="hover:bg-border/20 transition-colors group">
                                                <td className="px-6 py-6">
                                                    <div className="font-serif text-xl font-bold text-foreground mb-1 group-hover:text-accent transition-colors">{article.title}</div>
                                                    <div className="font-sans text-xs text-gray-500 tracking-wider">
                                                        {article.slug} &bull; {article.period}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-6">
                                                    <div className="flex flex-col space-y-2 items-start">
                                                        {article.isArchived ? (
                                                            <span className="inline-flex items-center px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[10px] font-bold uppercase tracking-widest font-sans border border-gray-200 dark:border-gray-700">
                                                                Archived
                                                            </span>
                                                        ) : article.isPublished ? (
                                                            <span className="inline-flex items-center px-3 py-1 rounded bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-widest font-sans border border-accent/20">
                                                                Published
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-3 py-1 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-500 text-[10px] font-bold uppercase tracking-widest font-sans border border-yellow-200 dark:border-yellow-900">
                                                                Draft
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-6 border-l border-border/50">
                                                    <div className="flex items-center justify-end gap-2">

                                                        {/* Publish/Unpublish */}
                                                        {!article.isArchived && (
                                                            article.isPublished ? (
                                                                <button onClick={() => handleTogglePublish(article, false)} className="inline-flex items-center px-3 py-1.5 bg-background border border-border hover:border-foreground text-foreground text-[10px] uppercase tracking-widest font-bold font-sans rounded-sm transition-colors" title="Remove from public view">
                                                                    Unpublish
                                                                </button>
                                                            ) : (
                                                                <button onClick={() => handleTogglePublish(article, true)} className="inline-flex items-center px-3 py-1.5 bg-foreground text-background text-[10px] uppercase tracking-widest font-bold font-sans rounded-sm hover:-translate-y-0.5 transition-transform" title="Make public immediately">
                                                                    Publish
                                                                </button>
                                                            )
                                                        )}

                                                        {/* Edit */}
                                                        <button onClick={() => handleEditClick(article)} className="inline-flex items-center p-2 text-gray-400 hover:text-foreground bg-border/30 hover:bg-border rounded-sm transition-colors" title="Edit Article">
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>

                                                        {/* Archive */}
                                                        {!article.isArchived && (
                                                            <button onClick={() => handleArchiveSingle(article)} className="inline-flex items-center p-2 text-gray-400 hover:text-accent bg-border/30 hover:bg-accent/10 rounded-sm transition-colors" title="Archive Article">
                                                                <Archive className="w-4 h-4" />
                                                            </button>
                                                        )}

                                                        {/* Delete */}
                                                        <button onClick={() => handleDeleteArticle(article.id!)} className="inline-flex items-center p-2 text-red-500/50 hover:text-red-500 bg-border/30 hover:bg-red-500/10 rounded-sm transition-colors" title="Delete permanently">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>

                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {articles.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-6 py-16 text-center text-gray-500 font-sans tracking-widest uppercase text-sm">
                                                    No articles exist yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        /* Article Editor */
                        <div className="bg-background rounded-sm shadow-xl border border-border p-6 md:p-10 animate-in slide-in-from-bottom-4">
                            <h2 className="font-serif text-3xl font-bold text-foreground mb-8 pb-4 border-b border-border">
                                {currentArticle.id ? "Edit Article" : "Draft New Article"}
                            </h2>
                            <form onSubmit={handleSaveArticle} className="space-y-6 max-w-5xl">

                                {/* ── Row 1: Headline (full width) ─────────────────── */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-foreground font-sans mb-2">Headline</label>
                                    <input
                                        type="text" required
                                        className="w-full px-6 py-4 bg-background border-2 border-border rounded-sm focus:ring-0 focus:border-accent font-serif text-2xl transition-colors"
                                        value={currentArticle.title}
                                        onChange={(e) => setCurrentArticle({
                                            ...currentArticle,
                                            title: e.target.value,
                                            ...(!currentArticle.id ? { slug: generateSlug(e.target.value) } : {})
                                        })}
                                        placeholder="A Catchy Headline..."
                                    />
                                </div>

                                {/* ── Row 2: Slug + Author ───────────────────────────── */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-widest text-foreground font-sans mb-2">URL Slug</label>
                                        <input
                                            type="text" required
                                            className="w-full px-4 py-3 bg-border/30 border border-border rounded-sm focus:ring-0 focus:border-accent font-sans text-sm"
                                            value={currentArticle.slug}
                                            onChange={(e) => setCurrentArticle({ ...currentArticle, slug: generateSlug(e.target.value) })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-widest text-foreground font-sans mb-2">Author Byline</label>
                                        <input
                                            type="text" required
                                            className="w-full px-4 py-3 bg-border/30 border border-border rounded-sm focus:ring-0 focus:border-accent font-sans text-sm"
                                            value={currentArticle.author}
                                            onChange={(e) => setCurrentArticle({ ...currentArticle, author: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* ── Row 3: Period + Publish + Feature toggles ─────── */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-widest text-foreground font-sans mb-2">Publishing Period</label>
                                        <input
                                            type="text" required
                                            className="w-full px-4 py-3 bg-border/30 border border-border rounded-sm focus:ring-0 focus:border-accent font-sans text-sm"
                                            value={currentArticle.period}
                                            onChange={(e) => setCurrentArticle({ ...currentArticle, period: e.target.value })}
                                            placeholder="e.g. Spring 2026"
                                        />
                                    </div>
                                    <div className="flex items-end">
                                        <label className="flex items-center gap-3 w-full px-4 py-3 bg-border/30 border border-border rounded-sm cursor-pointer hover:bg-border/50 transition-colors">
                                            <input
                                                id="isPublished" type="checkbox"
                                                className="h-4 w-4 accent-accent"
                                                checked={currentArticle.isPublished}
                                                onChange={(e) => setCurrentArticle({ ...currentArticle, isPublished: e.target.checked })}
                                            />
                                            <span className="text-xs font-bold uppercase tracking-widest text-foreground font-sans">Publish</span>
                                        </label>
                                    </div>
                                    <div className="flex items-end">
                                        <label className="flex items-center gap-3 w-full px-4 py-3 bg-accent/10 border border-accent/30 rounded-sm cursor-pointer hover:bg-accent/20 transition-colors">
                                            <input
                                                id="isFeatured" type="checkbox"
                                                className="h-4 w-4 accent-accent"
                                                checked={currentArticle.isFeatured ?? false}
                                                onChange={(e) => setCurrentArticle({ ...currentArticle, isFeatured: e.target.checked })}
                                            />
                                            <span className="text-xs font-bold uppercase tracking-widest text-accent font-sans">⭐ Feature on Homepage</span>
                                        </label>
                                    </div>
                                </div>

                                {/* ── Row 4: Category ──────────────────────────────── */}
                                <div className="max-w-xs">
                                    <label className="block text-xs font-bold uppercase tracking-widest text-foreground font-sans mb-2">Category</label>
                                    <select
                                        className="w-full px-4 py-3 bg-border/30 border border-border rounded-sm focus:ring-0 focus:border-accent font-sans text-sm"
                                        value={currentArticle.category ?? "News"}
                                        onChange={(e) => setCurrentArticle({ ...currentArticle, category: e.target.value })}
                                    >
                                        <option value="News">News</option>
                                        <option value="Opinion">Opinion</option>
                                        <option value="Features">Features</option>
                                        <option value="Sports">Sports</option>
                                        <option value="Arts & Culture">Arts &amp; Culture</option>
                                    </select>
                                </div>

                                {/* ── Cover Photo ────────────────────────────────────── */}
                                <div className="border-t border-border pt-6">
                                    <div className="flex items-baseline gap-2 mb-3">
                                        <span className="text-xs font-bold uppercase tracking-widest text-foreground font-sans">Cover Photo</span>
                                        <span className="text-[10px] text-gray-400 font-sans">Optional — hero image &amp; homepage thumbnail</span>
                                    </div>

                                    {currentArticle.coverImageUrl ? (
                                        <div className="flex items-center gap-4 p-3 bg-border/20 border border-border rounded-sm">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={currentArticle.coverImageUrl} alt="Cover" className="w-24 h-16 object-cover rounded-sm border border-border flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-sans text-xs font-bold text-foreground truncate">
                                                    {currentArticle.coverImageUrl.split('/').pop()?.split('?')[0].replace(/%2F[^%]+%2F/, '') ?? 'cover'}
                                                </p>
                                                <p className="font-sans text-[10px] text-gray-500 mt-0.5">Cover photo set</p>
                                            </div>
                                            <button type="button"
                                                onClick={() => setCurrentArticle(prev => ({ ...prev, coverImageUrl: "" }))}
                                                className="flex-shrink-0 inline-flex items-center px-3 py-1.5 bg-background border border-border hover:border-red-500 hover:text-red-500 font-sans text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors">
                                                <Trash2 className="w-3 h-3 mr-1" /> Remove
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="flex items-center justify-center gap-3 px-6 py-6 border-2 border-dashed border-border rounded-sm cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors group">
                                            <ImageIcon className="w-5 h-5 text-gray-400 group-hover:text-accent transition-colors" />
                                            <span className="font-sans text-sm text-gray-500 group-hover:text-accent transition-colors">
                                                {isUploadingImage ? `Uploading… ${uploadProgress}%` : "Click to upload cover photo"}
                                            </span>
                                            <input type="file" accept="image/*" className="sr-only" disabled={isUploadingImage}
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0]; if (!file) return;
                                                    const url = await handleImageUpload(file);
                                                    if (url) setCurrentArticle(prev => ({ ...prev, coverImageUrl: url }));
                                                    e.target.value = "";
                                                }}
                                            />
                                        </label>
                                    )}
                                </div>

                                {/* ── Article Images (per-article asset manager) ─────── */}
                                <div className="border-t border-border pt-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <button type="button"
                                            onClick={() => {
                                                const next = !articleImagesOpen;
                                                setArticleImagesOpen(next);
                                                if (next && currentArticle.slug && articleImages.length === 0) loadArticleImages(currentArticle.slug);
                                            }}
                                            className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-foreground font-sans group"
                                        >
                                            <span className={`transition-transform ${articleImagesOpen ? 'rotate-90' : ''}`}>▶</span>
                                            Article Images
                                            <span className="font-normal normal-case tracking-normal text-gray-400 text-[10px]">
                                                — assets for this article only (stored under articles/{currentArticle.slug || 'slug'})
                                            </span>
                                        </button>
                                        {articleImagesOpen && currentArticle.slug && (
                                            <div className="flex items-center gap-2">
                                                {/* Upload to article folder */}
                                                <label className="inline-flex items-center px-3 py-1.5 bg-background border border-border hover:border-accent hover:text-accent font-sans text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer">
                                                    <ImageIcon className="w-3 h-3 mr-1.5" />
                                                    Upload
                                                    <input type="file" accept="image/*" multiple className="sr-only" disabled={isUploadingImage}
                                                        onChange={async (e) => {
                                                            const files = Array.from(e.target.files ?? []);
                                                            for (const f of files) {
                                                                await handleImageUpload(f);
                                                            }
                                                            e.target.value = "";
                                                        }}
                                                    />
                                                </label>
                                                <button type="button" onClick={() => currentArticle.slug && loadArticleImages(currentArticle.slug)}
                                                    className="p-1.5 text-gray-400 hover:text-foreground transition-colors">
                                                    <RefreshCw className={`w-3.5 h-3.5 ${loadingArticleImages ? 'animate-spin' : ''}`} />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {articleImagesOpen && (
                                        <div className="bg-border/10 border border-border rounded-sm p-4">
                                            {!currentArticle.slug ? (
                                                <p className="text-[10px] text-gray-500 font-sans text-center py-4">Set a URL slug first to enable per-article image management.</p>
                                            ) : loadingArticleImages ? (
                                                <div className="flex justify-center py-6"><RefreshCw className="w-5 h-5 animate-spin text-border" /></div>
                                            ) : articleImages.length === 0 ? (
                                                <div className="text-center py-6">
                                                    <p className="text-[10px] text-gray-500 font-sans uppercase tracking-widest">No images uploaded for this article yet.</p>
                                                    <p className="text-[10px] text-gray-400 font-sans mt-1">Paste, drag & drop, or use Upload above.</p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                                                    {articleImages.map((img) => (
                                                        <div key={img.name} className="group relative rounded-sm overflow-hidden border border-border bg-border/20">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img src={img.url} alt={img.name} className="w-full h-20 object-cover" />
                                                            <p className="px-1 py-0.5 font-sans text-[8px] text-gray-500 truncate">{img.name}</p>
                                                            {/* Hover actions */}
                                                            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 items-center justify-center p-1.5">
                                                                <button type="button"
                                                                    onClick={() => {
                                                                        const md = `![${img.name}](${img.url})`;
                                                                        navigator.clipboard.writeText(md);
                                                                    }}
                                                                    className="w-full py-1 bg-white text-black font-sans text-[9px] font-bold uppercase tracking-widest rounded-sm hover:bg-gray-100">
                                                                    Copy MD
                                                                </button>
                                                                <button type="button"
                                                                    onClick={() => {
                                                                        const md = `![${img.name}](${img.url})`;
                                                                        setCurrentArticle(prev => ({ ...prev, content: (prev.content ?? '') + '\n' + md + '\n' }));
                                                                    }}
                                                                    className="w-full py-1 bg-accent text-white font-sans text-[9px] font-bold uppercase tracking-widest rounded-sm hover:bg-accent/80">
                                                                    Insert
                                                                </button>
                                                                <button type="button"
                                                                    onClick={async () => {
                                                                        if (!confirm(`Delete "${img.name}"?`)) return;
                                                                        await deleteObject(img.ref);
                                                                        setArticleImages(prev => prev.filter(i => i.name !== img.name));
                                                                    }}
                                                                    className="w-full py-1 bg-red-600 text-white font-sans text-[9px] font-bold uppercase tracking-widest rounded-sm hover:bg-red-700">
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Body Content Editor */}
                                <div className="pt-4 md:col-span-2">
                                    <label className="block text-xs font-bold uppercase tracking-widest text-foreground font-sans mb-4 flex justify-between items-end border-b border-border pb-2">
                                        <div className="flex items-center space-x-4">
                                            <span>Body Content</span>
                                            {isUploadingImage && (
                                                <span className="flex items-center text-accent animate-pulse font-sans text-xs">
                                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                                    Uploading Image... {uploadProgress}%
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-gray-500 text-[10px] hidden sm:inline font-mono normal-case tracking-normal">Drag & Drop or Paste images directly into the editor to upload.</span>
                                    </label>

                                    {/* Outer drop zone — catches drops on both the editor pane AND the preview pane */}
                                    <div
                                        className="w-full"
                                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                                        onDrop={async (e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            await handleImagesFromDataTransfer(e.dataTransfer);
                                        }}
                                    >
                                        <div data-color-mode="light" className="w-full">
                                            <div className="dark:hidden">
                                                <MDEditor
                                                    value={currentArticle.content}
                                                    onChange={(val) => setCurrentArticle({ ...currentArticle, content: val || "" })}
                                                    height={500}
                                                    preview="live"
                                                    className="border-2 border-border shadow-sm font-sans"
                                                    textareaProps={{
                                                        placeholder: "# Main Headline\n\nWrite your story here... Paste or drag images to upload them automatically.",
                                                        onPaste: async (e) => {
                                                            const items = e.clipboardData?.items;
                                                            if (!items) return;
                                                            for (let i = 0; i < items.length; i++) {
                                                                if (items[i].type.indexOf('image') !== -1) {
                                                                    e.preventDefault();
                                                                    const file = items[i].getAsFile();
                                                                    if (file) {
                                                                        const url = await handleImageUpload(file);
                                                                        if (url) setCurrentArticle(prev => ({ ...prev, content: (prev.content || '') + `\n![${file.name}](${url})\n` }));
                                                                    }
                                                                    break;
                                                                }
                                                            }
                                                        },
                                                        onDrop: async (e) => {
                                                            const handled = await handleImagesFromDataTransfer(e.dataTransfer);
                                                            if (handled) e.preventDefault();
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div className="hidden dark:block" data-color-mode="dark">
                                                <MDEditor
                                                    value={currentArticle.content}
                                                    onChange={(val) => setCurrentArticle({ ...currentArticle, content: val || "" })}
                                                    height={500}
                                                    preview="live"
                                                    className="border-2 border-border shadow-sm font-sans"
                                                    textareaProps={{
                                                        placeholder: "# Main Headline\n\nWrite your story here... Paste or drag images to upload them automatically.",
                                                        onPaste: async (e) => {
                                                            const items = e.clipboardData?.items;
                                                            if (!items) return;
                                                            for (let i = 0; i < items.length; i++) {
                                                                if (items[i].type.indexOf('image') !== -1) {
                                                                    e.preventDefault();
                                                                    const file = items[i].getAsFile();
                                                                    if (file) {
                                                                        const url = await handleImageUpload(file);
                                                                        if (url) setCurrentArticle(prev => ({ ...prev, content: (prev.content || '') + `\n![${file.name}](${url})\n` }));
                                                                    }
                                                                    break;
                                                                }
                                                            }
                                                        },
                                                        onDrop: async (e) => {
                                                            const handled = await handleImagesFromDataTransfer(e.dataTransfer);
                                                            if (handled) e.preventDefault();
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div> {/* end outer drop zone */}

                                    <div className="flex justify-end space-x-4 pt-8 border-t border-border">
                                        <button
                                            type="button"
                                            onClick={() => setIsEditing(false)}
                                            className="px-8 py-4 border border-border text-foreground font-sans text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-border/50 transition-colors"
                                        >
                                            Discard Changes
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-8 py-4 bg-foreground text-background font-sans text-xs font-bold uppercase tracking-widest rounded-sm shadow-md hover:-translate-y-1 transition-transform"
                                        >
                                            Save Article
                                        </button>
                                    </div>
                                </div> {/* end body content section */}
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* USERS & WHITELIST TAB */}
            {activeTab === "USERS" && (
                <div className="animate-in fade-in duration-500 space-y-12">

                    {/* Whitelist Section */}
                    <div className="bg-background rounded-sm shadow-xl border border-border overflow-hidden p-6 md:p-10">
                        <div className="mb-8 border-b border-border pb-6">
                            <h2 className="font-serif text-3xl font-bold text-foreground">Domain Whitelist</h2>
                            <p className="font-sans text-sm text-gray-500 mt-2 max-w-3xl">
                                Accounts ending in <code className="bg-border px-1 py-0.5 rounded text-foreground">@commschool.org</code> are automatically authorized to read puzzles.
                                Add external emails below to bypass this domain restriction.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                            {/* Add Form */}
                            <div className="lg:col-span-1 border-r-0 lg:border-r border-border pr-0 lg:pr-8">
                                <form onSubmit={handleAddEmail} className="space-y-4">
                                    <label className="block text-xs font-bold uppercase tracking-widest text-foreground font-sans">Authorize New Email</label>
                                    <input
                                        type="email"
                                        required
                                        placeholder="reader@example.com"
                                        className="w-full px-4 py-3 bg-background border border-border rounded-sm focus:ring-0 focus:border-accent font-sans text-sm"
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                    />
                                    <button
                                        type="submit"
                                        className="w-full px-6 py-3 bg-foreground text-background font-sans text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-foreground/80 transition-colors flex justify-center items-center"
                                    >
                                        <Plus className="w-4 h-4 mr-2" /> Add Email
                                    </button>
                                </form>
                            </div>

                            {/* Whitelist Table */}
                            <div className="lg:col-span-2">
                                <table className="min-w-full divide-y divide-border border border-border rounded-sm overflow-hidden">
                                    <thead className="bg-border/30 uppercase font-sans text-[10px] text-gray-500 font-bold tracking-[0.2em]">
                                        <tr>
                                            <th scope="col" className="px-6 py-4 text-left">Authorized Email</th>
                                            <th scope="col" className="px-6 py-4 text-right">Remove</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-background divide-y divide-border">
                                        {whitelistedEmails.map((item) => (
                                            <tr key={item.id} className="hover:bg-border/20 transition-colors">
                                                <td className="px-6 py-4 font-sans text-sm font-medium text-foreground">
                                                    {item.email}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => handleDeleteEmail(item.id)}
                                                        className="inline-flex items-center p-2 text-red-500/50 hover:text-red-500 bg-border/30 hover:bg-red-500/10 rounded-sm transition-colors"
                                                        title="Revoke access"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {whitelistedEmails.length === 0 && (
                                            <tr>
                                                <td colSpan={2} className="px-6 py-8 text-center text-gray-500 font-sans text-sm">
                                                    No external emails whitelisted.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Admin Roles Section */}
                    <div className="bg-background rounded-sm shadow-xl border border-border overflow-hidden p-6 md:p-10 mb-12">
                        <div className="mb-8 border-b border-border pb-6">
                            <h2 className="font-serif text-3xl font-bold text-foreground">Pre-Registered Admins</h2>
                            <p className="font-sans text-sm text-gray-500 mt-2 max-w-3xl">
                                Grant people <code className="bg-accent/10 text-accent font-bold px-1 py-0.5 rounded">ADMIN</code> capability before they ever sign in. If a user logs in via Google and their email matches an entry here, they will instantly be granted Admin privileges.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                            {/* Add Form */}
                            <div className="lg:col-span-1 border-r-0 lg:border-r border-border pr-0 lg:pr-8">
                                <form onSubmit={handleAddAdminEmailUser} className="space-y-4">
                                    <label className="block text-xs font-bold uppercase tracking-widest text-foreground font-sans">Pre-Approve Admin</label>
                                    <input
                                        type="email"
                                        required
                                        placeholder="admin@example.com"
                                        className="w-full px-4 py-3 bg-background border border-border rounded-sm focus:ring-0 focus:border-accent font-sans text-sm outline-none"
                                        value={newAdminEmail}
                                        onChange={(e) => setNewAdminEmail(e.target.value)}
                                    />
                                    <button
                                        type="submit"
                                        className="w-full px-6 py-3 bg-accent text-white font-sans text-xs font-bold uppercase tracking-widest rounded-sm hover:-translate-y-0.5 shadow-md transition-all flex justify-center items-center"
                                    >
                                        <Plus className="w-4 h-4 mr-2" /> Register Admin
                                    </button>
                                </form>
                            </div>

                            {/* Admin Emails Table */}
                            <div className="lg:col-span-2">
                                <table className="min-w-full divide-y divide-border border border-border rounded-sm overflow-hidden">
                                    <thead className="bg-border/30 uppercase font-sans text-[10px] text-gray-500 font-bold tracking-[0.2em]">
                                        <tr>
                                            <th scope="col" className="px-6 py-4 text-left">Pending Admin Email</th>
                                            <th scope="col" className="px-6 py-4 text-right">Revoke</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-background divide-y divide-border">
                                        {adminEmailsList.map((item) => (
                                            <tr key={item.id} className="hover:bg-border/20 transition-colors">
                                                <td className="px-6 py-4 font-sans text-sm font-medium text-foreground">
                                                    {item.email}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => handleDeleteAdminEmailUser(item.id!)}
                                                        className="inline-flex items-center p-2 text-red-500/50 hover:text-red-500 bg-border/30 hover:bg-red-500/10 rounded-sm transition-colors"
                                                        title="Revoke Pre-Approval"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {adminEmailsList.length === 0 && (
                                            <tr>
                                                <td colSpan={2} className="px-6 py-8 text-center text-gray-500 font-sans text-sm">
                                                    No pre-registered admins set.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Active Users List Section */}
                    <div className="bg-background rounded-sm shadow-xl border border-border overflow-hidden p-6 md:p-10">
                        <div className="mb-8 border-b border-border pb-6">
                            <h2 className="font-serif text-3xl font-bold text-foreground">Active Signed-In Users</h2>
                            <p className="font-sans text-sm text-gray-500 mt-2 max-w-3xl">
                                This lists everyone who has actually logged into the site so far. You can manually tweak their <code className="bg-accent/10 text-accent font-bold px-1 py-0.5 rounded">ADMIN</code> roles or <code className="bg-border px-1 py-0.5 rounded text-foreground text-xs">USER</code> roles from here override any defaults.
                            </p>
                        </div>

                        <div className="overflow-x-auto border border-border rounded-sm">
                            <table className="min-w-full divide-y divide-border">
                                <thead className="bg-border/30 uppercase font-sans text-[10px] text-gray-500 font-bold tracking-[0.2em]">
                                    <tr>
                                        <th scope="col" className="px-6 py-4 text-left">User Name</th>
                                        <th scope="col" className="px-6 py-4 text-left">Email Address</th>
                                        <th scope="col" className="px-6 py-4 text-left">Current Role</th>
                                        <th scope="col" className="px-6 py-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-background divide-y divide-border">
                                    {allUsers.map((u) => (
                                        <tr key={u.id} className="hover:bg-border/20 transition-colors">
                                            <td className="px-6 py-4 font-sans text-sm font-bold text-foreground">
                                                {u.name}
                                                {u.email === user?.email && <span className="ml-2 text-[10px] bg-border px-2 py-0.5 rounded-full text-gray-500 uppercase">You</span>}
                                            </td>
                                            <td className="px-6 py-4 font-sans text-sm text-gray-500">
                                                {u.email}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest font-sans border ${u.role === "ADMIN"
                                                    ? 'bg-accent/10 border-accent/20 text-accent'
                                                    : 'bg-border/30 border-border text-gray-600 dark:text-gray-400'
                                                    }`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleToggleAdmin(u.id, u.role)}
                                                    disabled={u.email === user?.email}
                                                    className={`inline-flex items-center px-4 py-2 text-[10px] uppercase tracking-widest font-bold rounded-sm border transition-colors ${u.email === user?.email
                                                        ? 'opacity-50 cursor-not-allowed bg-background border-border text-gray-400'
                                                        : u.role === "ADMIN"
                                                            ? 'bg-background border-border hover:border-foreground text-foreground'
                                                            : 'bg-foreground text-background border-transparent hover:-translate-y-0.5 shadow-md'
                                                        }`}
                                                >
                                                    {u.role === "ADMIN" ? 'Demote to User' : 'Ascend to Admin'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {allUsers.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-8 text-center text-gray-500 font-sans text-sm">
                                                No users found. Let someone log in first!
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* IMAGES TAB */}
            {activeTab === "IMAGES" && (
                <div className="animate-in fade-in duration-500 space-y-8">
                    {/* Compression Quality Control */}
                    <div className="bg-background rounded-sm border border-border p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                        <Sliders className="w-5 h-5 text-accent flex-shrink-0" />
                        <div className="flex-1">
                            <label className="block text-xs font-bold uppercase tracking-widest text-foreground font-sans mb-1">
                                Upload Compression Quality — {Math.round(imageQuality * 100)}%
                            </label>
                            <p className="text-[10px] text-gray-500 font-sans tracking-wide mb-2">
                                Applied to images over 200 KB during upload. Affects future uploads only. 100% = no compression (original quality).
                            </p>
                            <input
                                type="range" min="0.3" max="1" step="0.01"
                                value={imageQuality}
                                onChange={(e) => setImageQuality(parseFloat(e.target.value))}
                                className="w-full max-w-sm accent-accent"
                            />
                        </div>
                    </div>

                    {/* Image Grid */}
                    <div className="bg-background rounded-sm shadow-xl border border-border p-6 md:p-8">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-border">
                            <h2 className="font-serif text-2xl font-bold text-foreground">Uploaded Images</h2>
                            <button
                                onClick={async () => {
                                    setLoadingImages(true);
                                    try {
                                        const storage = getStorage();
                                        const result = await listAll(ref(storage, 'articles/'));
                                        const items = await Promise.all(result.items.map(async (r) => ({ name: r.name, url: await getDownloadURL(r), ref: r })));
                                        setStorageImages(items.reverse());
                                    } finally { setLoadingImages(false); }
                                }}
                                className="inline-flex items-center px-4 py-2 border border-border hover:border-foreground font-sans text-xs font-bold uppercase tracking-widest rounded-sm transition-colors"
                            >
                                <RefreshCw className={`w-3 h-3 mr-2 ${loadingImages ? 'animate-spin' : ''}`} /> Refresh
                            </button>
                        </div>

                        {loadingImages ? (
                            <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-border" /></div>
                        ) : storageImages.length === 0 ? (
                            <p className="text-center text-gray-500 font-sans py-16 tracking-widest uppercase text-sm">No images uploaded yet.</p>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {storageImages.map((img) => (
                                    <div key={img.name} className="group relative border border-border rounded-sm overflow-hidden bg-border/10">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={img.url} alt={img.name} className="w-full h-28 object-cover" />
                                        <div className="p-2">
                                            <p className="font-sans text-[9px] text-gray-500 truncate" title={img.name}>{img.name}</p>
                                        </div>
                                        {/* Hover overlay with actions */}
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                                            <button
                                                onClick={() => { navigator.clipboard.writeText(img.url); }}
                                                className="w-full py-1.5 bg-white text-black font-sans text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-gray-100 transition-colors"
                                            >
                                                Copy URL
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!confirm(`Permanently delete "${img.name}"? This cannot be undone.`)) return;
                                                    try {
                                                        await deleteObject(img.ref);
                                                        setStorageImages(prev => prev.filter(i => i.name !== img.name));
                                                    } catch (err) {
                                                        console.error('Delete failed:', err);
                                                        alert('Failed to delete image.');
                                                    }
                                                }}
                                                className="w-full py-1.5 bg-red-600 text-white font-sans text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-red-700 transition-colors"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
