"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPublishedArticles, Article } from "@/lib/firebase/firestore";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";

export default function Archive() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);

    // group by period (Spring 2026 etc)
    const [groupedArticles, setGroupedArticles] = useState<Record<string, Article[]>>({});

    useEffect(() => {
        async function loadArticles() {
            try {
                const fetchedArticles = await getPublishedArticles();
                setArticles(fetchedArticles);


                const grouped = fetchedArticles.reduce((acc, article) => {
                    const period = article.period || "Uncategorized";
                    if (!acc[period]) {
                        acc[period] = [];
                    }
                    acc[period].push(article);
                    return acc;
                }, {} as Record<string, Article[]>);

                setGroupedArticles(grouped);
            } catch (error) {
                console.error("Error fetching articles:", error);
            } finally {
                setLoading(false);
            }
        }
        loadArticles();
    }, []);

    if (loading) {
        return (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="h-12 w-64 bg-border/40 rounded mt-12 mb-6"></div>
                    <div className="h-4 w-96 bg-border/40 rounded mb-20"></div>

                    <div className="w-full space-y-12">
                        <div className="h-8 w-48 bg-border/40 rounded"></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="h-32 w-full bg-border/40 rounded"></div>
                            <div className="h-32 w-full bg-border/40 rounded"></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 animate-in fade-in duration-700">
            <div className="mb-20 text-center flex flex-col items-center">
                <Link href="/" className="inline-flex items-center text-gray-400 hover:text-foreground font-sans text-xs uppercase tracking-[0.2em] font-bold mb-12 transition-colors group">
                    <ArrowLeft className="w-3 h-3 mr-2 transform group-hover:-translate-x-1 transition-transform" />
                    Back to Front Page
                </Link>
                <h1 className="font-serif text-6xl md:text-8xl font-bold tracking-tighter text-foreground mb-6">
                    The Archive
                </h1>
            </div>

            {articles.length === 0 ? (
                <div className="text-center py-20 border-t border-border/50">
                    <h3 className="font-serif text-3xl text-foreground mb-4">No records found.</h3>
                    <p className="text-gray-500 font-sans">The archives are currently empty.</p>
                </div>
            ) : (
                <div className="space-y-24">
                    {Object.entries(groupedArticles).map(([period, periodArticles]) => (
                        <section key={period} className="relative">

                            <div className="flex items-center justify-center mb-16 relative">
                                <div className="absolute left-0 right-0 h-px bg-border/50"></div>
                                <h2 className="relative font-sans text-sm font-bold uppercase tracking-[0.2em] text-foreground bg-background px-6 mx-auto">
                                    {period}
                                </h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16">
                                {periodArticles.map((article) => (
                                    <Link
                                        key={article.id}
                                        href={`/article/${article.slug}`}
                                        className="group block"
                                    >
                                        <article className="h-full flex flex-col">
                                            <div className="mb-4">
                                                <span className="text-[10px] font-sans font-bold uppercase tracking-widest text-gray-400">
                                                    {article.createdAt?.toDate ? format(article.createdAt.toDate(), "MMM d, yyyy") : ""}
                                                </span>
                                            </div>
                                            <h3 className="font-serif text-2xl font-bold text-foreground mb-4 group-hover:text-accent transition-colors leading-[1.2] tracking-tight">
                                                {article.title}
                                            </h3>
                                            <p className="font-serif text-gray-600 text-base line-clamp-3 mb-6 flex-grow leading-relaxed">
                                                {article.content.replace(/[#*`_]/g, "").substring(0, 150)}...
                                            </p>
                                            <div className="mt-auto pt-6 border-t border-border/30">
                                                <p className="text-[11px] font-bold text-foreground font-sans uppercase tracking-[0.15em]">
                                                    By {article.author}
                                                </p>
                                            </div>
                                        </article>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
