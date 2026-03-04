"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Menu, X, User } from "lucide-react";
import { useState, useEffect } from "react";
import Image from "next/image";

export default function Navbar() {
    const { user, userData, signInWithGoogle, signOut, loading } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;

            // scrolling down past top strip = hide
            if (currentScrollY > lastScrollY && currentScrollY > 60) {
                setIsVisible(false);
            } else {
                // scrolling up = show
                setIsVisible(true);
            }
            setLastScrollY(currentScrollY);
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, [lastScrollY]);

    return (
        <nav
            className={`bg-background/95 backdrop-blur-md shadow-md border-b-2 border-border/60 sticky top-0 z-50 transition-transform duration-300 ease-in-out ${isVisible ? "translate-y-0" : "-translate-y-full"
                }`}
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Top strip for auth and meta */}
                <div className="h-8 flex items-center justify-between border-b border-border/50 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    <div className="hidden sm:block">
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>

                    <div className="flex items-center space-x-6 ml-auto">
                        {loading ? (
                            <div className="h-4 w-16 bg-border animate-pulse rounded"></div>
                        ) : user ? (
                            <div className="flex items-center space-x-4">
                                <span className="text-foreground">
                                    {user.displayName?.split(" ")[0]}
                                </span>
                                <button
                                    onClick={signOut}
                                    className="hover:text-foreground transition-colors"
                                >
                                    LOGOUT
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={signInWithGoogle}
                                className="flex items-center hover:text-foreground transition-colors"
                            >
                                <User className="w-3 h-3 mr-1.5" />
                                SIGN IN
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Branding & Navigation */}
                <div className="flex flex-col items-center py-4 sm:py-5 overflow-hidden">
                    <Link href="/" className="mb-4 focus:outline-none flex items-center justify-center group space-x-3">
                        <img
                            src="/ICON.png"
                            alt="The Commonwealth Logo"
                            className="w-10 h-10 sm:w-12 sm:h-12 object-contain transition-transform group-hover:scale-105 flex-shrink-0"
                        />
                        <span className="font-serif font-bold text-3xl sm:text-4xl md:text-5xl tracking-tight text-foreground transition-opacity group-hover:opacity-80 whitespace-nowrap">
                            The Commonwealth
                        </span>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden sm:flex items-center space-x-12 mt-1">
                        <NavLink href="/">Latest News</NavLink>
                        <NavLink href="/archive">Archive</NavLink>

                        {user && (
                            <>
                                <NavLink href="/sudoku">Daily Sudoku</NavLink>
                                <NavLink href="/kenken">KenKen</NavLink>
                                <NavLink href="/blorb">Blorb</NavLink>
                            </>
                        )}

                        {userData?.role === "ADMIN" && (
                            <NavLink href="/admin" className="text-accent border-accent">Admin</NavLink>
                        )}
                    </div>

                    {/* Mobile menu button */}
                    <div className="absolute left-4 top-12 sm:hidden">
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="p-2 text-foreground focus:outline-none"
                        >
                            <span className="sr-only">Open main menu</span>
                            {isMobileMenuOpen ? (
                                <X className="h-6 w-6" aria-hidden="true" />
                            ) : (
                                <Menu className="h-6 w-6" aria-hidden="true" />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu Dropdown */}
            {isMobileMenuOpen && (
                <div className="sm:hidden border-t border-border bg-background animate-in slide-in-from-top-2 absolute w-full shadow-lg">
                    <div className="py-2 space-y-1 px-4">
                        <MobileNavLink href="/" onClick={() => setIsMobileMenuOpen(false)}>Latest News</MobileNavLink>
                        <MobileNavLink href="/archive" onClick={() => setIsMobileMenuOpen(false)}>Archive</MobileNavLink>

                        {user && (
                            <>
                                <MobileNavLink href="/sudoku" onClick={() => setIsMobileMenuOpen(false)}>Daily Sudoku</MobileNavLink>
                                <MobileNavLink href="/kenken" onClick={() => setIsMobileMenuOpen(false)}>KenKen</MobileNavLink>
                                <MobileNavLink href="/blorb" onClick={() => setIsMobileMenuOpen(false)}>Blorb</MobileNavLink>
                            </>
                        )}

                        {userData?.role === "ADMIN" && (
                            <MobileNavLink href="/admin" onClick={() => setIsMobileMenuOpen(false)} className="text-accent">
                                Admin Dashboard
                            </MobileNavLink>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
}

// nav link helpers
function NavLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
    return (
        <Link
            href={href}
            className={`text-xs font-bold uppercase tracking-[0.15em] text-gray-500 hover:text-foreground transition-colors relative group py-1 ${className}`}
        >
            {children}
            <span className="absolute bottom-0 left-0 w-full h-[2px] bg-accent transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"></span>
        </Link>
    );
}

function MobileNavLink({ href, onClick, children, className = "" }: { href: string; onClick: () => void; children: React.ReactNode; className?: string }) {
    return (
        <Link
            href={href}
            onClick={onClick}
            className={`block py-3 text-sm font-bold uppercase tracking-widest border-b border-border text-foreground ${className}`}
        >
            {children}
        </Link>
    );
}
