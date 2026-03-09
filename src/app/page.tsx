"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPublishedArticles, Article } from "@/lib/firebase/firestore";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";

const CATEGORY_ORDER = ["News", "Opinion", "Features", "Sports", "Arts & Culture"];

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  useEffect(() => {
    async function loadArticles() {
      try {
        const fetched = await getPublishedArticles();
        setArticles(fetched);
        if (fetched.length > 0) {
          const periods = [...new Set(fetched.map(a => a.period))].sort().reverse();
          setSelectedPeriod(periods[0]);
        }
      } catch (error) {
        console.error("Error fetching articles:", error);
      } finally {
        setLoading(false);
      }
    }
    loadArticles();
  }, []);

  const allPeriods = [...new Set(articles.map(a => a.period))].sort().reverse();
  const issueArticles = articles.filter(a => a.period === selectedPeriod);

  // category tabs
  const issueCategories = CATEGORY_ORDER.filter(c => issueArticles.some(a => a.category === c));
  const extraCategories = [...new Set(
    issueArticles.map(a => a.category ?? "").filter(c => c && !CATEGORY_ORDER.includes(c))
  )];
  const allCategories = [...issueCategories, ...extraCategories];

  // featured = explicitly marked, or fallback to first w/ cover img
  const featured = issueArticles.find(a => a.isFeatured) ?? issueArticles.find(a => !!a.coverImageUrl) ?? null;

  // everything else
  const secondaryAll = issueArticles.filter(a => a.id !== featured?.id);

  // filter by category
  const visibleSecondaries = selectedCategory === "All"
    ? secondaryAll
    : secondaryAll.filter(a => (a.category ?? "News") === selectedCategory);

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    setSelectedCategory("All");
  };

  const stripMd = (s: string) =>
    // regex on regex to strip markdown. absolute dogshit but brendan eich left us no choice
    s.replace(/[#*`_\[\]]/g, "").replace(/!\[.*?\]\(.*?\)/g, "").trim();

  const listItems = selectedCategory === "All"
    ? visibleSecondaries
    : [...(featured && (featured.category ?? "News") === selectedCategory ? [featured] : []), ...visibleSecondaries];

  const sideHustleCount = 4;
  const isSplitLayout = !!featured && selectedCategory === "All";
  const sideArticles = isSplitLayout ? listItems.slice(0, sideHustleCount) : listItems;
  const bottomArticles = isSplitLayout ? listItems.slice(sideHustleCount) : [];

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex justify-center">
        <div className="animate-pulse flex flex-col items-center w-full max-w-5xl">
          <div className="h-16 w-3/4 bg-border/40 rounded mt-12 mb-6"></div>
          <div className="h-4 w-1/2 bg-border/40 rounded mb-10"></div>
          <div className="h-8 w-full bg-border/40 rounded mb-10"></div>
          <div className="grid grid-cols-12 gap-10 w-full">
            <div className="col-span-7 space-y-4">
              <div className="h-10 w-3/4 bg-border/40 rounded"></div>
              <div className="h-6 w-full bg-border/40 rounded"></div>
              <div className="h-64 w-full bg-border/40 rounded"></div>
            </div>
            <div className="col-span-5 space-y-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 w-full bg-border/40 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 animate-in fade-in duration-700">

      {/* ── Masthead ─────────────────────────────────────── */}
      <div className="text-center mb-12 border-b border-border pb-10">
        <h1 className="font-serif text-5xl md:text-7xl font-bold tracking-tighter text-foreground mb-4">
          The Commonwealth Newspaper
        </h1>
        {allPeriods.length > 0 && (
          <div className="flex items-center justify-center gap-2 mt-3">
            <span className="font-sans text-xs uppercase tracking-widest text-gray-400 font-bold">Issue:</span>
            <select
              className="font-sans text-xs uppercase tracking-widest font-bold text-foreground bg-background border border-border rounded px-3 py-1.5 focus:outline-none focus:border-accent cursor-pointer transition-colors"
              value={selectedPeriod}
              onChange={(e) => handlePeriodChange(e.target.value)}
            >
              {allPeriods.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {articles.length === 0 ? (
        <div className="text-center py-24">
          <h3 className="font-serif text-3xl text-foreground mb-4">The press is quiet.</h3>
          <p className="text-gray-500 font-sans tracking-wide">Check back later for the latest news.</p>
        </div>
      ) : (
        <>
          {/* 3 different css hacks to hide a scrollbar. the web was a mistake */}
          {allCategories.length > 0 && (
            <div className="flex items-center gap-0 border-b border-border mb-10 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {["All", ...allCategories].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex-shrink-0 px-5 py-2.5 font-sans text-xs font-bold uppercase tracking-widest transition-colors border-b-2 -mb-px ${selectedCategory === cat
                    ? "border-accent text-accent"
                    : "border-transparent text-gray-400 hover:text-foreground"
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* ── Main Layout: Featured + Secondaries ────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">

            {/* ── Featured Article (Foreign Affairs style) ── */}
            {isSplitLayout && featured && (
              <div className="lg:col-span-7">
                <Link href={`/article/${featured.slug}`} className="group block">
                  {/* Title + subtitle + author ABOVE the image */}
                  <div className="mb-6">
                    <h2 className="font-serif text-4xl lg:text-5xl font-bold text-foreground group-hover:text-accent transition-colors leading-[1.1] tracking-tight mb-4">
                      {featured.title}
                    </h2>
                    <p className="font-serif text-xl text-gray-400 leading-relaxed mb-3 line-clamp-2">
                      {stripMd(featured.content).substring(0, 200)}…
                    </p>
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500 font-sans">
                      {featured.author}
                    </p>
                  </div>

                  {/* Cover image */}
                  {featured.coverImageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={featured.coverImageUrl}
                      alt={`Cover for ${featured.title}`}
                      className="w-full max-h-[420px] object-cover rounded-sm border border-border/30"
                    />
                  )}
                </Link>
              </div>
            )}

            {/* ── Secondary Articles Column ──────────────── */}
            <div className={`${isSplitLayout ? "lg:col-span-5 lg:border-l border-border lg:pl-10" : "lg:col-span-12"} flex flex-col gap-0`}>
              {sideArticles.length === 0 ? (
                <p className="text-gray-500 font-sans text-sm tracking-wide py-10 text-center">No articles in this category for this issue.</p>
              ) : (
                sideArticles.map((article) => {
                  const hasImage = !!article.coverImageUrl;
                  const excerpt = stripMd(article.content).substring(0, 150);
                  return (
                    <Link
                      key={article.id}
                      href={`/article/${article.slug}`}
                      className="group flex gap-4 py-5 border-b border-border/40 last:border-0 items-start"
                    >
                      {/* Text side */}
                      <div className="flex-1 min-w-0">
                        {article.category && (
                          <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-accent block mb-1">
                            {article.category}
                          </span>
                        )}
                        <h3 className="font-serif text-xl font-bold text-foreground group-hover:text-accent transition-colors leading-snug tracking-tight mb-1 line-clamp-2">
                          {article.title}
                        </h3>
                        <p className="font-serif text-gray-500 text-sm leading-relaxed line-clamp-2 mb-1.5 hidden sm:block">
                          {excerpt}…
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-sans">
                          {article.author}
                        </p>
                      </div>

                      {/* Thumbnail */}
                      {hasImage && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={article.coverImageUrl!}
                          alt=""
                          className="w-24 h-20 sm:w-28 sm:h-24 object-cover rounded-sm border border-border/30 flex-shrink-0"
                        />
                      )}
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Bottom Articles Rows ─────────────────────── */}
          {bottomArticles.length > 0 && (
            <div className="mt-14 pt-10 border-t border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 gap-y-12">
              {bottomArticles.map((article) => {
                const hasImage = !!article.coverImageUrl;
                const excerpt = stripMd(article.content).substring(0, 150);
                return (
                  <Link
                    key={article.id}
                    href={`/article/${article.slug}`}
                    className="group flex flex-col gap-3"
                  >
                    {hasImage && (
                      <div className="mb-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={article.coverImageUrl!}
                          alt=""
                          className="w-full h-48 object-cover rounded-sm border border-border/30"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {article.category && (
                        <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-accent block mb-1.5">
                          {article.category}
                        </span>
                      )}
                      <h3 className="font-serif text-xl font-bold text-foreground group-hover:text-accent transition-colors leading-snug tracking-tight mb-2 line-clamp-3">
                        {article.title}
                      </h3>
                      <p className="font-serif text-gray-500 text-sm leading-relaxed line-clamp-3 mb-2.5">
                        {excerpt}…
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-sans">
                        {article.author}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* ── Archive link ───────────────────────────────── */}
          <div className="mt-16 pt-8 border-t border-border">
            <Link
              href="/archive"
              className="group flex items-center justify-between text-sm font-bold uppercase tracking-widest text-foreground hover:text-accent transition-colors font-sans"
            >
              <span>Explore the Archive</span>
              <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </>
      )
      }
    </div >
  );
}
