"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getArticleBySlug, Article } from "@/lib/firebase/firestore";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { format } from "date-fns";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// custom markdown renderers
const mdComponents: Components = {
    h1: ({ children }) => <h1 className="font-serif text-4xl sm:text-5xl font-bold text-foreground mt-12 mb-6 leading-tight tracking-tight">{children}</h1>,
    h2: ({ children }) => <h2 className="font-serif text-3xl sm:text-4xl font-bold text-foreground mt-14 mb-5 leading-tight tracking-tight border-t border-border pt-10">{children}</h2>,
    h3: ({ children }) => <h3 className="font-serif text-2xl sm:text-3xl font-bold text-foreground mt-10 mb-4 leading-snug">{children}</h3>,
    h4: ({ children }) => <h4 className="font-serif text-xl font-bold text-foreground mt-8 mb-3">{children}</h4>,
    p: ({ children }) => <p className="font-serif text-lg sm:text-xl text-foreground leading-[1.85] mb-7">{children}</p>,
    blockquote: ({ children }) => (
        <blockquote className="border-l-4 border-accent pl-6 pr-4 py-3 my-8 bg-gray-50 dark:bg-white/5 rounded-r-sm">
            <div className="font-serif text-lg italic text-gray-700 dark:text-gray-300 leading-relaxed">{children}</div>
        </blockquote>
    ),
    // inline code - subtle pill style, no monospace
    code: ({ children, className }) => {
        const isBlock = className?.includes("language-");
        if (isBlock) {
            return <code className="font-mono text-sm whitespace-pre-wrap break-words">{children}</code>;
        }
        // inline: blends w/ prose
        return <code className="font-serif text-[0.95em] bg-gray-100 dark:bg-white/10 text-foreground px-1 rounded break-words">{children}</code>;
    },
    // pre block - indented serif section instead of ugly dark dev box
    pre: ({ children }) => (
        <div className="border-l-4 border-border pl-6 my-8 font-serif text-lg text-foreground/80 leading-relaxed whitespace-pre-wrap break-words overflow-x-hidden">
            {children}
        </div>
    ),
    ul: ({ children }) => <ul className="list-disc pl-7 my-6 space-y-2 font-serif text-lg text-foreground">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-7 my-6 space-y-2 font-serif text-lg text-foreground">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    a: ({ href, children }) => <a href={href} className="text-accent underline underline-offset-4 hover:opacity-80 transition-opacity" target={href?.startsWith("http") ? "_blank" : undefined} rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}>{children}</a>,
    img: ({ src, alt }) => (
        <span className="block my-10 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src}
                alt={alt ?? ""}
                className="rounded-lg shadow-lg max-w-full mx-auto border border-border/30"
                style={{ maxHeight: '600px', objectFit: 'contain' }}
            />
            {alt && <span className="block text-center text-sm text-gray-400 font-sans mt-3 italic tracking-wide">{alt}</span>}
        </span>
    ),
    hr: () => <hr className="border-border my-12" />,
    table: ({ children }) => <div className="overflow-x-auto my-8"><table className="min-w-full border border-border text-sm font-sans">{children}</table></div>,
    th: ({ children }) => <th className="px-4 py-3 border-b border-border bg-border/30 font-bold text-left text-foreground">{children}</th>,
    td: ({ children }) => <td className="px-4 py-3 border-b border-border text-foreground">{children}</td>,
};

export default function ArticlePage() {
    const params = useParams();
    const slug = params.slug as string;

    const [article, setArticle] = useState<Article | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadArticle() {
            if (!slug) return;
            try {
                const fetchedArticle = await getArticleBySlug(slug);
                setArticle(fetchedArticle);
            } catch (error) {
                console.error("Error fetching article:", error);
            } finally {
                setLoading(false);
            }
        }
        loadArticle();
    }, [slug]);

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20">
                <div className="animate-pulse space-y-8">
                    <div className="h-4 w-32 bg-border/40 rounded"></div>
                    <div className="h-16 w-full bg-border/40 rounded"></div>
                    <div className="h-16 w-3/4 bg-border/40 rounded"></div>
                    <div className="h-4 w-48 bg-border/40 rounded"></div>

                    <div className="h-px w-full bg-border/40 my-10"></div>

                    <div className="h-4 w-full bg-border/40 rounded mt-12"></div>
                    <div className="h-4 w-full bg-border/40 rounded"></div>
                    <div className="h-4 w-5/6 bg-border/40 rounded"></div>
                    <div className="h-4 w-full bg-border/40 rounded"></div>
                    <div className="h-4 w-4/6 bg-border/40 rounded"></div>
                </div>
            </div>
        );
    }

    if (!article) {
        return (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-32 text-center animate-in fade-in duration-500">
                <h1 className="font-serif text-5xl font-bold text-foreground mb-6">Story Removed</h1>
                <p className="font-sans text-gray-500 mb-10 tracking-wide text-lg">This article could not be found in our archives.</p>
                <Link href="/" className="inline-flex items-center text-sm font-bold uppercase tracking-widest text-foreground hover:text-accent transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-3" />
                    Return to Front Page
                </Link>
            </div>
        );
    }

    return (
        <article className="max-w-4xl mx-auto px-4 sm:px-6 py-16 lg:py-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Link href="/" className="inline-flex items-center text-gray-400 hover:text-foreground font-sans text-xs uppercase tracking-[0.2em] font-bold mb-16 transition-colors group">
                <ArrowLeft className="w-3 h-3 mr-2 transform group-hover:-translate-x-1 transition-transform" />
                Back to Front Page
            </Link>

            <header className="mb-14">
                <div className="flex items-center space-x-3 mb-6">
                    <span className="text-xs text-accent font-sans font-bold uppercase tracking-widest bg-accent/10 py-1 px-3 rounded-sm">{article.period}</span>
                </div>

                <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl font-bold text-foreground leading-[1.1] tracking-tight mb-10">
                    {article.title}
                </h1>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-border pt-6 mt-10">
                    <div className="flex items-center">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-foreground font-sans">
                                By {article.author}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 sm:mt-0 text-xs font-sans text-gray-400 uppercase tracking-widest">
                        Published {article.createdAt?.toDate ? format(article.createdAt.toDate(), "MMMM do, yyyy") : ""}
                    </div>
                </div>
            </header>

            {/* Cover / Hero Image */}
            {article.coverImageUrl && (
                <div className="w-full mb-12 -mx-4 sm:mx-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={article.coverImageUrl}
                        alt={`Cover image for ${article.title}`}
                        className="w-full max-h-[520px] object-cover rounded-sm shadow-lg"
                    />
                </div>
            )}

            <div className="w-full mb-24">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {article.content}
                </ReactMarkdown>
            </div>

            <footer className="border-t border-border pt-12 pb-24 text-center">
                <Link href="/" className="inline-block group focus:outline-none">
                    <h2 className="font-serif text-3xl font-bold text-foreground mb-3 opacity-90 group-hover:opacity-100 transition-opacity">
                        The Commonwealth Newspaper
                    </h2>
                </Link>
            </footer>
        </article>
    );
}
