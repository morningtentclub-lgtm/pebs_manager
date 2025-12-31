'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import SignOutButton from './SignOutButton';

export default function Navigation() {
  const pathname = usePathname();

  // Don't show navigation on login page
  if (pathname === '/login') {
    return null;
  }

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(path);
  };

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-[--border]">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[80px]">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="flex items-center gap-3">
              <Image
                src="/PEBS_logo.png"
                alt="PEBS"
                width={104}
                height={32}
                className="h-8 w-auto"
                priority
              />
              <span className="text-[13px] font-semibold tracking-[0.3em] text-gray-500">
                DESK
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className={`text-[15px] font-semibold transition-colors ${
                isActive('/') && !isActive('/payments')
                  ? 'text-black'
                  : 'text-gray-500 hover:text-black'
              }`}
            >
              프로젝트
            </Link>
            <Link
              href="/payments"
              className={`text-[15px] font-semibold transition-colors ${
                isActive('/payments')
                  ? 'text-black'
                  : 'text-gray-500 hover:text-black'
              }`}
            >
              지급 내역
            </Link>
            <Link
              href="/books"
              className={`text-[15px] font-semibold transition-colors ${
                isActive('/books')
                  ? 'text-black'
                  : 'text-gray-500 hover:text-black'
              }`}
            >
              도서지원
            </Link>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            <SignOutButton className="text-[14px] font-medium text-gray-600 hover:text-black transition-colors px-4 py-2" />
          </div>
        </div>
      </div>
    </nav>
  );
}
